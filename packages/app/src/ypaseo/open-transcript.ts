// YPaseo fork: see YPASEO.md. "Open transcript" opens the focused agent's provider transcript in
// the owner's editor. The desktop app runs the owner's zsh function for it (see
// packages/desktop/src/ypaseo-open-transcript.ts). Remote agents use a registered Paseo host.
import { invokeDesktopCommand } from "@/desktop/electron/invoke";
import {
  collectAllTabs,
  findPaneById,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-actions";
import type { HostProfile } from "@/types/host-connection";
import { buildWorkspaceTabPersistenceKey, type WorkspaceTabTarget } from "@/workspace-tabs/model";

/** The desktop command; packages/desktop/src/ypaseo-open-transcript.ts handles it. */
export const OPEN_TRANSCRIPT_DESKTOP_COMMAND = "ypaseo_open_transcript";

export type OpenTranscriptUnavailableReason = "not-desktop" | "no-agent" | "unknown-host";

type OpenTranscriptArgs = { agentId: string } & (
  | { host?: never; serverId?: never }
  | { host: string; serverId: string }
);

export type OpenTranscriptTarget =
  | ({ kind: "open" } & OpenTranscriptArgs)
  | { kind: "unavailable"; reason: OpenTranscriptUnavailableReason };

// Fork-only text, in English only (YPASEO.md: no locale files).
export const OPEN_TRANSCRIPT_TEXT = {
  opening: "Opening transcript…",
  openingFrom: (host: string) => `Opening transcript from ${host}…`,
  failed: "Could not open the transcript",
  outdatedDesktop: "This desktop app cannot open transcripts. Update YPaseo.",
  unavailable: {
    "not-desktop": "Opening a transcript needs the desktop app.",
    "no-agent": "Focus an agent tab to open its transcript.",
    "unknown-host": "This agent’s host is missing from the host list.",
  } satisfies Record<OpenTranscriptUnavailableReason, string>,
} as const;

/** The focused pane's tab in a workspace, or null when the workspace has no layout yet. */
export function focusedWorkspaceTabTarget(
  layoutByWorkspace: Readonly<Record<string, WorkspaceLayout | undefined>>,
  workspace: { serverId: string; workspaceId: string } | null,
): WorkspaceTabTarget | null {
  const key = workspace ? buildWorkspaceTabPersistenceKey(workspace) : null;
  const layout = key ? layoutByWorkspace[key] : undefined;
  if (!layout) return null;
  const focusedTabId = findPaneById(layout.root, layout.focusedPaneId)?.focusedTabId ?? null;
  if (!focusedTabId) return null;
  return collectAllTabs(layout.root).find((tab) => tab.tabId === focusedTabId)?.target ?? null;
}

/**
 * Resolves the focused agent and, for a remote workspace, its registered host.
 */
export function resolveOpenTranscriptTarget(input: {
  isDesktop: boolean;
  localServerId: string | null;
  hosts: readonly Pick<HostProfile, "label" | "serverId">[];
  serverId: string | null;
  focusedTarget: WorkspaceTabTarget | null;
}): OpenTranscriptTarget {
  if (!input.isDesktop) return { kind: "unavailable", reason: "not-desktop" };
  if (input.focusedTarget?.kind !== "agent" || !input.serverId) {
    return { kind: "unavailable", reason: "no-agent" };
  }
  const agentId = input.focusedTarget.agentId;
  if (input.localServerId === input.serverId) return { kind: "open", agentId };
  const host = input.hosts.find((candidate) => candidate.serverId === input.serverId);
  if (!host?.label) return { kind: "unavailable", reason: "unknown-host" };
  return { kind: "open", agentId, host: host.label, serverId: host.serverId };
}

/** Asks the desktop app to open the transcript; resolves once the viewer has started. */
export async function requestOpenTranscript(
  { kind: _kind, ...args }: Extract<OpenTranscriptTarget, { kind: "open" }>,
  invoke: typeof invokeDesktopCommand = invokeDesktopCommand,
): Promise<void> {
  await invoke<void>(OPEN_TRANSCRIPT_DESKTOP_COMMAND, args);
}

/** The toast text for a failed request, without Electron's IPC wrapping. */
export function describeOpenTranscriptFailure(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes(`Unknown desktop command: ${OPEN_TRANSCRIPT_DESKTOP_COMMAND}`)) {
    return OPEN_TRANSCRIPT_TEXT.outdatedDesktop;
  }
  const message = raw.replace(/^Error invoking remote method '[^']*': (?:\w*Error: )?/, "").trim();
  return message ? `${OPEN_TRANSCRIPT_TEXT.failed}: ${message}` : OPEN_TRANSCRIPT_TEXT.failed;
}
