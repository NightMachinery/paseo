import { readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import type { NativeTranscriptAgent, NativeTranscriptSource } from "./agent-sdk-types.js";
import { NativeTranscriptError } from "./native-transcript.js";
import { claudeTranscriptPath } from "./providers/claude/project-dir.js";

function validSessionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
  );
}

function sessionIds(agent: NativeTranscriptAgent, provider: "claude" | "codex"): string[] {
  const persistence = agent.persistence;
  const ids = [
    ...new Set(
      [
        provider === "codex" ? persistence?.metadata?.threadId : undefined,
        persistence?.sessionId,
        persistence?.nativeHandle,
        agent.runtimeInfo?.sessionId,
      ].filter(validSessionId),
    ),
  ];
  if (!ids.length) throw new NativeTranscriptError("The agent has no native transcript session ID");
  return ids;
}

export async function resolveClaudeNativeTranscript(
  agent: NativeTranscriptAgent,
  configDir: string,
): Promise<NativeTranscriptSource> {
  const ids = sessionIds(agent, "claude");
  for (const sessionId of ids) {
    const file = await claudeTranscriptPath({ cwd: agent.cwd, sessionId, configDir });
    if (await realpath(file).catch(missingPath)) {
      return { provider: "claude", root: join(configDir, "projects"), file };
    }
  }
  throw new NativeTranscriptError("The Claude transcript file was not found");
}

function missingPath(error: NodeJS.ErrnoException): null {
  if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
  throw error;
}

export async function resolveCodexNativeTranscript(
  agent: NativeTranscriptAgent,
  codexHome: string,
): Promise<NativeTranscriptSource> {
  const ids = sessionIds(agent, "codex");
  for (const [directory, depth] of [
    ["sessions", 3],
    ["archived_sessions", 0],
  ] as const) {
    const root = join(codexHome, directory);
    const file = await findRollout(root, depth, ids);
    if (file) return { provider: "codex", root, file };
  }
  throw new NativeTranscriptError("The Codex transcript file was not found");
}

async function findRollout(root: string, depth: number, ids: string[]): Promise<string | null> {
  const entries = await readdir(root, { withFileTypes: true }).catch(missingPath);
  if (!entries) return null;
  if (depth === 0) {
    for (const id of ids) {
      const entry = entries.find(
        ({ name }) => name.startsWith("rollout-") && name.endsWith("-" + id + ".jsonl"),
      );
      if (entry?.isFile()) return join(root, entry.name);
    }
    return null;
  }
  for (const entry of entries.sort((a, b) => b.name.localeCompare(a.name))) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    const file = await findRollout(join(root, entry.name), depth - 1, ids);
    if (file) return file;
  }
  return null;
}
