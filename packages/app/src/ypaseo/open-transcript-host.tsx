// YPaseo fork: see YPASEO.md. Headless host for "Open transcript": the Cmd+Shift+O handler and the
// command center action. Mounted in app/_layout.tsx beside the other global shortcut hosts. The
// focused tab is read when the action fires, so focus changes do not re-render this host.
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ScrollText } from "lucide-react-native";
import type { CommandCenterContribution } from "@/command-center/contributions";
import { getCommandCenterIcon } from "@/command-center/icon";
import { useCommandCenterActions } from "@/command-center/provider";
import { useToast } from "@/contexts/toast-context";
import { isElectronRuntime } from "@/desktop/host";
import { useLocalDaemonServerId } from "@/hooks/use-is-local-daemon";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import { useKeyboardShortcutOverrides } from "@/hooks/use-keyboard-shortcut-overrides";
import { usesDesktopBindings } from "@/keyboard";
import { resolveShortcutKeysForAction } from "@/keyboard/keyboard-shortcuts";
import { useHosts } from "@/runtime/host-runtime";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { getShortcutOs } from "@/utils/shortcut-platform";
import {
  describeOpenTranscriptFailure,
  focusedWorkspaceTabTarget,
  OPEN_TRANSCRIPT_TEXT,
  requestOpenTranscript,
  resolveOpenTranscriptTarget,
} from "./open-transcript";
import {
  OPEN_TRANSCRIPT_ACTION,
  OPEN_TRANSCRIPT_HELP_ID,
  OPEN_TRANSCRIPT_LABEL,
} from "./open-transcript-shortcut";

const OPEN_TRANSCRIPT_ACTIONS = [OPEN_TRANSCRIPT_ACTION] as const;
const TranscriptIcon = getCommandCenterIcon(ScrollText);

export function OpenTranscriptHost(): null {
  const { t } = useTranslation();
  const toast = useToast();
  const selection = useActiveWorkspaceSelection();
  const localServerId = useLocalDaemonServerId();
  const hosts = useHosts();
  const isDesktop = isElectronRuntime();
  const { overrides } = useKeyboardShortcutOverrides();

  const open = useCallback(() => {
    const target = resolveOpenTranscriptTarget({
      isDesktop,
      localServerId,
      hosts,
      serverId: selection?.serverId ?? null,
      focusedTarget: focusedWorkspaceTabTarget(
        useWorkspaceLayoutStore.getState().layoutByWorkspace,
        selection,
      ),
    });
    if (target.kind === "unavailable") {
      toast.show(OPEN_TRANSCRIPT_TEXT.unavailable[target.reason], {
        variant: "warning",
        testID: "ypaseo-open-transcript-toast",
      });
      return;
    }
    const message = target.host
      ? OPEN_TRANSCRIPT_TEXT.openingFrom(target.host)
      : OPEN_TRANSCRIPT_TEXT.opening;
    toast.show(message, { testID: "ypaseo-open-transcript-toast" });
    void requestOpenTranscript(target).catch((error: unknown) => {
      console.error("[ypaseo] open transcript failed", error);
      toast.error(describeOpenTranscriptFailure(error));
    });
  }, [hosts, isDesktop, localServerId, selection, toast]);

  useKeyboardActionHandler({
    handlerId: "ypaseo-open-transcript",
    actions: OPEN_TRANSCRIPT_ACTIONS,
    enabled: true,
    priority: 0,
    handle: () => {
      open();
      return true;
    },
  });

  const shortcutKeys = useMemo(
    () =>
      resolveShortcutKeysForAction(OPEN_TRANSCRIPT_HELP_ID, overrides, {
        isMac: getShortcutOs() === "mac",
        usesDesktopBindings,
      }) ?? undefined,
    [overrides],
  );
  const actions = useMemo<CommandCenterContribution[]>(
    () => [
      {
        id: "ypaseo-open-transcript",
        group: "actions",
        groupRank: 0,
        rank: 50,
        keywords: ["transcript", "session", "log", "history", "emacs", "org"],
        visibility: "query",
        run: open,
        presentation: {
          kind: "action",
          title: OPEN_TRANSCRIPT_LABEL,
          sectionTitle: t("shell.commandCenter.actions"),
          icon: TranscriptIcon,
          shortcutKeys,
        },
      },
    ],
    [open, shortcutKeys, t],
  );
  useCommandCenterActions({ sourceId: "ypaseo-open-transcript", enabled: isDesktop, actions });

  return null;
}
