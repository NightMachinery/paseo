import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, type StateStorage } from "zustand/middleware";
import { z } from "zod";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";

const preferencesSchema = z.object({
  microphone: z.enum(["automatic", "device"]).catch("automatic"),
});
type Preferences = z.infer<typeof preferencesSchema>;
export type DictationMicrophone = Preferences["microphone"];

export function createDictationMicrophoneStore(storage: StateStorage) {
  const store = create<Preferences>()(
    persist<Preferences>(() => ({ microphone: "automatic" }), {
      name: "dictation-microphone",
      storage: createValidatedPersistStorage(storage, preferencesSchema),
      skipHydration: true,
    }),
  );
  let ready: Promise<void> | undefined;

  async function read() {
    ready ??= Promise.resolve(store.persist.rehydrate());
    await ready;
    return store.getState().microphone;
  }

  return Object.assign(store, {
    read,
    async write(microphone: DictationMicrophone) {
      await read();
      await store.setState({ microphone });
    },
  });
}

export const useDictationMicrophoneStore = createDictationMicrophoneStore(AsyncStorage);
