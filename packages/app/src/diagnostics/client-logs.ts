import { AppState } from "react-native";
import { File, Paths } from "expo-file-system";
import { ClientLogBuffer, captureConsole } from "./client-log-buffer";

function logFile() {
  return new File(Paths.document, "paseo-client-logs.ndjson");
}

function pendingLogFile() {
  return new File(Paths.document, "paseo-client-logs.pending");
}

export const clientLogs = new ClientLogBuffer({
  read: () => {
    const file = logFile();
    if (file.exists) return file.textSync();
    const pending = pendingLogFile();
    return pending.exists ? pending.textSync() : null;
  },
  write: (snapshot) => {
    const pending = pendingLogFile();
    pending.write(snapshot);
    pending.moveSync(logFile(), { overwrite: true });
  },
});

type ErrorHandler = (error: unknown, isFatal?: boolean) => void;
interface NativeErrorUtils {
  getGlobalHandler(): ErrorHandler;
  setGlobalHandler(handler: ErrorHandler): void;
}

interface RejectionTrackingOptions {
  allRejections: boolean;
  onUnhandled(id: number, reason: unknown): void;
  onHandled(id: number): void;
}

export function installClientLogCapture() {
  captureConsole(console, clientLogs);
  AppState.addEventListener("change", (state) => {
    if (state !== "active") clientLogs.flushBestEffort();
  });

  const { ErrorUtils, HermesInternal } = globalThis as {
    ErrorUtils?: NativeErrorUtils;
    HermesInternal?: { enablePromiseRejectionTracker?(options: RejectionTrackingOptions): void };
  };
  // RN registers its own Hermes tracker in development. Keep its warning and LogBox behavior.
  if (HermesInternal?.enablePromiseRejectionTracker) {
    const nativeOptions: RejectionTrackingOptions | undefined = __DEV__
      ? require("react-native/Libraries/promiseRejectionTrackingOptions").default
      : undefined;
    HermesInternal.enablePromiseRejectionTracker({
      allRejections: true,
      onUnhandled(id, reason) {
        clientLogs.record("error", "Unhandled promise rejection", reason);
        clientLogs.flushBestEffort();
        nativeOptions?.onUnhandled(id, reason);
      },
      onHandled(id) {
        nativeOptions?.onHandled(id);
      },
    });
  }
  const original = ErrorUtils?.getGlobalHandler();
  ErrorUtils?.setGlobalHandler((error, isFatal) => {
    try {
      clientLogs.record("error", "Uncaught JavaScript error", error);
      clientLogs.flushBestEffort();
    } finally {
      original?.(error, isFatal);
    }
  });
}
