import type { ClientLogsUploadRequest } from "@getpaseo/protocol/messages";
import type { HostProfile } from "@/types/host-connection";
import { formatAppDiagnosticHeader, redactAppDiagnosticReport } from "./app-diagnostic-report";

type ReportInput = Parameters<typeof formatAppDiagnosticHeader>[0];

export function formatClientLogReport(
  input: ReportInput,
  hosts: HostProfile[],
  javascript: string,
  extra: { title: string; contents: string } | null,
) {
  const sections = [formatAppDiagnosticHeader(input), `JavaScript logs\n${javascript}`];
  if (extra) sections.push(`${extra.title}\n${extra.contents}`);

  return redactAppDiagnosticReport(
    sections
      .join("\n\n")
      // Apply before the diagnostic key/value redactor, which may consume "Bearer" on its own.
      .replace(/\bBearer[ \t]+[a-z0-9._~+/=-]+/gi, "Bearer [redacted]")
      .replace(/\b(relay:\/\/)[^\s"']+/gi, "$1[redacted]")
      .replace(/([#&?](?:offer|connect)=)[^\s&"']+/gi, "$1[redacted]")
      .replace(
        /("(?:authorization|password|token|secret|api[_-]?key|daemonPublicKeyB64|relayKey|pairingOffer)"\s*:\s*)"(?:\\.|[^"\\])*"/gi,
        '$1"[redacted]"',
      ),
    hosts,
  );
}

export function getClientLogExportPlatform(
  input: ReportInput,
): ClientLogsUploadRequest["platform"] {
  if (input.isDesktopApp) return "desktop";
  return input.platform === "android" || input.platform === "ios" ? input.platform : "web";
}

export function clientLogFileName(platform: ClientLogsUploadRequest["platform"], now = new Date()) {
  return `paseo-logs-${platform}-${now.toISOString().replaceAll(":", "-")}.log`;
}
