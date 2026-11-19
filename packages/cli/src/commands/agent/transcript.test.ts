import { describe, expect, it, vi } from "vitest";
import { createPaseoApi, type HostDirectory } from "@getpaseo/client";
import {
  copyNativeTranscript,
  resolveTranscriptDestination,
  runTranscriptCommand,
} from "./transcript.js";
import { connectToDaemon } from "../../utils/client.js";

vi.mock("@getpaseo/client", () => ({ createPaseoApi: vi.fn() }));
vi.mock("../../utils/client.js", () => ({ connectToDaemon: vi.fn() }));

const host: HostDirectory["hosts"][number] = {
  label: "Example Workstation",
  serverId: "srv_example",
  registrationId: "registration",
  enabled: true,
  status: "online",
  source: { id: "fixture", key: "fixture" },
  metadata: {},
  targetDescription: "example",
  lastOnlineAt: null,
  nextRetryAt: null,
  error: null,
};

describe("registered transcript destination", () => {
  const self = { serverId: "srv_local", label: "Local" };
  it("resolves by ID or case-insensitive label", () => {
    const directory = { self, hosts: [host] };
    expect(resolveTranscriptDestination(directory, "srv_example")).toBe("srv_example");
    expect(resolveTranscriptDestination(directory, "example workstation")).toBe("srv_example");
    expect(resolveTranscriptDestination(directory, "Local")).toBe("srv_local");
  });

  it("rejects ambiguous or unknown labels", () => {
    const directory = { self, hosts: [host, { ...host, serverId: "srv_second" }] };
    expect(() => resolveTranscriptDestination(directory, "Example Workstation")).toThrow(
      /ambiguous/,
    );
    expect(() => resolveTranscriptDestination(directory, "Missing")).toThrow(/No registered host/);
  });
});

describe("copyNativeTranscript", () => {
  const snapshot = {
    snapshotId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    provider: "codex" as const,
    fileName: "rollout.jsonl",
    size: 3,
    mtimeMs: 123,
  };

  it("writes decoded bytes in order and advances progress after each write", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({
        ...snapshot,
        data: Buffer.from([1, 255]).toString("base64"),
        offset: 0,
        eof: false,
      })
      .mockResolvedValueOnce({
        ...snapshot,
        data: Buffer.from([0]).toString("base64"),
        offset: 2,
        eof: true,
      });
    const write = vi.fn(async (_data: Buffer) => undefined);
    const progress = vi.fn();
    await copyNativeTranscript(read, "agent", write, progress);
    expect(read).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ offset: 2, snapshotId: snapshot.snapshotId }),
    );
    expect(Buffer.concat(write.mock.calls.map(([data]) => data))).toEqual(Buffer.from([1, 255, 0]));
    expect(progress.mock.calls).toEqual([
      [2, 3],
      [3, 3],
    ]);
  });

  it("rejects an out-of-order chunk before writing it", async () => {
    const read = vi.fn().mockResolvedValue({ ...snapshot, data: "YQ==", offset: 2, eof: false });
    const write = vi.fn();
    await expect(copyNativeTranscript(read, "agent", write, vi.fn())).rejects.toThrow(
      /invalid transcript chunk/,
    );
    expect(write).not.toHaveBeenCalled();
  });
});

describe("agent transcript command", () => {
  it("names the registered host when its daemon lacks transcript download support", async () => {
    const close = vi.fn(async () => {});
    const dispose = vi.fn(async () => {});
    const readNativeTranscript = vi
      .fn()
      .mockRejectedValue(
        Object.assign(
          new Error("The destination daemon does not support native transcript downloads"),
          { code: "NATIVE_TRANSCRIPT_UNSUPPORTED" },
        ),
      );
    const client = vi.fn().mockResolvedValue({ agents: { readNativeTranscript } });
    vi.mocked(connectToDaemon).mockResolvedValue({ close } as Awaited<
      ReturnType<typeof connectToDaemon>
    >);
    vi.mocked(createPaseoApi).mockReturnValue({
      hosts: {
        list: async () => ({ self: { serverId: "srv_local", label: "Local" }, hosts: [host] }),
        client,
      },
      dispose,
    } as ReturnType<typeof createPaseoApi>);

    await expect(
      runTranscriptCommand("agent", {
        daemonTarget: { kind: "instance", home: "/unused" },
        destination: "srv_example",
        progress: true,
      }),
    ).rejects.toMatchObject({
      code: "NATIVE_TRANSCRIPT_UNSUPPORTED",
      message: "Example Workstation runs an older daemon without transcript download; update it",
    });
    expect(client).toHaveBeenCalledWith("srv_example");
    expect(readNativeTranscript).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
