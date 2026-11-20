import type {
  AudioEngine,
  AudioEngineCallbacks,
  AudioEngineOptions,
  AudioPlaybackSource,
} from "./audio-engine-types";

import { isAndroid } from "@/constants/platform";
import { useDictationMicrophoneStore } from "@/voice/dictation-microphone";
import * as native from "@getpaseo/expo-two-way-audio";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { File, Paths } from "expo-file-system";
import { createPlaybackQueue } from "./playback";
import { playFile } from "./file-playback";
import { playPcm16 } from "./pcm";

export function createAudioEngine(
  callbacks: AudioEngineCallbacks,
  options?: AudioEngineOptions,
): AudioEngine {
  const refs: {
    initialized: boolean;
    captureActive: boolean;
    muted: boolean;
    destroyed: boolean;
  } = {
    initialized: false,
    captureActive: false,
    muted: false,
    destroyed: false,
  };

  let initializing: Promise<void> | undefined;
  let captureStart: {
    nativeRequested: boolean;
    nativeStart?: Promise<boolean>;
    cancelled: boolean;
  } | null = null;

  const microphoneSubscription = native.addExpoTwoWayAudioEventListener(
    "onMicrophoneData",
    (event: { data: Uint8Array }) => {
      if (!refs.captureActive || refs.muted) {
        return;
      }
      const pcm = event.data;
      callbacks.onCaptureData(pcm);
    },
  );
  const volumeSubscription = native.addExpoTwoWayAudioEventListener(
    "onInputVolumeLevelData",
    (event: { data: number }) => {
      if (!refs.captureActive) {
        return;
      }
      const level = refs.muted ? 0 : event.data;
      callbacks.onVolumeLevel(level);
    },
  );
  const interruptionSubscription = native.addExpoTwoWayAudioEventListener(
    "onAudioInterruption",
    (event: { data: string }) => {
      const ownsCapture =
        refs.captureActive || (captureStart?.nativeRequested && !captureStart.cancelled);
      if (event.data === "headset_mic_fallback") {
        if (ownsCapture && options?.captureMode === "dictation") {
          callbacks.onHeadsetMicrophoneFallback?.();
        }
        return;
      }
      if (event.data === "capture_paused" || event.data === "capture_resumed") {
        if (ownsCapture) {
          callbacks.onCaptureAvailabilityChange?.(event.data === "capture_resumed");
        }
        return;
      }
      if (event.data !== "blocked") {
        return;
      }
      const wasCaptureActive = refs.captureActive;
      refs.captureActive = false;
      refs.muted = false;
      callbacks.onVolumeLevel(0);
      if (wasCaptureActive) {
        callbacks.onInterruption?.();
      }
    },
  );

  async function ensureInitialized(): Promise<void> {
    if (refs.destroyed) throw new Error("Audio engine destroyed.");
    if (refs.initialized) return;

    initializing ??= (async () => {
      if (!(await native.initialize())) {
        throw new Error("expo-two-way-audio: native initialize() returned false");
      }
      refs.initialized = true;
    })();
    try {
      await initializing;
    } finally {
      initializing = undefined;
    }
    if (refs.destroyed) throw new Error("Audio engine destroyed.");
  }

  /**
   * Release the OS audio session as soon as we are neither capturing nor playing.
   * Holding it keeps the user's background music paused — on iOS the non-mixing
   * `.playAndRecord` category survives backgrounding and is re-asserted on every
   * foreground, so an unreleased session means their music never comes back.
   */
  function releaseSessionIfIdle(): void {
    if (!refs.initialized || refs.destroyed) {
      return;
    }
    if (refs.captureActive || playback.isPlaying()) {
      return;
    }
    // The wrapper no-ops on binaries whose native module predates this function.
    native.releaseAudioSession();
  }

  async function ensureMicrophonePermission(): Promise<void> {
    let permission = await native.getMicrophonePermissionsAsync().catch(() => null);
    if (!permission?.granted) {
      permission = await native.requestMicrophonePermissionsAsync().catch(() => null);
    }
    if (!permission?.granted) {
      throw new Error(
        "Microphone permission is required to capture audio. Please enable microphone access in system settings.",
      );
    }
  }

  let nextFileId = 0;
  async function playAudio(audio: AudioPlaybackSource, signal: AbortSignal): Promise<number> {
    const bytes = new Uint8Array(await audio.arrayBuffer());
    if (signal.aborted) throw new Error("Playback stopped");
    if (audio.type.startsWith("audio/pcm")) {
      await ensureInitialized();
      return playPcm16(bytes, audio.type, signal, native);
    }
    // Capture owns its audio session while active. File playback alone must not
    // initialize the microphone or the native two-way engine.
    if (!refs.captureActive) {
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
        interruptionMode: "duckOthers",
        interruptionModeAndroid: "duckOthers",
      });
    }
    if (signal.aborted) throw new Error("Playback stopped");
    // AVPlayer needs a file extension to recognize local encoded audio on iOS.
    const extension =
      {
        "audio/wav": "wav",
        "audio/x-wav": "wav",
        "audio/wave": "wav",
        "audio/mpeg": "mp3",
        "audio/mp3": "mp3",
        "audio/mp4": "m4a",
        "audio/aac": "aac",
        "audio/ogg": "ogg",
        "audio/flac": "flac",
      }[audio.type.split(";")[0].trim()] ?? "audio";
    const file = new File(Paths.cache, `paseo-audio-${Date.now()}-${nextFileId++}.${extension}`);
    try {
      file.write(bytes);
      const player = createAudioPlayer(file.uri, {
        updateInterval: 100,
        keepAudioSessionActive: refs.captureActive,
      });
      return await playFile(player, signal);
    } finally {
      if (file.exists) file.delete();
    }
  }
  const playback = createPlaybackQueue(playAudio, releaseSessionIfIdle);

  function stopNativeCapture(): void {
    const wasStarting = captureStart?.nativeRequested && !captureStart.cancelled;
    if (captureStart) captureStart.cancelled = true;
    if (refs.captureActive || wasStarting) native.toggleRecording(false);
    refs.captureActive = false;
  }

  return {
    async initialize() {
      await ensureInitialized();
    },

    async destroy() {
      if (refs.destroyed) {
        return;
      }
      refs.destroyed = true;
      playback.destroy();
      const pending = captureStart?.nativeStart;
      stopNativeCapture();
      // A queued start must settle before tearing down the engine it uses.
      await Promise.allSettled([initializing, pending]);
      refs.muted = false;
      callbacks.onVolumeLevel(0);
      if (refs.initialized) {
        native.tearDown();
        refs.initialized = false;
      }
      microphoneSubscription.remove();
      volumeSubscription.remove();
      interruptionSubscription.remove();
    },

    async startCapture() {
      if (refs.captureActive || captureStart) return;
      if (refs.destroyed) throw new Error("Audio engine destroyed.");

      const attempt: {
        nativeRequested: boolean;
        nativeStart?: Promise<boolean>;
        cancelled: boolean;
      } = { nativeRequested: false, cancelled: false };
      captureStart = attempt;
      try {
        await ensureMicrophonePermission();
        if (attempt.cancelled) throw new Error("Microphone capture was cancelled.");
        await ensureInitialized();
        if (attempt.cancelled) throw new Error("Microphone capture was cancelled.");

        let isRecording: boolean;
        if (options?.captureMode === "dictation") {
          const useDeviceMicrophone =
            isAndroid && (await useDictationMicrophoneStore.read()) === "device";
          if (attempt.cancelled) throw new Error("Microphone capture was cancelled.");
          attempt.nativeRequested = true;
          attempt.nativeStart = native.startDictationAsync(useDeviceMicrophone);
          isRecording = await attempt.nativeStart;
        } else {
          attempt.nativeRequested = true;
          isRecording = native.toggleRecording(true);
        }
        if (attempt.cancelled) {
          // A bridge start can be queued when the synchronous stop is called.
          if (isRecording) native.toggleRecording(false);
          throw new Error("Microphone capture was cancelled.");
        }
        if (!isRecording) throw new Error("Microphone capture could not start.");
        refs.captureActive = true;
      } catch (error) {
        const wrapped = error instanceof Error ? error : new Error(String(error));
        if (!attempt.cancelled) callbacks.onError?.(wrapped);
        throw wrapped;
      } finally {
        captureStart = null;
        releaseSessionIfIdle();
      }
    },

    async stopCapture() {
      stopNativeCapture();
      refs.muted = false;
      callbacks.onVolumeLevel(0);
      callbacks.onCaptureAvailabilityChange?.(true);
      releaseSessionIfIdle();
    },

    toggleMute() {
      refs.muted = !refs.muted;
      if (refs.muted) {
        callbacks.onVolumeLevel(0);
      }
      return refs.muted;
    },

    isMuted() {
      return refs.muted;
    },

    play: playback.play,
    stop: playback.stop,
    clearQueue: playback.clearQueue,
    isPlaying: playback.isPlaying,
  };
}
