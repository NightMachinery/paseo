import { describe, expect, it } from "vitest";
import type { Agent } from "@/stores/session-store";
import { buildWorkspaceAgentActivityIndex } from "@/utils/workspace-agent-activity";

function agent(input: Partial<Agent> & Pick<Agent, "id" | "workspaceId">): Agent {
  return {
    serverId: "host-a",
    provider: "codex",
    status: "idle",
    turn: { phase: "idle", cancellationRequestId: null },
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:01:00.000Z"),
    lastUserMessageAt: null,
    lastActivityAt: new Date("2026-01-01T00:01:00.000Z"),
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: true,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    },
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    title: null,
    cwd: "/repo",
    model: null,
    attentionTimestamp: null,
    archivedAt: null,
    parentAgentId: null,
    labels: {},
    ...input,
  };
}

const parent = agent({ id: "parent", workspaceId: "parent-ws" });

function finishedChild(overrides: Partial<Agent> = {}): Agent {
  return agent({
    id: "child",
    workspaceId: "child-ws",
    parentAgentId: "parent",
    requiresAttention: true,
    attentionReason: "finished",
    ...overrides,
  });
}

function childWorkspaceStatus(agents: Agent[]) {
  const index = buildWorkspaceAgentActivityIndex(new Map(agents.map((entry) => [entry.id, entry])));
  return index.get("child-ws")?.status;
}

describe("YPaseo subagent attention in the workspace activity index", () => {
  it("does not mark a finished child's workspace for review while its parent is active", () => {
    expect(childWorkspaceStatus([parent, finishedChild()])).toBe("done");
  });

  it("still reports a child's pending permission and error", () => {
    expect(
      childWorkspaceStatus([
        parent,
        finishedChild({
          attentionReason: "permission",
          pendingPermissions: [
            { id: "permission-0", provider: "codex", name: "shell", kind: "tool", input: {} },
          ],
        }),
      ]),
    ).toBe("needs_input");
    expect(childWorkspaceStatus([parent, finishedChild({ attentionReason: "error" })])).toBe(
      "failed",
    );
  });

  it("marks the workspace for review once the parent is archived", () => {
    const archivedParent = { ...parent, archivedAt: new Date("2026-01-01T00:02:00.000Z") };
    expect(childWorkspaceStatus([archivedParent, finishedChild()])).toBe("attention");
  });

  it("leaves a root agent without a parent unchanged", () => {
    expect(childWorkspaceStatus([finishedChild({ parentAgentId: null })])).toBe("attention");
  });
});
