// YPaseo fork: see YPASEO.md. Upstream's updater is off in YPaseo: it never
// checks or downloads, so its "Check for updates" row always said "Up to date",
// and its release channel picker did nothing here while changing the official
// app's setting, which YPaseo shares. YPaseo is updated from outside the app.
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { settingsStyles } from "@/styles/settings";
import { resolveForkVersion } from "@/utils/app-version";

// Fork-only text, in English only (YPASEO.md: no locale files).
export const YPASEO_UPDATES_HINT =
  "YPaseo merges each stable Paseo release with its local changes and installs it automatically. It restarts once you are idle and no agent is in a turn.";

function YPaseoUpdateRow() {
  const { t } = useTranslation();
  return (
    <View style={[settingsStyles.row, settingsStyles.rowBorder]} testID="settings-ypaseo-updates">
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{t("settings.about.updates.label")}</Text>
        <Text style={settingsStyles.rowHint}>{YPASEO_UPDATES_HINT}</Text>
      </View>
    </View>
  );
}

/** The desktop update rows to show: YPaseo's note in a fork build, upstream's otherwise. */
export function desktopUpdateRowFor(upstream: ComponentType): ComponentType {
  return resolveForkVersion() ? YPaseoUpdateRow : upstream;
}
