import { expect, test, vi } from "vitest";
import { createDictationMicrophoneStore } from "./dictation-microphone";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

test("defaults to Automatic and persists This device locally across reloads", async () => {
  const data = new Map<string, string>();
  const storage = {
    async getItem(key: string) {
      return data.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      data.set(key, value);
    },
    async removeItem(key: string) {
      data.delete(key);
    },
  };
  const first = createDictationMicrophoneStore(storage);
  expect(await first.read()).toBe("automatic");
  await first.write("device");
  expect(first.getState().microphone).toBe("device");

  const reloaded = createDictationMicrophoneStore(storage);
  expect(await reloaded.read()).toBe("device");
  await reloaded.write("automatic");
  expect(await createDictationMicrophoneStore(storage).read()).toBe("automatic");
});
