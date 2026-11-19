import { EventEmitter } from "node:events";
import type { SpawnOptions } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp") },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn() },
}));

import { createEditorTargetRuntime } from "./features/editor-targets/runtime";
import {
  createOpenTranscriptCommandHandlers,
  OPEN_TRANSCRIPT_COMMAND_NAME,
  openAgentTranscript,
  parseOpenTranscriptArgs,
} from "./ypaseo-open-transcript";

const AGENT_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

function recordingRuntime() {
  const launches: { command: string; args: readonly string[] }[] = [];
  return {
    launches,
    runtime: {
      spawnDetached: async (input: { command: string; args: readonly string[] }) => {
        launches.push(input);
      },
    },
  };
}

describe("YPaseo open transcript", () => {
  it("accepts a UUID and normalizes it to lower case", () => {
    expect(parseOpenTranscriptArgs({ agentId: AGENT_ID })).toBe(AGENT_ID);
    expect(parseOpenTranscriptArgs({ agentId: AGENT_ID.toUpperCase() })).toBe(AGENT_ID);
  });

  it.each([
    ["no arguments", undefined],
    ["no agent id", {}],
    ["a number", { agentId: 42 }],
    ["an empty id", { agentId: "" }],
    ["a short id", { agentId: "0f8fad5b" }],
    ["a trailing newline", { agentId: `${AGENT_ID}\n` }],
    ["shell syntax", { agentId: `${AGENT_ID}; touch /tmp/pwned` }],
    ["a command substitution", { agentId: "$(touch /tmp/pwned)" }],
    ["an option", { agentId: "--help" }],
  ])("rejects %s and starts nothing", async (_label, args) => {
    const { launches, runtime } = recordingRuntime();
    await expect(openAgentTranscript(args, runtime)).rejects.toThrow(/UUID/);
    expect(launches).toEqual([]);
  });

  it("passes the id to the fixed zsh command as a positional parameter", async () => {
    const { launches, runtime } = recordingRuntime();
    await openAgentTranscript({ agentId: AGENT_ID }, runtime);
    expect(launches).toEqual([
      {
        command: "zsh",
        args: ["-lic", 'paseo-view-transcript "$1"', "ypaseo-open-transcript", AGENT_ID],
      },
    ]);
  });

  it("starts the command detached, without output, and without the app's runtime variables", async () => {
    const spawned: { command: string; args: string[]; options: SpawnOptions }[] = [];
    const runtime = createEditorTargetRuntime({
      platform: "darwin",
      env: { PATH: "/usr/bin:/bin", ELECTRON_RUN_AS_NODE: "1", PASEO_DESKTOP_MANAGED: "1" },
      spawn: (command, args, options) => {
        spawned.push({ command, args, options });
        const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
        queueMicrotask(() => child.emit("spawn"));
        return child;
      },
    });

    await openAgentTranscript({ agentId: AGENT_ID }, runtime);

    expect(spawned).toHaveLength(1);
    expect(spawned[0]?.args.at(-1)).toBe(AGENT_ID);
    expect(spawned[0]?.options).toMatchObject({ detached: true, shell: false, stdio: "ignore" });
    expect(spawned[0]?.options.env).toEqual({ PATH: "/usr/bin:/bin" });
  });

  it("reports a spawn failure to the caller", async () => {
    const runtime = {
      spawnDetached: async () => {
        throw new Error("spawn zsh ENOENT");
      },
    };
    await expect(openAgentTranscript({ agentId: AGENT_ID }, runtime)).rejects.toThrow(
      "spawn zsh ENOENT",
    );
  });

  it("registers one desktop command under its fork-only name", () => {
    expect(Object.keys(createOpenTranscriptCommandHandlers())).toEqual([
      OPEN_TRANSCRIPT_COMMAND_NAME,
    ]);
    expect(OPEN_TRANSCRIPT_COMMAND_NAME).toBe("ypaseo_open_transcript");
  });
});
