// YPaseo fork: see YPASEO.md. The "Open transcript" shortcut, spread into the binding table in
// keyboard/keyboard-shortcuts.ts. Cmd+Shift+O was free once upstream moved Open project to Cmd+O.
// Kept free of runtime imports: the binding table loads this at module load.
import type { KeyboardActionId } from "@/keyboard/actions";
import type { ShortcutSectionId } from "@/keyboard/keyboard-shortcuts";

export const OPEN_TRANSCRIPT_ACTION = "ypaseo.transcript.open" satisfies KeyboardActionId;
export const OPEN_TRANSCRIPT_HELP_ID = "ypaseo-open-transcript";

// Fork-only text, in English only (YPASEO.md: no locale files).
export const OPEN_TRANSCRIPT_LABEL = "Open transcript";

interface ForkShortcutBinding {
  id: string;
  action: KeyboardActionId;
  combo: string;
  when?: { mac?: boolean; terminal?: false };
  help?: { id: string; section: ShortcutSectionId; label: string };
}

const help = {
  id: OPEN_TRANSCRIPT_HELP_ID,
  section: "general",
  label: OPEN_TRANSCRIPT_LABEL,
} as const;

// Binding ids key user overrides, so they stay as they are once shipped.
export const OPEN_TRANSCRIPT_BINDINGS: readonly ForkShortcutBinding[] = [
  {
    id: "ypaseo-open-transcript-cmd-shift-o-mac",
    action: OPEN_TRANSCRIPT_ACTION,
    combo: "Cmd+Shift+O",
    when: { mac: true },
    help,
  },
  {
    id: "ypaseo-open-transcript-ctrl-shift-o-non-mac",
    action: OPEN_TRANSCRIPT_ACTION,
    combo: "Ctrl+Shift+O",
    when: { mac: false, terminal: false },
    help,
  },
];
