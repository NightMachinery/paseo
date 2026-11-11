// YPaseo fork: see YPASEO.md. A tab-strip menu listing every agent and terminal in the workspace,
// running first and then by last activity; choosing one opens its tab, or focuses it if it is
// already open. Upstream: getpaseo/paseo Discussion #9062.
import { useCallback, useMemo, type ReactElement } from "react";
import { Activity } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import { useShallow } from "zustand/shallow";
import type { ListTerminalsResponse } from "@getpaseo/protocol/messages";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuHint,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useMenuContext } from "@/components/ui/menu";
import { ToolbarButton, ToolbarControls } from "@/components/ui/pane-content-toolbar";
import { workspaceTerminalsPushRoute } from "@/data/push-router";
import { useReplicaQuery } from "@/data/query";
import { useCompactTimeAgo } from "@/hooks/use-time-ago";
import {
  WorkspaceTabIcon,
  WorkspaceTabPresentationResolver,
  type WorkspaceTabPresentation,
} from "@/screens/workspace/workspace-tab-presentation";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import { buildTerminalsQueryKey } from "@/screens/workspace/terminals/state";
import { selectAgentTurnPresentation, useSessionStore } from "@/stores/session-store";
import { useWorkspaceDirectory } from "@/stores/session-store-hooks";
import {
  collectAllTabs,
  FOCUSED_PANE_PLACEMENT,
  findPaneById,
} from "@/stores/workspace-layout-actions";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import type { Theme } from "@/styles/theme";
import { buildDeterministicWorkspaceTabId } from "@/workspace-tabs/identity";
import { buildWorkspaceTabPersistenceKey, type WorkspaceTabTarget } from "@/workspace-tabs/model";
import { revealWorkspaceTab } from "@/workspace-tabs/navigation";
import {
  buildWorkspaceActivityItems,
  workspaceAgentCandidates,
  workspaceTerminalCandidates,
  type WorkspaceActivityCandidate,
  type WorkspaceActivityItem,
} from "./workspace-activity";

type ListTerminalsPayload = ListTerminalsResponse["payload"];

// Fork-only text, in English only (YPASEO.md: no locale files).
const MENU_LABEL = "Agents and terminals";
const EMPTY_TEXT = "No agents or terminals in this workspace";

const MENU_WIDTH = 340;
const MENU_MAX_HEIGHT = 480;

const ThemedActivity = withUnistyles(Activity);
const extraMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundExtraMuted });
const EMPTY_TARGETS: WorkspaceTabTarget[] = [];

export function WorkspaceActivityMenu({
  serverId,
  workspaceId,
}: {
  serverId: string;
  workspaceId: string;
}): ReactElement | null {
  if (!serverId || !workspaceId) return null;
  return (
    <ToolbarControls>
      <DropdownMenu>
        <ToolbarButton kind="menu" label={MENU_LABEL} testID="ypaseo-workspace-activity-button">
          <ThemedActivity size={14} uniProps={extraMutedColorMapping} />
        </ToolbarButton>
        <DropdownMenuContent
          side="bottom"
          align="end"
          offset={4}
          width={MENU_WIDTH}
          maxHeight={MENU_MAX_HEIGHT}
          scrollable
          sheetTitle={MENU_LABEL}
          testID="ypaseo-workspace-activity-menu"
        >
          <WorkspaceActivityMenuBody serverId={serverId} workspaceId={workspaceId} />
        </DropdownMenuContent>
      </DropdownMenu>
    </ToolbarControls>
  );
}

/** Reads the stores only while the menu is open. */
function WorkspaceActivityMenuBody(props: {
  serverId: string;
  workspaceId: string;
}): ReactElement | null {
  const { open } = useMenuContext("WorkspaceActivityMenuBody");
  return open ? <WorkspaceActivityList {...props} /> : null;
}

function useWorkspaceTerminals(serverId: string, workspaceId: string) {
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const workspaceDirectory = useWorkspaceDirectory(serverId, workspaceId);
  const enabled = Boolean(client && workspaceDirectory);
  // The workspace screen's own query (key, push route and fetch), so the cache and its live
  // updates are shared with it.
  const query = useReplicaQuery({
    queryKey: buildTerminalsQueryKey(serverId, workspaceDirectory, workspaceId),
    enabled,
    pushEvent: "terminals_changed",
    meta: workspaceTerminalsPushRoute({
      enabled,
      serverId,
      cwd: workspaceDirectory ?? "",
      workspaceId,
    }),
    queryFn: async (): Promise<ListTerminalsPayload> => {
      if (!client || !workspaceDirectory) {
        throw new Error("Workspace directory not found");
      }
      return await client.listTerminals(workspaceDirectory, undefined, { workspaceId });
    },
  });
  return query.data?.terminals;
}

