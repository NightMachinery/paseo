import { randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { basename, isAbsolute, relative, sep } from "node:path";
import {
  MAX_NATIVE_TRANSCRIPT_CHUNK_BYTES,
  type NativeTranscriptChunk,
  type NativeTranscriptRead,
} from "@getpaseo/protocol/messages";
import type { NativeTranscriptSource } from "./agent-sdk-types.js";

const MAX_SNAPSHOTS = 8;
const SNAPSHOT_IDLE_MS = 5 * 60_000;

export class NativeTranscriptError extends Error {}

interface Snapshot {
  agentId: string;
  file: string;
  provider: NativeTranscriptSource["provider"];
  dev: number;
  ino: number;
  birthtimeMs: number;
  mtimeMs: number;
  size: number;
  accessedAt: number;
}

/** One bounded set of download cursors per request source, with no open files between chunks. */
export class NativeTranscriptSnapshots {
  private readonly snapshots = new Map<string, Snapshot>();

  async read(
    request: NativeTranscriptRead,
    resolve: () => Promise<NativeTranscriptSource>,
  ): Promise<NativeTranscriptChunk> {
    const { snapshotId, offset, maxBytes, agentId } = request;
    const existing = this.resumeSnapshot(request);
    const source = existing ?? (await resolve());
    const file = "root" in source ? await transcriptFile(source) : source.file;
    const handle = await open(
      file,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const stat = await handle.stat();
      if (!stat.isFile())
        throw new NativeTranscriptError("The native transcript is not a regular file");
      if (existing && !matchesSnapshot(existing, stat))
        throw new NativeTranscriptError("The native transcript changed during download");
      const snapshot = existing ?? {
        agentId,
        file,
        provider: source.provider,
        dev: stat.dev,
        ino: stat.ino,
        birthtimeMs: stat.birthtimeMs,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        accessedAt: Date.now(),
      };
      const { size, provider, mtimeMs } = snapshot;
      if (offset > size)
        throw new NativeTranscriptError("The transcript offset is past the end of the snapshot");
      const count = Math.min(size - offset, maxBytes, MAX_NATIVE_TRANSCRIPT_CHUNK_BYTES);
      const buffer = Buffer.alloc(count);
      let read = 0;
      while (read < count) {
        const { bytesRead } = await handle.read(buffer, read, count - read, offset + read);
        if (bytesRead === 0)
          throw new NativeTranscriptError("The native transcript was truncated during download");
        read += bytesRead;
      }
      const eof = offset + read === size;
      const id = snapshotId ?? randomUUID();
      if (eof) this.snapshots.delete(id);
      else {
        if (this.snapshots.size >= MAX_SNAPSHOTS && !this.snapshots.has(id)) {
          const oldest = this.snapshots.keys().next().value;
          if (oldest) this.snapshots.delete(oldest);
        }
        snapshot.accessedAt = Date.now();
        this.snapshots.delete(id);
        this.snapshots.set(id, snapshot);
      }
      return {
        snapshotId: id,
        provider,
        fileName: basename(file),
        size,
        mtimeMs,
        offset,
        data: buffer.toString("base64"),
        eof,
      };
    } finally {
      await handle.close();
    }
  }
  private resumeSnapshot({
    snapshotId,
    offset,
    agentId,
  }: NativeTranscriptRead): Snapshot | undefined {
    if (!snapshotId) {
      if (offset !== 0)
        throw new NativeTranscriptError("A transcript download must start at offset zero");
      return undefined;
    }
    const snapshot = this.snapshots.get(snapshotId);
    if (
      !snapshot ||
      snapshot.agentId !== agentId ||
      Date.now() - snapshot.accessedAt > SNAPSHOT_IDLE_MS
    )
      throw new NativeTranscriptError("The transcript download snapshot expired or is invalid");
    return snapshot;
  }
}

function matchesSnapshot(snapshot: Snapshot, stat: Stats): boolean {
  return (
    snapshot.dev === stat.dev &&
    snapshot.ino === stat.ino &&
    snapshot.birthtimeMs === stat.birthtimeMs &&
    (stat.size > snapshot.size ||
      (stat.size === snapshot.size && stat.mtimeMs === snapshot.mtimeMs))
  );
}

async function transcriptFile(source: NativeTranscriptSource): Promise<string> {
  const [root, file] = await Promise.all([realpath(source.root), realpath(source.file)]);
  const suffix = relative(root, file);
  if (
    !suffix ||
    isAbsolute(suffix) ||
    suffix === ".." ||
    suffix.startsWith(".." + sep) ||
    basename(file) !== basename(source.file)
  ) {
    throw new NativeTranscriptError("The native transcript path leaves its provider directory");
  }
  return file;
}
