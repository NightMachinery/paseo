import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DropdownTrigger } from "@/components/ui/dropdown-trigger";
import { SurfaceCard } from "@/components/ui/scrollable-code-surface";
import { useToast } from "@/contexts/toast-context";
import {
  collectClientLogExport,
  getAdditionalLogMetadata,
  saveClientLogExport,
} from "@/diagnostics/client-log-export";
import { clientLogs } from "@/diagnostics/client-logs";
import { getHostRuntimeStore, type HostRuntimeSnapshot } from "@/runtime/host-runtime";
import type { HostProfile } from "@/types/host-connection";
import { confirmDialog } from "@/utils/confirm-dialog";

interface Props {
  appVersion: string | null;
  hosts: HostProfile[];
  isDesktopApp: boolean;
}

function getUploadClient(snapshot: HostRuntimeSnapshot | null) {
  if (snapshot?.connectionStatus !== "online") return null;
  const client = snapshot.client;
  return client?.getLastServerInfoMessage()?.features?.clientLogsUpload === true ? client : null;
}

export function ClientLogActions(props: Props) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState<"export" | "send" | "clear" | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const store = getHostRuntimeStore();
  const readTargets = () =>
    JSON.stringify(
      props.hosts
        .filter((host) => getUploadClient(store.getSnapshot(host.serverId)))
        .map((host) => host.serverId),
    );
  const targetIds = useSyncExternalStore(
    (listener) => store.subscribeAll(listener),
    readTargets,
    readTargets,
  );
  const supported = new Set<string>(JSON.parse(targetIds));
  const targets = props.hosts.filter((host) => supported.has(host.serverId));
  const javascript = useSyncExternalStore(
    clientLogs.subscribe,
    clientLogs.getMetadata,
    clientLogs.getMetadata,
  );

  const [extra, setExtra] = useState<{ bytes: number; oldest: number } | null>(null);
  const clearedAt = clientLogs.clearTime;
  const { isDesktopApp } = props;
  useEffect(() => {
    let cancelled = false;
    const readMetadata = async () => {
      const metadata = await getAdditionalLogMetadata(isDesktopApp, clearedAt);
      if (!cancelled) setExtra(metadata);
    };
    void readMetadata();
    return () => {
      cancelled = true;
    };
  }, [clearedAt, isDesktopApp]);

  const bytes = javascript.bytes + (extra?.bytes ?? 0);
  const oldest = extra
    ? Math.min(extra.oldest, javascript.oldest ?? extra.oldest)
    : javascript.oldest;

  const exportLogs = useCallback(async () => {
    setBusy("export");
    try {
      await saveClientLogExport(await collectClientLogExport(props));
    } catch {
      toast.error(t("settings.diagnostics.logs.exportFailed"));
    } finally {
      setBusy(null);
    }
  }, [props, t, toast]);

  const sendLogs = useCallback(
    async (host: HostProfile) => {
      setBusy("send");
      setSavedPath(null);
      try {
        const client = getUploadClient(store.getSnapshot(host.serverId));
        if (!client) throw new Error("Host disconnected");
        const report = await collectClientLogExport(props);
        setSavedPath(await client.uploadClientLogs(report.platform, report.contents));
      } catch {
        toast.error(t("settings.diagnostics.logs.sendFailed"));
      } finally {
        setBusy(null);
      }
    },
    [props, store, t, toast],
  );

  const clearLogs = useCallback(async () => {
    setBusy("clear");
    try {
      const confirmed = await confirmDialog({
        title: t("settings.diagnostics.logs.clear"),
        message: t("settings.diagnostics.logs.confirmClear"),
        confirmLabel: t("settings.diagnostics.logs.clear"),
        cancelLabel: t("common.cancel"),
        destructive: true,
      });
      if (confirmed) {
        clientLogs.clear();
        setExtra(null);
        setSavedPath(null);
        toast.show(t("settings.diagnostics.logs.cleared"), { variant: "success" });
      }
    } catch {
      toast.error(t("settings.diagnostics.logs.clearFailed"));
    } finally {
      setBusy(null);
    }
  }, [t, toast]);

  const singleTarget = targets.length === 1 ? targets[0] : null;
  const sendToSingleTarget = useCallback(() => {
    if (singleTarget) void sendLogs(singleTarget);
  }, [sendLogs, singleTarget]);
  const copyPath = useCallback(async () => {
    if (!savedPath) return;
    try {
      await Clipboard.setStringAsync(savedPath);
      toast.copied(t("settings.diagnostics.logs.path"));
    } catch {
      toast.error(t("settings.diagnostics.logs.copyFailed"));
    }
  }, [savedPath, t, toast]);

  const sendLabel = t("settings.diagnostics.logs.send");
  const locale = i18n.resolvedLanguage;
  return (
    <SurfaceCard style={styles.card}>
      <Text style={styles.summary} testID="client-log-summary">
        {oldest !== null
          ? t("settings.diagnostics.logs.summary", {
              size: bytes.toLocaleString(locale),
              oldest: new Date(oldest).toLocaleString(locale),
            })
          : t("settings.diagnostics.logs.empty")}
      </Text>
      <View style={styles.actions}>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy !== null}
          loading={busy === "export"}
          onPress={exportLogs}
        >
          {t("settings.diagnostics.logs.export")}
        </Button>
        {singleTarget ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            loading={busy === "send"}
            onPress={sendToSingleTarget}
          >
            {sendLabel}
          </Button>
        ) : null}
        {targets.length > 1 ? (
          <DropdownMenu compactMode="sheet">
            <DropdownTrigger size="sm" disabled={busy !== null}>
              {sendLabel}
            </DropdownTrigger>
            <DropdownMenuContent sheetTitle={sendLabel}>
              {targets.map((host) => (
                <LogHostMenuItem key={host.serverId} host={host} sendLogs={sendLogs} />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <Button size="sm" variant="ghost" disabled={busy !== null} onPress={clearLogs}>
          {t("settings.diagnostics.logs.clear")}
        </Button>
      </View>
      {savedPath ? (
        <View style={styles.saved}>
          <Text selectable style={styles.summary} testID="client-log-saved-path">
            {savedPath}
          </Text>
          <Button size="sm" variant="outline" onPress={copyPath}>
            {t("settings.diagnostics.logs.copyPath")}
          </Button>
        </View>
      ) : null}
    </SurfaceCard>
  );
}

interface LogHostMenuItemProps {
  host: HostProfile;
  sendLogs: (host: HostProfile) => Promise<void>;
}

function LogHostMenuItem({ host, sendLogs }: LogHostMenuItemProps) {
  const onSelect = useCallback(() => void sendLogs(host), [host, sendLogs]);
  return <DropdownMenuItem onSelect={onSelect}>{host.label}</DropdownMenuItem>;
}

const styles = StyleSheet.create((theme) => ({
  card: { padding: theme.spacing[3], gap: theme.spacing[2], marginBottom: theme.spacing[3] },
  summary: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] },
  saved: { alignItems: "flex-start", gap: theme.spacing[2] },
}));
