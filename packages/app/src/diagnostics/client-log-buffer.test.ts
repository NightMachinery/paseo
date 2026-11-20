import { afterEach, expect, test, vi } from "vitest";
import { ClientLogBuffer, captureConsole } from "./client-log-buffer";

afterEach(() => {
  vi.useRealTimers();
});

function createStorage() {
  let saved: string | null = null;
  return {
    read: () => saved,
    write: vi.fn((value: string) => {
      saved = value;
    }),
  };
}

test("evicts the oldest records by persisted UTF-8 byte size and writes in batches", () => {
  vi.useFakeTimers();
  const storage = createStorage();
  const buffer = new ClientLogBuffer(storage, 190, 100);
  buffer.record("log", "old", "😀".repeat(15));
  buffer.record("warn", "recent", "😀".repeat(15));
  expect(storage.write).not.toHaveBeenCalled();

  vi.advanceTimersByTime(100);
  expect(storage.write).toHaveBeenCalledTimes(1);
  expect(buffer.getMetadata().bytes).toBeLessThanOrEqual(190);
  expect(buffer.format()).toContain("[warn] recent");
  expect(buffer.format()).not.toContain("[log] old");
  expect(new ClientLogBuffer(storage, 190).format()).toEqual(buffer.format());
});

test("captures every console level while preserving original methods and arguments", () => {
  const storage = createStorage();
  const buffer = new ClientLogBuffer(storage);
  const originals = { debug: vi.fn(), log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const output = { ...originals };
  const cyclic = { self: {} };
  cyclic.self = cyclic;
  const restore = captureConsole(output, buffer);
  for (const level of ["debug", "log", "info", "warn", "error"] as const) {
    output[level]("details", cyclic, 2n);
    expect(originals[level]).toHaveBeenCalledWith("details", cyclic, 2n);
    expect(buffer.format()).toContain(`[${level}] details {"self":"[Circular]"} "2"`);
  }
  restore();
  expect(output).toEqual(originals);
  buffer.flush();
});

test("clear removes queued and saved logs while retaining the native cutoff across restart", () => {
  vi.useFakeTimers();
  const storage = createStorage();
  const buffer = new ClientLogBuffer(storage, 500, 100);
  buffer.record("log", "saved");
  buffer.flush();
  buffer.record("log", "queued");
  const clearedAt = Date.now();
  buffer.clear(clearedAt);
  vi.advanceTimersByTime(100);

  const restored = new ClientLogBuffer(storage);
  expect(restored.clearTime).toBe(clearedAt);
  expect(restored.format()).toBe("");
  expect(restored.getMetadata()).toEqual({ bytes: 0, oldest: null });
  expect(buffer.format()).toBe("");
  expect(storage.write).toHaveBeenCalledTimes(2);
});
