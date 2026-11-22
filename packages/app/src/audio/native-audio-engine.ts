import type {
  AudioEngine,
  AudioEngineCallbacks,
  AudioEngineOptions,
  AudioPlaybackSource,
} from "./audio-engine-types";

import { AudioCaptureStartError } from "./audio-engine-types";
import { createNativeEngineLease, type NativeEngineLease } from "./native-engine-lease";
import { createPlaybackQueue } from "./playback";
import { playPcm16 } from "./pcm";

interface NativeSubscription {
  remove(): void;
}

interface MicrophonePermission {
  granted: boolean;
}

interface CaptureStart {
  nativeStart?: Promise<boolean>;
  cancelled: boolean;
}

/** The surface of `@getpaseo/expo-two-way-audio` the engine drives. */
export interface TwoWayAudioModule {
  initialize(): Promise<boolean>;
  tearDown(): void;
  toggleRecording(value: boolean): boolean;
  startDictation(): boolean;
  startDictationAsync(useDeviceMicrophone: boolean): Promise<boolean>;
  releaseAudioSession(): void;
  playPCMData(data: Uint8Array): void;
  getMicrophonePermissionsAsync(): Promise<MicrophonePermission>;
  requestMicrophonePermissionsAsync(): Promise<MicrophonePermission>;
  addExpoTwoWayAudioEventListener(
    event: "onMicrophoneData",
    listener: (event: { data: Uint8Array }) => void,
  ): NativeSubscription;
  addExpoTwoWayAudioEventListener(
    event: "onInputVolumeLevelData",
    listener: (event: { data: number }) => void,
  ): NativeSubscription;
  addExpoTwoWayAudioEventListener(
    event: "onAudioInterruption",
    listener: (event: { data: string }) => void,
  ): NativeSubscription;
}

export interface NativeAudioEngineDeps {
  native: TwoWayAudioModule & Parameters<typeof playPcm16>[3];
  /** Android waits for the selected microphone route before reporting capture ready. */
  readDeviceMicrophone?: () => Promise<boolean>;
  /** Plays encoded audio (wav, mp3, ...) through the platform player. */
  playEncodedAudio(
    bytes: Uint8Array,
    mimeType: string,
    signal: AbortSignal,
    context: { isCaptureActive(): boolean },
  ): Promise<number>;
}

// Voice mode and dictation each create an engine, but the native module holds a single engine
// per app. Every JS engine on the same module shares one lease, so one engine's teardown
// cannot free the native engine another still uses (#4147).
const leases = new WeakMap<TwoWayAudioModule, NativeEngineLease>();

function leaseFor(native: TwoWayAudioModule): NativeEngineLease {
  let lease = leases.get(native);
  if (!lease) {
    lease = createNativeEngineLease(native);
    leases.set(native, lease);
  }
  return lease;
}

export function createNativeAudioEngine(
  deps: NativeAudioEngineDeps,
  callbacks: AudioEngineCallbacks,
  options?: AudioEngineOptions,
): AudioEngine {
  const { native } = deps;
  const lease = leaseFor(native);

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
  let captureStart: CaptureStart | null = null;

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
        refs.captureActive || (captureStart?.nativeStart && !captureStart.cancelled);
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

  let initializing: Promise<void> | null = null;
  async function ensureInitialized(): Promise<void> {
    if (refs.destroyed) {
      throw new Error("Audio engine destroyed");
    }
    if (refs.initialized) {
      return;
    }
    initializing ??= (async () => {
      try {
        await lease.acquire();
        if (refs.destroyed) {
          releaseNativeEngine();
          throw new Error("Audio engine destroyed");
        }
        refs.initialized = true;
      } finally {
        initializing = null;
      }
    })();
    await initializing;
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
    if (refs.captureActive || captureStart?.nativeStart || playback.isPlaying()) {
      return;
    }
    // The wrapper no-ops on binaries whose native module predates this function.
    native.releaseAudioSession();
  }

  async function ensureMicrophonePermission(): Promise<void> {
    const permission = await native.getMicrophonePermissionsAsync().catch(() => null);
    if (permission?.granted) return;

    let cause: unknown;
    try {
      if ((await native.requestMicrophonePermissionsAsync()).granted) return;
    } catch (error) {
      cause = error;
    }
    throw new AudioCaptureStartError(
      "permissionDenied",
      "Allow microphone access in system settings and try again.",
      { cause },
    );
  }

  function releaseNativeEngine(): void {
    try {
      // Native keeps the session active while any wrapper is capturing or playing.
      native.releaseAudioSession();
    } finally {
      lease.release();
    }
  }

  async function playAudio(audio: AudioPlaybackSource, signal: AbortSignal): Promise<number> {
    const bytes = new Uint8Array(await audio.arrayBuffer());
    if (signal.aborted) throw new Error("Playback stopped");
    if (audio.type.startsWith("audio/pcm")) {
      await ensureInitialized();
      if (signal.aborted) throw new Error("Playback stopped");
      return playPcm16(bytes, audio.type, signal, native);
    }
    return deps.playEncodedAudio(bytes, audio.type, signal, {
      isCaptureActive: () => refs.captureActive,
    });
  }
  const playback = createPlaybackQueue(playAudio, releaseSessionIfIdle);

  function stopNativeCapture(): void {
    const wasStarting = captureStart?.nativeStart && !captureStart.cancelled;
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
      try {
        playback.destroy();
        const pending = captureStart?.nativeStart;
        stopNativeCapture();
        if (pending) await Promise.allSettled([pending]);
        refs.muted = false;
        callbacks.onVolumeLevel(0);
      } finally {
        microphoneSubscription.remove();
        volumeSubscription.remove();
        interruptionSubscription.remove();
        if (refs.initialized) {
          refs.initialized = false;
          releaseNativeEngine();
        }
      }
    },

    async startCapture() {
      if (refs.captureActive || captureStart) return;
      if (refs.destroyed) throw new Error("Audio engine destroyed");
      const attempt: CaptureStart = { cancelled: false };
      captureStart = attempt;
      try {
        await ensureMicrophonePermission();
        if (attempt.cancelled) throw new Error("Microphone capture was cancelled.");
        await ensureInitialized();
        if (attempt.cancelled) throw new Error("Microphone capture was cancelled.");

        let isRecording: boolean;
        if (options?.captureMode === "dictation" && deps.readDeviceMicrophone) {
          const useDeviceMicrophone = await deps.readDeviceMicrophone();
          if (attempt.cancelled) throw new Error("Microphone capture was cancelled.");
          // Record the in-flight request before native can report a route event.
          attempt.nativeStart = Promise.resolve().then(() => {
            if (attempt.cancelled) return false;
            return native.startDictationAsync(useDeviceMicrophone);
          });
          isRecording = await attempt.nativeStart;
        } else {
          isRecording =
            options?.captureMode === "dictation"
              ? native.startDictation()
              : native.toggleRecording(true);
        }
        if (attempt.cancelled) {
          if (isRecording) native.toggleRecording(false);
          throw new Error("Microphone capture was cancelled.");
        }
        if (!isRecording) throw new Error("Microphone capture could not start.");
        refs.captureActive = true;
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
