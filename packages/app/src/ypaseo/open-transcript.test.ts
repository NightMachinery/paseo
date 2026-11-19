import { describe, expect, it, vi } from "vitest";
import type { WorkspaceLayout } from "@/stores/workspace-layout-actions";
import {
  buildEffectiveBindings,
  buildKeyboardShortcutHelpSections,
  DEFAULT_BINDINGS,
  resolveKeyboardShortcut,
} from "@/keyboard/keyboard-shortcuts";
import { routeKeyboardShortcut } from "@/keyboard/route-shortcut";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";
import {
  describeOpenTranscriptFailure,
  focusedWorkspaceTabTarget,
  OPEN_TRANSCRIPT_DESKTOP_COMMAND,
  OPEN_TRANSCRIPT_TEXT,
  requestOpenTranscript,
  resolveOpenTranscriptTarget,
} from "./open-transcript";
import { OPEN_TRANSCRIPT_ACTION, OPEN_TRANSCRIPT_HELP_ID } from "./open-transcript-shortcut";

const LOCAL = "srv-local";
const REMOTE = "srv-remote";
const hosts = [{ serverId: REMOTE, label: "MacBook Air" }];
const AGENT_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const agentTab: WorkspaceTabTarget = { kind: "agent", agentId: AGENT_ID };

function resolve(overrides: Partial<Parameters<typeof resolveOpenTranscriptTarget>[0]> = {}) {
  return resolveOpenTranscriptTarget({
    isDesktop: true,
    localServerId: LOCAL,
    hosts,
    serverId: LOCAL,
    focusedTarget: agentTab,
    ...overrides,
  });
}

function keyEvent(overrides: { metaKey?: boolean; ctrlKey?: boolean }) {
  return {
    key: "O",
    code: "KeyO",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    repeat: false,
    ...overrides,
  };
}

describe("open transcript target", () => {
  it("opens the focused agent of a workspace on the local host", () => {
    expect(resolve()).toEqual({ kind: "open", agentId: AGENT_ID });
  });

  it.each([LOCAL, null])("resolves a registered remote host with local id %s", (localServerId) => {
    expect(resolve({ serverId: REMOTE, localServerId })).toEqual({
      kind: "open",
      agentId: AGENT_ID,
      host: "MacBook Air",
      serverId: REMOTE,
    });
  });

  it("explains a missing registry entry for a remote host", () => {
    expect(resolve({ serverId: "srv-unknown" })).toEqual({
      kind: "unavailable",
      reason: "unknown-host",
    });
  });

  it.each<[string, WorkspaceTabTarget | null]>([
    ["no focused tab", null],
    ["a terminal", { kind: "terminal", terminalId: "term-1" }],
    ["a draft", { kind: "draft", draftId: "draft-1" }],
    [
      "a provider subagent",
      { kind: "provider_subagent", parentAgentId: AGENT_ID, subagentId: "s" },
    ],
  ])("refuses %s", (_label, focusedTarget) => {
    expect(resolve({ focusedTarget })).toEqual({ kind: "unavailable", reason: "no-agent" });
  });

  it("refuses without an active workspace", () => {
    expect(resolve({ serverId: null })).toEqual({ kind: "unavailable", reason: "no-agent" });
  });

  it("refuses outside the desktop app before looking at the tab", () => {
    expect(resolve({ isDesktop: false, focusedTarget: null })).toEqual({
      kind: "unavailable",
      reason: "not-desktop",
    });
  });

  it("explains every refusal", () => {
    for (const text of Object.values(OPEN_TRANSCRIPT_TEXT.unavailable)) {
      expect(text.length).toBeGreaterThan(0);
    }
  });
});

describe("focused workspace tab", () => {
  const layout = {
    root: {
      kind: "group",
      group: {
        id: "g",
        direction: "horizontal",
        sizes: [0.5, 0.5],
        children: [
          {
            kind: "pane",
            pane: {
              id: "left",
              tabIds: ["t-agent-a"],
              focusedTabId: "t-agent-a",
              tabs: [{ tabId: "t-agent-a", target: { kind: "agent", agentId: "a" }, createdAt: 1 }],
            },
          },
          {
            kind: "pane",
            pane: {
              id: "right",
              tabIds: ["t-term", "t-agent-b"],
              focusedTabId: "t-agent-b",
              tabs: [
                { tabId: "t-term", target: { kind: "terminal", terminalId: "x" }, createdAt: 2 },
                { tabId: "t-agent-b", target: { kind: "agent", agentId: "b" }, createdAt: 3 },
              ],
            },
          },
        ],
      },
    },
    focusedPaneId: "right",
  } as unknown as WorkspaceLayout;
  const layouts = { [`${LOCAL}:ws-1`]: layout };

  it("is the focused pane's focused tab", () => {
    expect(focusedWorkspaceTabTarget(layouts, { serverId: LOCAL, workspaceId: "ws-1" })).toEqual({
      kind: "agent",
      agentId: "b",
    });
  });

  it("is null for a workspace without a layout or no workspace", () => {
    expect(focusedWorkspaceTabTarget(layouts, { serverId: LOCAL, workspaceId: "ws-2" })).toBeNull();
    expect(focusedWorkspaceTabTarget(layouts, null)).toBeNull();
  });
});

