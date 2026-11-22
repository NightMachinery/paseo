import { beforeEach, expect, test, vi } from "vitest";
import * as native from "@getpaseo/expo-two-way-audio";
import { useDictationMicrophoneStore } from "@/voice/dictation-microphone";
import { createNativeAudioEngine } from "./native-audio-engine";

vi.mock("@/voice/dictation-microphone", () => ({
  useDictationMicrophoneStore: { read: vi.fn(async () => "automatic") },
}));
vi.mock("@getpaseo/expo-two-way-audio", () => ({
  initialize: vi.fn(async () => true),
  tearDown: vi.fn(),
  startDictationAsync: vi.fn(async () => true),
  startDictation: vi.fn(() => true),
  toggleRecording: vi.fn((value: boolean) => value),
  releaseAudioSession: vi.fn(),
  getMicrophonePermissionsAsync: vi.fn(async () => ({ granted: true })),
  requestMicrophonePermissionsAsync: vi.fn(async () => ({ granted: true })),
  playPCMData: vi.fn(),
  resumePlayback: vi.fn(),
  stopPlayback: vi.fn(),
  addExpoTwoWayAudioEventListener: vi.fn(() => ({ remove: vi.fn() })),
}));

const callbacks = {
  onCaptureData: vi.fn(),
  onVolumeLevel: vi.fn(),
  onHeadsetMicrophoneFallback: vi.fn(),
  onInterruption: vi.fn(),
  onError: vi.fn(),
};

function createEngine() {
  return createNativeAudioEngine(
    {
      native,
      playEncodedAudio: async () => 0,
      readDeviceMicrophone: async () => (await useDictationMicrophoneStore.read()) === "device",
    },
    callbacks,
    { captureMode: "dictation" },
  );
}

function emit(
  event: "onAudioInterruption" | "onMicrophoneData",
  payload: { data: string } | { data: Uint8Array },
) {
  const entries = vi.mocked(native.addExpoTwoWayAudioEventListener).mock.calls;
  const callback = entries.find(([name]) => name === event)?.[1];
  expect(callback).toBeDefined();
  callback?.(payload);
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("dictation reports headset fallback during route setup and keeps capturing", async () => {
  vi.mocked(native.startDictationAsync).mockImplementationOnce(async () => {
    emit("onAudioInterruption", { data: "headset_mic_fallback" });
    return true;
  });

  const engine = createEngine();
  await engine.startCapture();
  expect(callbacks.onHeadsetMicrophoneFallback).toHaveBeenCalledOnce();
  expect(callbacks.onInterruption).not.toHaveBeenCalled();

  const pcm = Uint8Array.of(1, 0);
  emit("onMicrophoneData", { data: pcm });
  expect(callbacks.onCaptureData).toHaveBeenCalledWith(pcm);
  await engine.destroy();
});

test("stopping capture during route setup cancels a late native start", async () => {
  const requested = Promise.withResolvers<void>();
  const readiness = Promise.withResolvers<boolean>();
  vi.mocked(native.startDictationAsync).mockImplementationOnce(() => {
    requested.resolve();
    return readiness.promise;
  });
  const engine = createEngine();

  const starting = expect(engine.startCapture()).rejects.toThrow(
    "Microphone capture was cancelled.",
  );
  await requested.promise;
  await engine.stopCapture();
  readiness.resolve(true);
  await starting;

  expect(native.toggleRecording).toHaveBeenCalledTimes(2);
  expect(native.toggleRecording).toHaveBeenLastCalledWith(false);
  expect(callbacks.onError).not.toHaveBeenCalled();
  emit("onMicrophoneData", { data: Uint8Array.of(1, 0) });
  expect(callbacks.onCaptureData).not.toHaveBeenCalled();
  await engine.destroy();
});

test("Android dictation passes the current microphone choice to native", async () => {
  const read = vi.mocked(useDictationMicrophoneStore.read);
  read.mockResolvedValueOnce("automatic").mockResolvedValueOnce("device");
  const engine = createEngine();

  await engine.startCapture();
  await engine.stopCapture();
  await engine.startCapture();

  expect(native.startDictationAsync).toHaveBeenNthCalledWith(1, false);
  expect(native.startDictationAsync).toHaveBeenNthCalledWith(2, true);
  await engine.destroy();
});
