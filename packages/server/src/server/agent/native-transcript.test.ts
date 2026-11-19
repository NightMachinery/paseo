import { appendFile, mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MAX_NATIVE_TRANSCRIPT_CHUNK_BYTES as CHUNK_BYTES } from "@getpaseo/protocol/messages";
import { NativeTranscriptSnapshots } from "./native-transcript.js";
import {
  resolveClaudeNativeTranscript,
  resolveCodexNativeTranscript,
} from "./native-transcript-source.js";

const nativeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "native-transcript-"));
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

async function fixture(name: string, data: string | Buffer) {
  const file = join(home, name);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, data);
  return file;
}

test("resolves Claude from its configured projects root after its cwd moved", async () => {
  const file = await fixture("projects/original/" + nativeId + ".jsonl", "original");
  const result = await resolveClaudeNativeTranscript(
    {
      cwd: join(home, "moved"),
      persistence: { provider: "claude", sessionId: nativeId },
    },
    home,
  );
  expect(result).toEqual({ provider: "claude", root: join(home, "projects"), file });
});

test.each(["sessions/2026/11/19", "archived_sessions"])(
  "resolves Codex from %s",
  async (directory) => {
    const file = await fixture(
      directory + "/rollout-2026-11-19T00-00-00-" + nativeId + ".jsonl",
      "rollout",
    );
    const agent = {
      cwd: home,
      persistence: { provider: "codex", sessionId: "ignored", metadata: { threadId: nativeId } },
    };
    expect(await resolveCodexNativeTranscript(agent, home)).toMatchObject({
      provider: "codex",
      file,
    });
  },
);

test("limits each chunk and reads only the size observed before growth", async () => {
  const data = Buffer.alloc(CHUNK_BYTES + 3, 255);
  const file = await fixture("projects/original/session.jsonl", data);
  const snapshots = new NativeTranscriptSnapshots();
  const lookup = vi.fn(async () => ({
    provider: "claude" as const,
    root: join(home, "projects"),
    file,
  }));
  const request = { agentId: "agent", offset: 0, maxBytes: CHUNK_BYTES };
  const first = await snapshots.read(request, lookup);
  expect(first).toMatchObject({ size: data.length, offset: 0, eof: false });
  expect(Buffer.from(first.data, "base64").equals(data.subarray(0, CHUNK_BYTES))).toBe(true);
  await appendFile(file, "after the snapshot");
  const continuation = { ...request, offset: CHUNK_BYTES, snapshotId: first.snapshotId };
  await expect(new NativeTranscriptSnapshots().read(continuation, lookup)).rejects.toThrow(
    /expired or is invalid/,
  );
  const next = await snapshots.read(continuation, lookup);
  expect(next).toMatchObject({
    size: data.length,
    mtimeMs: first.mtimeMs,
    offset: CHUNK_BYTES,
    eof: true,
  });
  expect(Buffer.from(next.data, "base64")).toEqual(data.subarray(CHUNK_BYTES));
  expect(lookup).toHaveBeenCalledTimes(1);
});

test("rejects a replaced transcript during continuation", async () => {
  const file = await fixture("projects/original/session.jsonl", "old");
  const snapshots = new NativeTranscriptSnapshots();
  const lookup = async () => ({ provider: "claude" as const, root: join(home, "projects"), file });
  const request = { agentId: "agent", offset: 0, maxBytes: 1 };
  const first = await snapshots.read(request, lookup);
  await rename(file, file + ".old");
  await writeFile(file, "new");
  await expect(
    snapshots.read({ ...request, offset: 1, snapshotId: first.snapshotId }, lookup),
  ).rejects.toThrow(/changed during download/);
});

test("rejects non-session IDs and transcript symlinks outside the provider store", async () => {
  const agent = { cwd: home, persistence: { provider: "claude", sessionId: "../example" } };
  await expect(resolveClaudeNativeTranscript(agent, home)).rejects.toThrow(
    /no native transcript session ID/,
  );
  const outside = await fixture("outside/" + nativeId + ".jsonl", "outside");
  const project = join(home, "projects", "original");
  await mkdir(project, { recursive: true });
  await symlink(outside, join(project, nativeId + ".jsonl"));
  agent.persistence.sessionId = nativeId;
  await expect(
    new NativeTranscriptSnapshots().read({ agentId: "agent", offset: 0, maxBytes: 1 }, () =>
      resolveClaudeNativeTranscript(agent, home),
    ),
  ).rejects.toThrow(/leaves its provider directory/);
});
