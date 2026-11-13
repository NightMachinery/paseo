// YPaseo fork: see YPASEO.md. How "Scratch workspace" looks in the New workspace
// project picker: a flask glyph instead of a project's letter tile, a subtitle
// saying what choosing it does, and a separator that sets it apart from the
// project list below. The form calls these from its option renderer and its
// project trigger.
import type { ReactElement } from "react";
import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { FlaskConical } from "lucide-react-native";
import { ComboboxItem, type ComboboxOption } from "@/components/ui/combobox";
import { MenuSeparator } from "@/components/ui/menu";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import {
  SCRATCH_WORKSPACE_DESCRIPTION,
  SCRATCH_WORKSPACE_OPTION_ID,
  SCRATCH_WORKSPACE_VIEW_KEY,
} from "./scratch-workspace";

const ThemedFlaskConical = withUnistyles(FlaskConical);
const mutedColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const triggerIcon = <ThemedFlaskConical size={ICON_SIZE.sm} uniProps={mutedColor} />;

// Same box as a project's icon, so the label sits on the projects' rail.
function ScratchRowIcon(): ReactElement {
  return (
    <View style={styles.iconBox}>
      <ThemedFlaskConical size={ICON_SIZE.md} uniProps={mutedColor} />
    </View>
  );
}
const rowIcon = <ScratchRowIcon />;

/** The project trigger's icon while Scratch workspace is selected, else null. */
export function scratchWorkspaceTriggerIcon(selectedOptionId: string): ReactElement | null {
  return selectedOptionId === SCRATCH_WORKSPACE_OPTION_ID ? triggerIcon : null;
}

/** The picker row for Scratch workspace, or null for any other option. */
export function renderScratchWorkspaceOption(row: {
  option: ComboboxOption;
  selected: boolean;
  active: boolean;
  onPress: () => void;
  disabled: boolean;
}): ReactElement | null {
  if (row.option.id !== SCRATCH_WORKSPACE_OPTION_ID) return null;
  return (
    <View key={row.option.id} testID="ypaseo-scratch-workspace-group">
      <ComboboxItem
        testID={`new-workspace-project-picker-option-${SCRATCH_WORKSPACE_VIEW_KEY}`}
        label={row.option.label}
        description={SCRATCH_WORKSPACE_DESCRIPTION}
        selected={row.selected}
        active={row.active}
        disabled={row.disabled}
        onPress={row.onPress}
        leadingSlot={rowIcon}
      />
      <MenuSeparator />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  iconBox: {
    width: theme.iconSize.md,
    height: theme.iconSize.md,
    alignItems: "center",
    justifyContent: "center",
  },
}));
