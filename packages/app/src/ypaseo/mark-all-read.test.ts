import { describe, expect, it } from "vitest";
import {
  markWorkspacesRead,
  workspaceIdsByServer,
  type WorkspaceAttentionClient,
} from "./mark-all-read";

const rows = [
  { serverId: "host-a", workspaceId: "ws-1" },
  { serverId: "host-b", workspaceId: "ws-2" },
  { serverId: "host-a", workspaceId: "ws-3" },
  { serverId: "host-a", workspaceId: "ws-1" },
];

class RecordingClient implements WorkspaceAttentionClient {
  readonly calls: string[][] = [];
  constructor(private readonly failure: Error | null = null) {}
  async clearWorkspaceAttention(workspaceIds: string[]): Promise<void> {
    this.calls.push(workspaceIds);
    if (this.failure) throw this.failure;
  }
}

describe("workspaceIdsByServer", () => {
  it("collects each host's workspaces once, in row order", () => {
    expect(workspaceIdsByServer(rows)).toEqual(
      new Map([
        ["host-a", ["ws-1", "ws-3"]],
        ["host-b", ["ws-2"]],
      ]),
    );
  });

  it("is empty for an empty group", () => {
    expect(workspaceIdsByServer([]).size).toBe(0);
  });
});

describe("markWorkspacesRead", () => {
  it("sends one request per host with that host's workspaces", async () => {
    const clients = { "host-a": new RecordingClient(), "host-b": new RecordingClient() };
    await markWorkspacesRead(rows, (serverId) => clients[serverId as keyof typeof clients]);
    expect(clients["host-a"].calls).toEqual([["ws-1", "ws-3"]]);
    expect(clients["host-b"].calls).toEqual([["ws-2"]]);
  });

  it("still clears the reachable hosts when one host fails, then reports the failure", async () => {
    const reachable = new RecordingClient();
    const failing = new RecordingClient(new Error("daemon refused"));
    await expect(
      markWorkspacesRead(rows, (serverId) => (serverId === "host-a" ? failing : reachable)),
    ).rejects.toThrow("daemon refused");
    expect(reachable.calls).toEqual([["ws-2"]]);
  });

  it("reports a host without a client", async () => {
    const reachable = new RecordingClient();
    await expect(
      markWorkspacesRead(rows, (serverId) => (serverId === "host-b" ? reachable : null)),
    ).rejects.toThrow("Host host-a is not connected");
    expect(reachable.calls).toEqual([["ws-2"]]);
  });
});
