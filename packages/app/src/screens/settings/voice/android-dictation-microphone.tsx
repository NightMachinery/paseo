import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCard, SettingsRow, SettingsSection } from "@/components/settings";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { isAndroid } from "@/constants/platform";
import { useToast } from "@/contexts/toast-api-context";
import {
  useDictationMicrophoneStore,
  type DictationMicrophone,
} from "@/voice/dictation-microphone";

export function AndroidDictationMicrophone({ standalone = false }: { standalone?: boolean }) {
  const { t } = useTranslation();
  if (!isAndroid) return null;
  if (!standalone) return <DictationMicrophoneRow />;
  return (
    <SettingsSection title={t("settings.voice.dictation.title")} testID="voice-dictation">
      <SettingsCard>
        <DictationMicrophoneRow />
      </SettingsCard>
    </SettingsSection>
  );
}

function DictationMicrophoneRow() {
  const { t } = useTranslation();
  const toast = useToast();
  const microphone = useDictationMicrophoneStore((state) => state.microphone);
  useEffect(() => {
    void useDictationMicrophoneStore.read();
  }, []);
  const select = useCallback(
    (value: DictationMicrophone) => {
      useDictationMicrophoneStore.write(value).catch((error: unknown) => {
        toast.error(
          `${t("settings.voice.saveError")}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    },
    [t, toast],
  );
  return (
    <SettingsRow label={t("settings.voice.dictation.microphone", { defaultValue: "Microphone" })}>
      <SegmentedControl<DictationMicrophone>
        value={microphone}
        onValueChange={select}
        testID="dictation-microphone"
        options={[
          {
            value: "automatic",
            label: t("settings.voice.dictation.microphoneAutomatic", { defaultValue: "Automatic" }),
          },
          {
            value: "device",
            label: t("settings.voice.dictation.microphoneDevice", { defaultValue: "This device" }),
          },
        ]}
      />
    </SettingsRow>
  );
}
