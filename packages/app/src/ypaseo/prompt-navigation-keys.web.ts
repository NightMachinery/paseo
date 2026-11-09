// YPaseo fork: see YPASEO.md and ./prompt-navigation.ts.
import { useEffect } from "react";
import type { ChatOutline } from "@/agent-stream/chat-outline/use-chat-outline";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { hasActiveWebOverlay } from "@/lib/overlay-root";
import { usePaneFocus } from "@/panels/pane-context";
import { isImeComposingKeyboardEvent } from "@/utils/keyboard-ime";
import { promptNavigationDirection, promptNavigationTarget } from "./prompt-navigation";

// Keys typed into the composer, a terminal or any other text field keep their
// usual meaning there (on macOS, Alt+Up/Down move to the paragraph's ends).
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  const editable = target.closest("input, textarea, [contenteditable]");
  if (!editable) {
    return false;
  }
  const tagName = editable.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea") {
    return true;
  }
  return editable.getAttribute("contenteditable")?.toLowerCase() !== "false";
}

export function usePromptNavigationKeys(outline: ChatOutline): void {
  const { isInteractive } = usePaneFocus();
  const active = useRetainedPanelActive();
  const { prompts, activePrompt, jumpToPrompt } = outline;

  useEffect(() => {
    if (!active || !isInteractive || prompts.length === 0) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || hasActiveWebOverlay() || isImeComposingKeyboardEvent(event)) {
        return;
      }
      const direction = promptNavigationDirection(event);
      if (!direction || isEditableTarget(event.target)) {
        return;
      }
      const target = promptNavigationTarget(
        prompts.map((prompt) => prompt.seq),
        activePrompt.getActiveSeq(),
        direction,
      );
      event.preventDefault();
      if (target !== null) {
        jumpToPrompt(target);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [active, activePrompt, isInteractive, jumpToPrompt, prompts]);
}
