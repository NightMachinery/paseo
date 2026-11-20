import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";
import { getDesktopAppLogs } from "@/desktop/daemon/desktop-daemon";
import { saveAndShareDownloadedBytes } from "@/stores/download-store";
import type { HostProfile } from "@/types/host-connection";
import {
  clientLogFileName,
  formatClientLogReport,
  getClientLogExportPlatform,
} from "./client-log-report";
import { clientLogs } from "./client-logs";

interface AndroidLogsModule {
  readLogcat(clearedAt: number): Promise<string>;
}

async function readAdditionalLogs(isDesktopApp: boolean, clearedAt: number) {
  if (Platform.OS === "android") {
    const title = "Android logcat";
    try {
      const androidLogs = requireOptionalNativeModule<AndroidLogsModule>("PaseoClientLogs");
      return {
        title,
        contents: androidLogs ? await androidLogs.readLogcat(clearedAt) : "Unavailable",
      };
    } catch {
      return { title, contents: "Unable to read Android app logcat" };
    }
  }
  if (isDesktopApp) {
    const title = "Desktop main-process logs";
    try {
      const { contents } = await getDesktopAppLogs();
      return { title, contents };
    } catch {
      return { title, contents: "Unable to read desktop app logs" };
    }
  }
  return null;
}

export async function getAdditionalLogMetadata(isDesktopApp: boolean, clearedAt: number) {
  const extra = await readAdditionalLogs(isDesktopApp, clearedAt);
  if (!extra) return null;
  const android = Platform.OS === "android";
  const firstTimestamp = android
    ? /^\s*(\d{10}\.\d+)\s/m.exec(extra.contents)?.[1]
    : /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\]/m.exec(extra.contents)?.[1];
  if (!firstTimestamp) return null;
  const oldest = android
    ? Number(firstTimestamp) * 1000
    : Date.parse(firstTimestamp.replace(" ", "T"));
  if (!Number.isFinite(oldest)) return null;
  return { bytes: new TextEncoder().encode(extra.contents).byteLength, oldest };
}

export async function collectClientLogExport(input: {
  appVersion: string | null;
  hosts: HostProfile[];
  isDesktopApp: boolean;
}) {
  const info = { ...input, platform: Platform.OS, hostCount: input.hosts.length };
  const javascript = clientLogs.format();
  const extra = await readAdditionalLogs(info.isDesktopApp, clientLogs.clearTime);
  const platform = getClientLogExportPlatform(info);
  return {
    contents: formatClientLogReport(info, input.hosts, javascript, extra),
    fileName: clientLogFileName(platform),
    platform,
  };
}

export async function saveClientLogExport(report: { contents: string; fileName: string }) {
  await saveAndShareDownloadedBytes({
    bytes: new TextEncoder().encode(report.contents),
    fileName: report.fileName,
    mimeType: "text/plain",
  });
}