describe("open transcript request", () => {
  it("sends only the agent id to the fork's desktop command", async () => {
    const invoke = vi.fn(async () => undefined);
    await requestOpenTranscript({ kind: "open", agentId: AGENT_ID }, invoke as never);
    expect(invoke).toHaveBeenCalledWith(OPEN_TRANSCRIPT_DESKTOP_COMMAND, { agentId: AGENT_ID });
  });

  it("sends the remote label and server id to the desktop command", async () => {
    const invoke = vi.fn(async () => undefined);
    const target = resolve({ serverId: REMOTE });
    if (target.kind !== "open") throw new Error("Expected to open the transcript");
    await requestOpenTranscript(target, invoke as never);
    expect(invoke).toHaveBeenCalledWith(OPEN_TRANSCRIPT_DESKTOP_COMMAND, {
      agentId: AGENT_ID,
      host: "MacBook Air",
      serverId: REMOTE,
    });
    expect(OPEN_TRANSCRIPT_TEXT.openingFrom("MacBook Air")).toBe(
      "Opening transcript from MacBook Air…",
    );
  });

  it("strips Electron's IPC wrapping from a failure", () => {
    expect(
      describeOpenTranscriptFailure(
        new Error("Error invoking remote method 'paseo:invoke': Error: spawn zsh ENOENT"),
      ),
    ).toBe(`${OPEN_TRANSCRIPT_TEXT.failed}: spawn zsh ENOENT`);
  });

  it("asks for an update when the desktop app predates the command", () => {
    expect(
      describeOpenTranscriptFailure(
        new Error(
          `Error invoking remote method 'paseo:invoke': Error: Unknown desktop command: ${OPEN_TRANSCRIPT_DESKTOP_COMMAND}`,
        ),
      ),
    ).toBe(OPEN_TRANSCRIPT_TEXT.outdatedDesktop);
  });
});

describe("open transcript shortcut", () => {
  const context = { focusScope: "message-input" as const, commandCenterOpen: false };

  function matchAction(input: {
    isMac: boolean;
    event: ReturnType<typeof keyEvent>;
    bindings?: typeof DEFAULT_BINDINGS;
  }) {
    return resolveKeyboardShortcut({
      event: input.event,
      context: { ...context, isMac: input.isMac, usesDesktopBindings: true },
      chordState: { candidateIndices: [], step: 0, timeoutId: null },
      onChordReset: () => {},
      bindings: input.bindings ?? DEFAULT_BINDINGS,
    }).match?.action;
  }

  // These replace upstream's "does not keep old Cmd/Ctrl+Shift+O open-project binding" cases.
  it("is Cmd+Shift+O on macOS and Ctrl+Shift+O elsewhere (not Open project), even while typing", () => {
    expect(matchAction({ isMac: true, event: keyEvent({ metaKey: true }) })).toBe(
      OPEN_TRANSCRIPT_ACTION,
    );
    expect(matchAction({ isMac: false, event: keyEvent({ ctrlKey: true }) })).toBe(
      OPEN_TRANSCRIPT_ACTION,
    );
  });

  it("can be rebound like any other shortcut", () => {
    const bindings = buildEffectiveBindings({
      "ypaseo-open-transcript-cmd-shift-o-mac": "Cmd+Alt+Y",
    });
    expect(matchAction({ isMac: true, event: keyEvent({ metaKey: true }), bindings })).not.toBe(
      OPEN_TRANSCRIPT_ACTION,
    );
    expect(
      matchAction({
        isMac: true,
        bindings,
        event: {
          ...keyEvent({ metaKey: true }),
          shiftKey: false,
          altKey: true,
          key: "y",
          code: "KeyY",
        },
      }),
    ).toBe(OPEN_TRANSCRIPT_ACTION);
  });

  it("is listed in the shortcuts help", () => {
    const rows = buildKeyboardShortcutHelpSections({ isMac: true, usesDesktopBindings: true })
      .flatMap((section) => section.rows)
      .filter((row) => row.id === OPEN_TRANSCRIPT_HELP_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe("Open transcript");
  });

  it("routes to the dispatcher as a global action", () => {
    expect(
      routeKeyboardShortcut(
        { action: OPEN_TRANSCRIPT_ACTION, payload: null },
        {
          pathname: "/",
          isMobile: false,
          sidebarShortcutTargets: [],
          navigationActiveWorkspace: null,
          commandCenterOpen: false,
          shortcutsDialogOpen: false,
        },
      ),
    ).toEqual({ kind: "dispatch", action: { id: OPEN_TRANSCRIPT_ACTION, scope: "global" } });
  });
});
