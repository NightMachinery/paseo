import { isWeb } from "@/constants/platform";
import { ClientLogBuffer, captureConsole } from "./client-log-buffer";

const STORAGE_KEY = "paseo-client-logs";
export const clientLogs = new ClientLogBuffer({
  read: () => (isWeb ? window.localStorage.getItem(STORAGE_KEY) : null),
  write: (snapshot) => {
    if (isWeb) window.localStorage.setItem(STORAGE_KEY, snapshot);
  },
});

export function installClientLogCapture() {
  captureConsole(console, clientLogs);
  if (isWeb) {
    window.addEventListener("error", (event) => {
      clientLogs.record("error", "Uncaught JavaScript error", event.error ?? event.message);
      clientLogs.flushBestEffort();
    });
    window.addEventListener("unhandledrejection", (event) => {
      clientLogs.record("error", "Unhandled promise rejection", event.reason);
      clientLogs.flushBestEffort();
    });
    window.addEventListener("pagehide", clientLogs.flushBestEffort);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") clientLogs.flushBestEffort();
    });
  }
}
