// YPaseo fork: see YPASEO.md. The workspace activity menu on the tab strip lists every agent
// and terminal in a workspace, including those without an open tab, so a workspace that shows
// "working" in the sidebar can be traced to whatever is actually working.
// Upstream: getpaseo/paseo Discussion #9062.
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";
import { normalizeWorkspaceOpaqueId } from "@/utils/workspace-identity";

export type WorkspaceActivityTarget =
  | { kind: "agent"; agentId: string }
  | { kind: "terminal"; terminalId: string };

/** One agent or terminal, as the menu needs it. */
export interface WorkspaceActivityCandidate {
  target: WorkspaceActivityTarget;
  /** In a turn (agent) or producing output (terminal). */
  running: boolean;
  /** Epoch milliseconds of the last activity; 0 when unknown. */
  activityAt: number;
  /** An agent another agent launched. */
  isChild: boolean;
}

export interface WorkspaceActivityItem extends WorkspaceActivityCandidate {
  key: string;
  /** Has a tab somewhere in the workspace's panes. */
  isOpen: boolean;
  /** Is the tab shown in the focused pane. */
  isFocused: boolean;
}

export interface WorkspaceActivityAgent {
  id: string;
  workspaceId?: string;
  archivedAt?: Date | null;
  parentAgentId: string | null;
  lastActivityAt: Date;
}

export interface WorkspaceActivityTerminal {
  id: string;
  activity?: { state: string; changedAt: number } | null;
}

/** The workspace's unarchived agents. `isRunning` decides from live turn state. */
export function workspaceAgentCandidates(input: {
  workspaceId: string;
  agents: Iterable<WorkspaceActivityAgent>;
  isRunning: (agentId: string) => boolean;
}): WorkspaceActivityCandidate[] {
  const workspaceId = normalizeWorkspaceOpaqueId(input.workspaceId);
  if (!workspaceId) return [];
  const candidates: WorkspaceActivityCandidate[] = [];
  for (const agent of input.agents) {
    if (agent.archivedAt) continue;
    if (normalizeWorkspaceOpaqueId(agent.workspaceId) !== workspaceId) continue;
    candidates.push({
      target: { kind: "agent", agentId: agent.id },
      running: input.isRunning(agent.id),
      activityAt: agent.lastActivityAt.getTime(),
      isChild: Boolean(agent.parentAgentId),
    });
  }
  return candidates;
}

export function workspaceTerminalCandidates(
  terminals: readonly WorkspaceActivityTerminal[],
): WorkspaceActivityCandidate[] {
  return terminals.map((terminal) => ({
    target: { kind: "terminal", terminalId: terminal.id },
    running: terminal.activity?.state === "working",
    activityAt: terminal.activity?.changedAt ?? 0,
    isChild: false,
  }));
}

function targetKey(target: WorkspaceActivityTarget | WorkspaceTabTarget): string | null {
  if (target.kind === "agent") return `agent:${target.agentId}`;
  if (target.kind === "terminal") return `terminal:${target.terminalId}`;
  return null;
}

/**
 * Running first, then by most recent activity. Ties keep agents before terminals and are
 * otherwise stable, so the menu does not reshuffle while nothing changes.
 */
export function buildWorkspaceActivityItems(input: {
  candidates: readonly WorkspaceActivityCandidate[];
  openTargets: readonly WorkspaceTabTarget[];
  focusedTarget: WorkspaceTabTarget | null;
}): WorkspaceActivityItem[] {
  const openKeys = new Set(input.openTargets.map(targetKey).filter((key) => key !== null));
  const focusedKey = input.focusedTarget ? targetKey(input.focusedTarget) : null;
  const items = input.candidates.map((candidate, index) => {
    const key = targetKey(candidate.target) ?? `unknown:${index}`;
    return {
      item: {
        ...candidate,
        key,
        isOpen: openKeys.has(key),
        isFocused: key === focusedKey,
      },
      index,
    };
  });
  items.sort((a, b) => {
    if (a.item.running !== b.item.running) return a.item.running ? -1 : 1;
    if (a.item.activityAt !== b.item.activityAt) return b.item.activityAt - a.item.activityAt;
    if (a.item.target.kind !== b.item.target.kind) return a.item.target.kind === "agent" ? -1 : 1;
    return a.index - b.index;
  });
  return items.map(({ item }) => item);
}
