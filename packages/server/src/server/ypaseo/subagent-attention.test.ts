import { describe, expect, it } from "vitest";
import { deriveAgentStateBucket } from "@getpaseo/protocol/agent-state-bucket";
import { PARENT_AGENT_ID_LABEL } from "@getpaseo/protocol/agent-labels";
import { createTestLogger } from "../../test-utils/test-logger.js";
import type { AgentSnapshotPayload } from "../messages.js";
import { WorkspaceDirectory } from "../workspace-directory.js";
import type { PersistedProjectRecord, PersistedWorkspaceRecord } from "../workspace-registry.js";
import { ypaseoRootRequiresAttention } from "./subagent-attention.js";

type Status = "idle" | "running" | "error";

interface TestAgent {
  id: string;
  status: Status;
  labels: Record<string, string>;
  pendingPermissions?: unknown[];
  requiresAttention?: boolean;
  attentionReason?: "finished" | "error" | "permission" | null;
  archivedAt?: string | null;
}

function child(overrides: Partial<TestAgent> = {}): TestAgent {
  return {
    id: "child",
    status: "idle",
    labels: { [PARENT_AGENT_ID_LABEL]: "parent" },
    requiresAttention: true,
    attentionReason: "finished",
    ...overrides,
  };
}

const parent: TestAgent = { id: "parent", status: "running", labels: {} };

// Mirrors the call in workspace-directory.ts: the root agent's bucket with the YPaseo rule.
function rootBucket(agent: TestAgent, active: TestAgent[]) {
  const activeById = new Map(active.map((entry) => [entry.id, entry] as const));
  return deriveAgentStateBucket({
    status: agent.status,
    pendingPermissionCount: agent.pendingPermissions?.length ?? 0,
    requiresAttention: ypaseoRootRequiresAttention(agent, activeById),
    attentionReason: agent.attentionReason ?? null,
  });
}

describe("ypaseoRootRequiresAttention", () => {
  it("keeps a finished child with an active parent out of Ready to review", () => {
    const agent = child();
    expect(rootBucket(agent, [parent, agent])).toBe("done");
  });

  it("treats a mark without a reason like a finished one", () => {
    const agent = child({ attentionReason: null });
    expect(rootBucket(agent, [parent, agent])).toBe("done");
  });

  it("still reports a pending permission as needs_input", () => {
    const agent = child({ attentionReason: "permission", pendingPermissions: [{}] });
    expect(rootBucket(agent, [parent, agent])).toBe("needs_input");
  });

  it("still reports an error as failed", () => {
    expect(rootBucket(child({ attentionReason: "error" }), [parent])).toBe("failed");
    expect(rootBucket(child({ status: "error" }), [parent])).toBe("failed");
  });

  it("leaves a running child running", () => {
    expect(rootBucket(child({ status: "running" }), [parent])).toBe("running");
  });

  it("behaves as upstream once the parent is archived or gone", () => {
    const agent = child();
    expect(rootBucket(agent, [{ ...parent, archivedAt: "2026-11-13T00:00:00.000Z" }])).toBe(
      "attention",
    );
    expect(rootBucket(agent, [agent])).toBe("attention");
  });

  it("leaves an agent without a parent unchanged", () => {
    const agent = child({ labels: {} });
    expect(rootBucket(agent, [agent])).toBe("attention");
    expect(rootBucket(child({ labels: {}, requiresAttention: false }), [])).toBe("done");
  });
});

// The hook in workspace-directory.ts: the sidebar bucket the daemon sends for a child's workspace.
describe("WorkspaceDirectory with the YPaseo subagent attention rule", () => {
  const NOW = "2026-03-01T12:00:00.000Z";
  const project: PersistedProjectRecord = {
    projectId: "project-1",
    rootPath: "/repo",
    kind: "git",
    displayName: "repo",
    customName: null,
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
  };
  const workspaces: PersistedWorkspaceRecord[] = ["parent-ws", "child-ws"].map((workspaceId) => ({
    workspaceId,
    projectId: project.projectId,
    cwd: `/repo/${workspaceId}`,
    kind: "worktree",
    displayName: workspaceId,
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
  }));

  function snapshot(
    input: Pick<AgentSnapshotPayload, "id" | "workspaceId" | "status"> &
      Partial<AgentSnapshotPayload>,
  ): AgentSnapshotPayload {
    return {
      provider: "codex",
      cwd: `/repo/${input.workspaceId}`,
      model: null,
      thinkingOptionId: null,
      effectiveThinkingOptionId: null,
      createdAt: NOW,
      updatedAt: NOW,
      lastUserMessageAt: null,
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
      runtimeInfo: { provider: "codex", sessionId: null },
      title: null,
      labels: {},
      requiresAttention: false,
      attentionReason: null,
      attentionTimestamp: null,
      archivedAt: null,
      ...input,
    };
  }

  async function statuses(agents: AgentSnapshotPayload[]) {
    const directory = new WorkspaceDirectory({
      logger: createTestLogger(),
      projectRegistry: { list: async () => [project] },
      workspaceRegistry: { list: async () => workspaces },
      listAgentPayloads: async () => agents,
      workspaceLastUserMessageTimes: async () => new Map(),
      listProviderSubagentActivity: async () => [],
      listTerminalActivityContributions: async () => [],
      isProviderVisibleToClient: () => true,
      buildWorkspaceDescriptor: async ({ workspace }) => ({
        id: workspace.workspaceId,
        projectId: workspace.projectId,
        projectDisplayName: "repo",
        projectCustomName: null,
        projectRootPath: project.rootPath,
        workspaceDirectory: workspace.cwd,
        projectKind: "git",
        workspaceKind: workspace.kind,
        name: workspace.displayName,
        archivingAt: null,
        status: "done",
        activityAt: null,
        diffStat: null,
        scripts: [],
        gitRuntime: null,
        githubRuntime: null,
      }),
    });
    const result = await directory.listFetchEntries({
      type: "fetch_workspaces_request",
      requestId: "ypaseo-subagent-attention",
    });
    return Object.fromEntries(result.entries.map((entry) => [entry.id, entry.status]));
  }

  const finishedChild = snapshot({
    id: "child",
    workspaceId: "child-ws",
    status: "idle",
    labels: { [PARENT_AGENT_ID_LABEL]: "parent" },
    requiresAttention: true,
    attentionReason: "finished",
  });

  it("puts a finished child's workspace in done while its parent is active", async () => {
    const parentAgent = snapshot({ id: "parent", workspaceId: "parent-ws", status: "idle" });
    await expect(statuses([parentAgent, finishedChild])).resolves.toEqual({
      "parent-ws": "done",
      "child-ws": "done",
    });
  });

  it("keeps a failed child's workspace in failed", async () => {
    const parentAgent = snapshot({ id: "parent", workspaceId: "parent-ws", status: "idle" });
    const failedChild = { ...finishedChild, attentionReason: "error" as const };
    await expect(statuses([parentAgent, failedChild])).resolves.toMatchObject({
      "child-ws": "failed",
    });
  });
});
