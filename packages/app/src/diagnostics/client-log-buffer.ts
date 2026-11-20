const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ENTRY_LENGTH = 16 * 1024;
const LEVELS = ["debug", "log", "info", "warn", "error"] as const;

type LogLevel = (typeof LEVELS)[number];
interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
}
interface LogStorage {
  read: () => string | null;
  write: (snapshot: string) => void;
}
type ConsoleOutput = Pick<Console, LogLevel>;
interface LogMetadata {
  bytes: number;
  oldest: number | null;
}

export function stringifyLogValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    const seen = new WeakSet<object>();
    return (
      JSON.stringify(value, (_key, nested: unknown) => {
        if (typeof nested === "bigint") return String(nested);
        if (nested && typeof nested === "object") {
          if (seen.has(nested)) return "[Circular]";
          seen.add(nested);
          if (nested instanceof Error) {
            return {
              name: nested.name,
              message: nested.message,
              stack: nested.stack,
              cause: nested.cause,
            };
          }
        }
        return nested;
      }) ?? String(value)
    );
  } catch {
    return "[Unserializable]";
  }
}

export class ClientLogBuffer {
  private entries: { entry: LogEntry; json: string; bytes: number }[] = [];
  private start = 0;
  private size = 0;
  private clearedAt = 0;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<() => void>();
  private metadata: LogMetadata = { bytes: 0, oldest: null };
  private readonly encoder = new TextEncoder();

  constructor(
    private readonly storage: LogStorage,
    private readonly maxBytes = MAX_BYTES,
    private readonly batchMs = 2000,
  ) {
    try {
      const saved = storage.read();
      if (!saved) return;
      const [clearTime, ...lines] = saved.split("\n");
      this.clearedAt = Number(clearTime) || 0;
      for (const line of lines) {
        const entry = JSON.parse(line) as LogEntry;
        if (
          Number.isSafeInteger(entry.timestamp) &&
          entry.timestamp >= this.clearedAt &&
          LEVELS.includes(entry.level) &&
          typeof entry.message === "string"
        ) {
          this.append(entry);
        }
      }
    } catch {
      // A truncated snapshot can still contain complete entries.
    } finally {
      this.updateMetadata();
    }
  }

  private append(entry: LogEntry) {
    const json = JSON.stringify(entry);
    const bytes = this.encoder.encode(json).byteLength + 1;
    if (bytes > this.maxBytes) return;
    this.entries.push({ entry, json, bytes });
    this.size += bytes;
    while (this.size > this.maxBytes) {
      this.size -= this.entries[this.start++].bytes;
    }
    if (this.start > 1000 && this.start * 2 > this.entries.length) {
      this.entries = this.entries.slice(this.start);
      this.start = 0;
    }
  }

  record(level: LogLevel, ...values: unknown[]) {
    let message = "";
    for (const value of values) {
      if (message.length >= MAX_ENTRY_LENGTH) break;
      message += (message ? " " : "") + stringifyLogValue(value).slice(0, MAX_ENTRY_LENGTH);
    }
    this.append({ timestamp: Date.now(), level, message: message.slice(0, MAX_ENTRY_LENGTH) });
    this.dirty = true;
    this.timer ??= setTimeout(this.flushBestEffort, this.batchMs);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getMetadata = () => this.metadata;

  private updateMetadata() {
    this.metadata = { bytes: this.size, oldest: this.entries[this.start]?.entry.timestamp ?? null };
    for (const listener of this.listeners) listener();
  }

  get clearTime() {
    return this.clearedAt;
  }

  format() {
    return this.entries
      .slice(this.start)
      .map(
        ({ entry }) =>
          `${new Date(entry.timestamp).toISOString()} [${entry.level}] ${entry.message}`,
      )
      .join("\n");
  }

  flush = () => {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.dirty) return;
    try {
      this.storage.write(
        [this.clearedAt, ...this.entries.slice(this.start).map(({ json }) => json)].join("\n"),
      );
      this.dirty = false;
    } finally {
      this.updateMetadata();
    }
  };

  flushBestEffort = () => {
    try {
      this.flush();
    } catch {
      // An unavailable disk or browser storage must not disrupt the app.
    }
  };

  clear(now = Date.now()) {
    // Write before changing memory so a failed clear can be retried.
    this.storage.write(String(now));
    clearTimeout(this.timer);
    this.timer = undefined;
    this.dirty = false;
    this.entries = [];
    this.start = 0;
    this.size = 0;
    this.clearedAt = now;
    this.updateMetadata();
  }
}

export function captureConsole(output: ConsoleOutput, buffer: ClientLogBuffer) {
  const originals = LEVELS.map((level) => {
    const original = output[level];
    output[level] = function (...values: unknown[]) {
      try {
        buffer.record(level, ...values);
      } catch {
        // Capture must not interfere with the original console.
      }
      original.apply(output, values);
    };
    return [level, original] as const;
  });
  return () => {
    for (const [level, original] of originals) output[level] = original;
  };
}
