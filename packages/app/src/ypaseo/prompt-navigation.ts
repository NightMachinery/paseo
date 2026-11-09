// YPaseo fork: see YPASEO.md. Alt+Up / Alt+Down jump to the previous / next of
// your prompts, exactly as clicking a tick in the Chat Outline does.
// Upstream request: getpaseo/paseo Discussion #9198. The key handling is web
// only (prompt-navigation-keys.web.ts); this file holds the logic it shares.
export type PromptNavigationDirection = "previous" | "next";

interface PromptNavigationKey {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export function promptNavigationDirection(
  event: PromptNavigationKey,
): PromptNavigationDirection | null {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return null;
  }
  if (event.key === "ArrowUp") {
    return "previous";
  }
  return event.key === "ArrowDown" ? "next" : null;
}

/**
 * The prompt to jump to from the one being read. With nothing being read yet
 * (the outline has not reported a position), both directions start from the
 * end, where a chat opens.
 */
export function promptNavigationTarget(
  promptSeqs: readonly number[],
  activeSeq: number | null,
  direction: PromptNavigationDirection,
): number | null {
  const seqs = [...promptSeqs].sort((a, b) => a - b);
  if (seqs.length === 0) {
    return null;
  }
  if (activeSeq === null) {
    return seqs.at(-1) ?? null;
  }
  if (direction === "previous") {
    return seqs.findLast((seq) => seq < activeSeq) ?? null;
  }
  return seqs.find((seq) => seq > activeSeq) ?? null;
}
