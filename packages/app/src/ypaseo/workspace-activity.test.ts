import { describe, expect, it } from "vitest";
import {
  buildWorkspaceActivityItems,
  workspaceAgentCandidates,
  workspaceTerminalCandidates,
  type WorkspaceActivityAgent,
} from "./workspace-activity";

function agent(
  id: string,
  input: Partial<WorkspaceActivityAgent> & { at?: number } = {},
): WorkspaceActivityAgent {
  return {
    id,
    workspaceId: input.workspaceId ?? "ws",
    archivedAt: input.archivedAt ?? null,
    parentAgentId: input.parentAgentId ?? null,
    lastActivityAt: new Date(input.at ?? 0),
  };
}

describe("workspaceAgentCandidates", () => {
  it("keeps the workspace's unarchived agents, children included", () => {
    const candidates = workspaceAgentCandidates({
      workspaceId: "ws",
      agents: [
        agent("root", { at: 10 }),
        agent("child", { at: 20, parentAgentId: "root" }),
        agent("archived", { archivedAt: new Date(5) }),
        agent("elsewhere", { workspaceId: "other" }),
      ],
      isRunning: (id) => id === "child",
    });
    expect(candidates).toEqual([
      {
        target: { kind: "agent", agentId: "root" },
        running: false,
        activityAt: 10,
        isChild: false,
      },
      { target: { kind: "agent", agentId: "child" }, running: true, activityAt: 20, isChild: true },
    ]);
  });

  it("lists nothing without a workspace", () => {
    expect(
      workspaceAgentCandidates({ workspaceId: " ", agents: [agent("a")], isRunning: () => false }),
    ).toEqual([]);
  });
});

describe("workspaceTerminalCandidates", () => {
  it("treats a working terminal as running and dates it by its last activity change", () => {
    expect(
      workspaceTerminalCandidates([
        { id: "t1", activity: { state: "working", changedAt: 30 } },
        { id: "t2", activity: null },
      ]),
    ).toEqual([
      {
        target: { kind: "terminal", terminalId: "t1" },
        running: true,
        activityAt: 30,
        isChild: false,
      },
      {
        target: { kind: "terminal", terminalId: "t2" },
        running: false,
        activityAt: 0,
        isChild: false,
      },
    ]);
  });
});

describe("buildWorkspaceActivityItems", () => {
  const candidates = [
    ...workspaceAgentCandidates({
      workspaceId: "ws",
      agents: [
        agent("old-idle", { at: 1 }),
        agent("new-idle", { at: 50 }),
        agent("old-running", { at: 2 }),
        agent("new-running", { at: 40, parentAgentId: "new-idle" }),
      ],
      isRunning: (id) => id.endsWith("running"),
    }),
    ...workspaceTerminalCandidates([{ id: "term", activity: { state: "idle", changedAt: 50 } }]),
  ];

  it("puts running items first, then the most recently active", () => {
    const items = buildWorkspaceActivityItems({ candidates, openTargets: [], focusedTarget: null });
    expect(items.map((item) => item.key)).toEqual([
      "agent:new-running",
      "agent:old-running",
      "agent:new-idle",
      "terminal:term",
      "agent:old-idle",
    ]);
  });

  it("marks which items have a tab and which one is focused", () => {
    const items = buildWorkspaceActivityItems({
      candidates,
      openTargets: [
        { kind: "agent", agentId: "old-idle" },
        { kind: "terminal", terminalId: "term" },
        { kind: "files" },
      ],
      focusedTarget: { kind: "terminal", terminalId: "term" },
    });
    const byKey = new Map(items.map((item) => [item.key, item]));
    expect(byKey.get("agent:old-idle")).toMatchObject({ isOpen: true, isFocused: false });
    expect(byKey.get("terminal:term")).toMatchObject({ isOpen: true, isFocused: true });
    expect(byKey.get("agent:new-running")).toMatchObject({ isOpen: false, isFocused: false });
  });
});
