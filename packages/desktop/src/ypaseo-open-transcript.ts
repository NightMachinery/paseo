// YPaseo fork: see YPASEO.md. "Open transcript" (Cmd+Shift+O in the app) hands an agent id to
// the owner's zsh function `paseo-view-transcript`, which finds the agent's provider session on
// this machine, converts it to org with a progress display, cancels an earlier run for the same
// session and opens the result in Emacs. The function lives in the owner's shell setup, not here.
//
// The renderer chooses only the agent id, and only a UUID gets through. The id reaches zsh as a
// positional parameter, never as part of the script text.
import type { DesktopCommandHandler } from "./settings/desktop-settings-commands.js";
import { createEditorTargetRuntime } from "./features/editor-targets/runtime.js";
import type { EditorTargetRuntime } from "./features/editor-targets/target.js";

export const OPEN_TRANSCRIPT_COMMAND_NAME = "ypaseo_open_transcript";

const AGENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The fixed command line: `zsh -lic 'paseo-view-transcript "$1"' <$0> <agent id>`. A login,
 * interactive shell loads the owner's functions; `-c` takes the id as `$1`.
 */
export function openTranscriptCommand(agentId: string): { command: string; args: string[] } {
  return {
    command: "zsh",
    args: ["-lic", 'paseo-view-transcript "$1"', "ypaseo-open-transcript", agentId],
  };
}

/** The agent id from the renderer's arguments, or an error for anything that is not a UUID. */
export function parseOpenTranscriptArgs(args: unknown): string {
  const agentId =
    typeof args === "object" && args !== null && "agentId" in args
      ? (args as { agentId: unknown }).agentId
      : undefined;
  if (typeof agentId !== "string" || !AGENT_ID_PATTERN.test(agentId)) {
    throw new Error("Open transcript needs an agent id (a UUID).");
  }
  return agentId.toLowerCase();
}

/** Starts the transcript viewer detached; rejects when the id is invalid or zsh cannot start. */
export async function openAgentTranscript(
  args: unknown,
  runtime: Pick<EditorTargetRuntime, "spawnDetached"> = createEditorTargetRuntime(),
): Promise<void> {
  const agentId = parseOpenTranscriptArgs(args);
  await runtime.spawnDetached(openTranscriptCommand(agentId));
}

export function createOpenTranscriptCommandHandlers(): Record<string, DesktopCommandHandler> {
  return {
    [OPEN_TRANSCRIPT_COMMAND_NAME]: (args) => openAgentTranscript(args),
  };
}
