// YPaseo fork: see YPASEO.md. "Open transcript" (Cmd+Shift+O in the app) hands an agent id to
// the owner's zsh function `paseo-view-transcript`, which finds and converts the provider session
// locally or over SSH, shows progress, and opens the result in Emacs. IPC values reach the fixed
// script as positional parameters.
import type { DesktopCommandHandler } from "./settings/desktop-settings-commands.js";
import { createEditorTargetRuntime } from "./features/editor-targets/runtime.js";
import type { EditorTargetRuntime } from "./features/editor-targets/target.js";

export const OPEN_TRANSCRIPT_COMMAND_NAME = "ypaseo_open_transcript";

const AGENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HOST_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,62}$/;
const SERVER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;

interface OpenTranscriptArgs {
  agentId: string;
  host?: string;
  serverId?: string;
}

function openTranscriptCommand({ agentId, host, serverId }: OpenTranscriptArgs) {
  const script = host
    ? 'paseo_transcript_server_id="${3-}" paseo-view-transcript --host "$2" "$1"'
    : 'paseo-view-transcript "$1"';
  return {
    command: "zsh",
    args: [
      "-lic",
      script,
      "ypaseo-open-transcript",
      agentId,
      ...(host ? [host, ...(serverId ? [serverId] : [])] : []),
    ],
  };
}

export function parseOpenTranscriptArgs(args: unknown): OpenTranscriptArgs {
  const { agentId, host, serverId } = (args ?? {}) as Partial<
    Record<keyof OpenTranscriptArgs, unknown>
  >;
  if (typeof agentId !== "string" || !AGENT_ID_PATTERN.test(agentId)) {
    throw new Error("Open transcript needs an agent id (a UUID).");
  }
  if (host !== undefined && (typeof host !== "string" || !HOST_PATTERN.test(host))) {
    throw new Error("Open transcript needs a valid host label.");
  }
  if (
    serverId !== undefined &&
    (!host || typeof serverId !== "string" || !SERVER_ID_PATTERN.test(serverId))
  ) {
    throw new Error("Open transcript needs a valid server id for the host.");
  }
  return { agentId: agentId.toLowerCase(), host, serverId };
}

/** Starts the transcript viewer detached; rejects when the id is invalid or zsh cannot start. */
export async function openAgentTranscript(
  args: unknown,
  runtime: Pick<EditorTargetRuntime, "spawnDetached"> = createEditorTargetRuntime(),
): Promise<void> {
  await runtime.spawnDetached(openTranscriptCommand(parseOpenTranscriptArgs(args)));
}

export function createOpenTranscriptCommandHandlers(): Record<string, DesktopCommandHandler> {
  return {
    [OPEN_TRANSCRIPT_COMMAND_NAME]: (args) => openAgentTranscript(args),
  };
}
