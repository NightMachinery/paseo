// YPaseo fork: see YPASEO.md. Actions on a status group header in the sidebar: "Mark all as
// read" on Ready to review. Rendered by `StatusGroupHeader` in
// components/sidebar/sidebar-status-list.tsx, inside its hover-tracking view.
import { useCallback, useState, type ReactElement } from "react";
import { View, type GestureResponderEvent } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { CheckCheck } from "lucide-react-native";
import type { SidebarWorkspaceGroup } from "@/components/sidebar/sidebar-labels";
import { paneContentToolbarIconSize, ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isNative } from "@/constants/platform";
import { useToast } from "@/contexts/toast-context";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import type { Theme } from "@/styles/theme";
import { markWorkspacesRead } from "./mark-all-read";

// Fork-only text, in English only (YPASEO.md: no locale files).
const MARK_ALL_READ_LABEL = "Mark all as read";
const MARK_ALL_READ_FAILED = "Failed to mark workspaces as read";

const ThemedCheckCheck = withUnistyles(CheckCheck);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export function StatusGroupHeaderActions({
  group,
  hovered,
}: {
  group: SidebarWorkspaceGroup;
  hovered: boolean;
}): ReactElement | null {
  if (group.leading.bucket !== "attention" || group.rows.length === 0) return null;
  return <MarkAllReadButton rows={group.rows} hovered={hovered} />;
}

function MarkAllReadButton({
  rows,
  hovered,
}: {
  rows: SidebarWorkspaceGroup["rows"];
  hovered: boolean;
}): ReactElement {
  const toast = useToast();
  const isCompact = useIsCompactFormFactor();
  const [pending, setPending] = useState(false);
  const visible = hovered || isNative || isCompact;

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      // The header behind the button collapses the group on press.
      event.stopPropagation();
      if (pending) return;
      setPending(true);
      markWorkspacesRead(rows, (serverId) => getHostRuntimeStore().getClient(serverId))
        .catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : MARK_ALL_READ_FAILED);
        })
        .finally(() => setPending(false));
    },
    [pending, rows, toast],
  );

  return (
    <View
      style={[styles.slot, !visible && styles.hidden]}
      pointerEvents={visible ? "auto" : "none"}
    >
      <ToolbarButton
        label={MARK_ALL_READ_LABEL}
        compact={isCompact}
        disabled={pending}
        onPress={handlePress}
        testID="ypaseo-status-group-mark-all-read"
      >
        <ThemedCheckCheck
          size={paneContentToolbarIconSize(isCompact)}
          uniProps={mutedColorMapping}
        />
      </ToolbarButton>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    flexShrink: 0,
    // Keep the glyph on the header's trailing rail and the header at its row height: the
    // button's hitbox overhangs the 14px (18px compact) glyph.
    marginRight: { xs: -7, md: -3 },
    marginVertical: { xs: -2, md: 0 },
  },
  hidden: {
    opacity: 0,
  },
});
