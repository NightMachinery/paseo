import { defaultHostAppearance } from "@/hosts/appearance";
import { expect, test } from "vitest";
import { clientLogFileName, formatClientLogReport } from "./client-log-report";

test("redacts credentials from the complete log report", () => {
  const result = formatClientLogReport(
    { appVersion: "1", platform: "android", isDesktopApp: false, hostCount: 1 },
    [
      {
        serverId: "server",
        label: "Test",
        password: "saved-password",
        appearance: defaultHostAppearance(),
        lifecycle: {},
        preferredConnectionId: null,
        createdAt: "",
        updatedAt: "",
        connections: [{ id: "connection-id", type: "directTcp", endpoint: "private.example:6767" }],
      },
    ],
    'saved-password private.example:6767 Authorization: Bearer assert-not-printed {"token":"json-token"}',
    {
      title: "Android logcat",
      contents:
        "AudioEngine start https://app.paseo.sh/#offer=abc123 #connect=legacy000 relay://example:443/key",
    },
  );
  expect(result).toContain("Paseo app diagnostics");
  expect(result).toContain("JavaScript logs");
  expect(result).toContain("Android logcat\nAudioEngine start");
  for (const secret of [
    "saved-password",
    "private.example",
    "assert-not-printed",
    "json-token",
    "abc123",
    "legacy000",
    "relay://example",
  ]) {
    expect(result).not.toContain(secret);
  }
});

test("uses a UTC timestamp in a cross-platform file name", () => {
  expect(clientLogFileName("android", new Date("2026-11-20T10:15:10Z"))).toBe(
    "paseo-logs-android-2026-11-20T10-15-10.000Z.log",
  );
});