function useOpenAndFocusedTargets(workspaceKey: string | null): {
  openTargets: WorkspaceTabTarget[];
  focusedTarget: WorkspaceTabTarget | null;
} {
  const layout = useWorkspaceLayoutStore((state) =>
    workspaceKey ? state.layoutByWorkspace[workspaceKey] : undefined,
  );
  return useMemo(() => {
    if (!layout) return { openTargets: EMPTY_TARGETS, focusedTarget: null };
    const tabs = collectAllTabs(layout.root);
    const focusedTabId = findPaneById(layout.root, layout.focusedPaneId)?.focusedTabId ?? null;
    return {
      openTargets: tabs.map((tab) => tab.target),
      focusedTarget: tabs.find((tab) => tab.tabId === focusedTabId)?.target ?? null,
    };
  }, [layout]);
}

function WorkspaceActivityList({
  serverId,
  workspaceId,
}: {
  serverId: string;
  workspaceId: string;
}): ReactElement {
  const workspaceKey = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
  // The session store updates on every stream tick. Serialized rows let useShallow see that
  // nothing this menu shows changed, so it does not re-render while agents stream.
  const agentCandidates = useSessionStore(
    useShallow((state) => {
      const session = state.sessions[serverId];
      if (!session) return [];
      return workspaceAgentCandidates({
        workspaceId,
        agents: session.agents.values(),
        isRunning: (agentId) => selectAgentTurnPresentation(session, agentId).isActive,
      }).map((candidate) => JSON.stringify(candidate));
    }),
  );
  const terminals = useWorkspaceTerminals(serverId, workspaceId);
  const { openTargets, focusedTarget } = useOpenAndFocusedTargets(workspaceKey);
  const items = useMemo(
    () =>
      buildWorkspaceActivityItems({
        candidates: [
          ...agentCandidates.map((json) => JSON.parse(json) as WorkspaceActivityCandidate),
          ...workspaceTerminalCandidates(terminals ?? []),
        ],
        openTargets,
        focusedTarget,
      }),
    [agentCandidates, terminals, openTargets, focusedTarget],
  );

  const openItem = useCallback(
    (item: WorkspaceActivityItem) => {
      if (!workspaceKey) return;
      const tabId = useWorkspaceLayoutStore.getState().openTab({
        workspaceKey,
        target: item.target,
        intent: "reveal",
        placement: FOCUSED_PANE_PLACEMENT,
      });
      revealWorkspaceTab(workspaceKey, tabId);
    },
    [workspaceKey],
  );

  if (items.length === 0) {
    return <DropdownMenuHint>{EMPTY_TEXT}</DropdownMenuHint>;
  }
  return (
    <>
      {items.map((item) => (
        <WorkspaceActivityRow
          key={item.key}
          item={item}
          serverId={serverId}
          workspaceId={workspaceId}
          onOpen={openItem}
        />
      ))}
    </>
  );
}

function describeItem(input: { item: WorkspaceActivityItem; subtitle: string; ago: string }) {
  const parts = [input.subtitle];
  if (input.item.isChild) parts.push("subagent");
  if (!input.item.isOpen) parts.push("no tab");
  if (input.item.activityAt > 0) parts.push(input.ago);
  return parts.join(" · ");
}

function WorkspaceActivityRow({
  item,
  serverId,
  workspaceId,
  onOpen,
}: {
  item: WorkspaceActivityItem;
  serverId: string;
  workspaceId: string;
  onOpen: (item: WorkspaceActivityItem) => void;
}): ReactElement {
  const tab = useMemo<WorkspaceTabDescriptor>(() => {
    const tabId = buildDeterministicWorkspaceTabId(item.target);
    return { key: tabId, tabId, kind: item.target.kind, target: item.target };
  }, [item.target]);
  const ago = useCompactTimeAgo(item.activityAt > 0 ? new Date(item.activityAt) : null);
  const handleSelect = useCallback(() => onOpen(item), [item, onOpen]);
  return (
    <WorkspaceTabPresentationResolver tab={tab} serverId={serverId} workspaceId={workspaceId}>
      {(presentation) => (
        <WorkspaceActivityRowItem
          item={item}
          presentation={presentation}
          description={describeItem({ item, subtitle: presentation.subtitle, ago })}
          onSelect={handleSelect}
        />
      )}
    </WorkspaceTabPresentationResolver>
  );
}

function WorkspaceActivityRowItem({
  item,
  presentation,
  description,
  onSelect,
}: {
  item: WorkspaceActivityItem;
  presentation: WorkspaceTabPresentation;
  description: string;
  onSelect: () => void;
}): ReactElement {
  const leading = useMemo(
    () => <WorkspaceTabIcon presentation={presentation} backdrop="surface1" />,
    [presentation],
  );
  return (
    <DropdownMenuItem
      leading={leading}
      description={description}
      selected={item.isFocused}
      showSelectedCheck
      testID={`ypaseo-workspace-activity-${item.key}`}
      onSelect={onSelect}
    >
      {presentation.label}
    </DropdownMenuItem>
  );
}
