import { mkdtemp, open, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Command } from "commander";
import { createPaseoApi, type HostDirectory, type PaseoApi } from "@getpaseo/client";
import {
  MAX_NATIVE_TRANSCRIPT_CHUNK_BYTES,
  type NativeTranscriptChunk,
} from "@getpaseo/protocol/messages";
import type { DaemonTarget } from "../../utils/daemon-target.js";
import { connectToDaemon } from "../../utils/client.js";

interface Options {
  daemonTarget: DaemonTarget;
  destination?: string;
  output?: string;
  progress?: boolean;
}

export function addTranscriptOptions(command: Command): Command {
  return command
    .description("Download an agent's native Claude or Codex transcript")
    .argument("<id>", "Agent ID or unique prefix")
    .option("-o, --output <file>", "Write to a file instead of stdout")
    .option("--destination <host>", "Server ID or label of a host registered with the local daemon")
    .option("--progress", "Write machine-readable byte progress to stderr");
}

export function resolveTranscriptDestination(
  directory: HostDirectory,
  destination: string,
): string {
  const { self, hosts } = directory;
  if (self.serverId === destination || hosts.some((host) => host.serverId === destination)) {
    return destination;
  }

  const labels = [self, ...hosts].filter(
    (host) => host.label?.toLowerCase() === destination.toLowerCase(),
  );
  const matches = new Set(labels.map((host) => host.serverId));
  if (matches.size > 1 || (matches.has(null) && labels.length > 1)) {
    throw new Error("The host label is ambiguous. Use its server ID.");
  }
  if (labels.length === 0) throw new Error("No registered host named " + destination);
  const id = labels[0].serverId;
  if (!id) throw new Error("The registered host has not connected yet: " + destination);
  return id;
}

type TranscriptReader = PaseoApi["agents"]["readNativeTranscript"];

export async function copyNativeTranscript(
  read: TranscriptReader,
  agentId: string,
  write: (data: Buffer) => Promise<unknown>,
  progress: (bytes: number, total: number) => void,
  start?: (chunk: NativeTranscriptChunk) => void,
): Promise<void> {
  let offset = 0;
  let snapshotId: string | undefined;
  let size: number | undefined;
  while (true) {
    const chunk = await read({
      agentId,
      offset,
      maxBytes: MAX_NATIVE_TRANSCRIPT_CHUNK_BYTES,
      snapshotId,
    });
    const data = Buffer.from(chunk.data, "base64");
    size ??= chunk.size;
    snapshotId ??= chunk.snapshotId;
    const next = offset + data.length;
    if (
      chunk.offset !== offset ||
      chunk.snapshotId !== snapshotId ||
      chunk.size !== size ||
      data.length > MAX_NATIVE_TRANSCRIPT_CHUNK_BYTES ||
      next > size ||
      chunk.eof !== (next === size) ||
      (!chunk.eof && data.length === 0)
    ) {
      throw new Error("The daemon returned an invalid transcript chunk");
    }
    if (offset === 0) start?.(chunk);
    if (data.length) await write(data);
    progress(next, size);
    if (chunk.eof) return;
    offset = next;
  }
}

function writeStdout(data: Buffer): Promise<void> {
  return new Promise((resolveWrite, reject) => {
    process.stdout.write(data, (error) => {
      if (error) return reject(error);
      resolveWrite();
    });
  });
}

function reportProgress(machineReadable: boolean, tty: boolean, bytes: number, size: number): void {
  const percent = size === 0 ? 100 : Math.floor(100 * (bytes / size));
  if (machineReadable) {
    process.stderr.write("YPASEO-PROGRESS " + percent + " download " + bytes + " " + size + "\n");
  } else if (tty) {
    process.stderr.write(
      "\rDownloading transcript " + bytes + "/" + size + " bytes" + (bytes === size ? "\n" : ""),
    );
  }
}

async function copyToFile(
  output: string,
  copy: (write: (data: Buffer) => Promise<unknown>) => Promise<void>,
): Promise<void> {
  const destination = resolve(output);
  const dir = await mkdtemp(join(dirname(destination), ".paseo-transcript-"));
  const temp = join(dir, "transcript");
  try {
    const file = await open(temp, "wx", 0o600);
    try {
      await copy((data) => file.writeFile(data));
    } finally {
      await file.close();
    }
    await rename(temp, destination);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function runTranscriptCommand(agentId: string, options: Options): Promise<void> {
  const client = await connectToDaemon({ target: options.daemonTarget });
  const api = createPaseoApi(client);
  try {
    const destination = options.destination;
    const target =
      destination === undefined
        ? api
        : await api.hosts.client(resolveTranscriptDestination(await api.hosts.list(), destination));
    const progress = reportProgress.bind(
      null,
      options.progress === true,
      process.stderr.isTTY === true,
    );
    const start = options.progress
      ? ({ provider, fileName }: NativeTranscriptChunk) => {
          process.stderr.write(
            "YPASEO-TRANSCRIPT-FILE " + JSON.stringify([provider, fileName]) + "\n",
          );
        }
      : undefined;
    const copy = (write: (data: Buffer) => Promise<unknown>) =>
      copyNativeTranscript(target.agents.readNativeTranscript, agentId, write, progress, start);
    if (options.output !== undefined) await copyToFile(options.output, copy);
    else await copy(writeStdout);
  } catch (error) {
    if (
      options.progress &&
      error instanceof Error &&
      "code" in error &&
      (error.code === "NATIVE_TRANSCRIPT_UNSUPPORTED" || error.code === "unsupported_capability")
    ) {
      process.stderr.write("YPASEO-TRANSCRIPT-UNSUPPORTED\n");
    }
    throw error;
  } finally {
    try {
      await api.dispose();
    } finally {
      await client.close();
    }
  }
}
