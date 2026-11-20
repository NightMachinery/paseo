import { useCallback, useEffect, useRef } from "react";
import { Buffer } from "buffer";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-api-context";

import { createAudioEngine } from "@/audio";

import type {
  DictationAudioSource,
  DictationAudioSourceConfig,
} from "./use-dictation-audio-source.types";

export function useDictationAudioSource(config: DictationAudioSourceConfig): DictationAudioSource {
  const onPcmSegmentRef = useRef(config.onPcmSegment);
  const onErrorRef = useRef(config.onError);
  const onInterruptionRef = useRef(config.onInterruption);
  const { t } = useTranslation();
  const toast = useToast();
  const headsetFallbackNotice = t("settings.voice.dictation.headsetFallback", {
    defaultValue: "The headset microphone gave no audio. Using the phone microphone.",
  });
  const fallbackNoticeRef = useRef(() => {
    toast.show(headsetFallbackNotice, { variant: "info" });
  });
  const [volume, setVolume] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const engineRef = useRef<ReturnType<typeof createAudioEngine> | null>(null);

  const getOrCreateEngine = useCallback(() => {
    if (engineRef.current) {
      return engineRef.current;
    }

    engineRef.current = createAudioEngine(
      {
        onCaptureData: (pcm) => {
          onPcmSegmentRef.current(Buffer.from(pcm).toString("base64"));
        },
        onVolumeLevel: (level) => {
          setVolume(level);
        },
        onError: (error) => {
          onErrorRef.current?.(error);
        },
        onInterruption: () => {
          onInterruptionRef.current?.();
        },
        onHeadsetMicrophoneFallback: () => fallbackNoticeRef.current(),
        onCaptureAvailabilityChange: (available) => setIsPaused(!available),
      },
      { captureMode: "dictation" },
    );
    return engineRef.current;
  }, []);

  useEffect(() => {
    onPcmSegmentRef.current = config.onPcmSegment;
    onErrorRef.current = config.onError;
    onInterruptionRef.current = config.onInterruption;
  }, [config.onPcmSegment, config.onError, config.onInterruption]);

  useEffect(() => {
    fallbackNoticeRef.current = () => {
      toast.show(headsetFallbackNotice, { variant: "info" });
    };
  }, [headsetFallbackNotice, toast]);

  const start = useCallback(async () => {
    const engine = getOrCreateEngine();
    await engine.initialize();
    await engine.startCapture();
  }, [getOrCreateEngine]);

  const stop = useCallback(async () => {
    await engineRef.current?.stopCapture();
    setVolume(0);
  }, []);

  useEffect(() => {
    return () => {
      const engine = engineRef.current;
      engineRef.current = null;
      void engine?.destroy().catch(() => undefined);
    };
  }, []);

  return {
    start,
    stop,
    volume,
    isPaused,
  };
}
