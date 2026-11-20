import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ClientLogsUploadRequest } from "@getpaseo/protocol/messages";

const MAX_BYTES = 10 * 1024 * 1024;
const RETAIN_COUNT = 50;
const LOG_NAME =
  /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-(android|ios|web|desktop)-[a-f0-9]{12}\.log$/;
const pendingByDirectory = new Map<string, Promise<unknown>>();

export class ClientLogsSizeError extends Error {}

export async function saveClientLogs(
  paseoHome: string,
  platform: ClientLogsUploadRequest["platform"],
  contents: string,
): Promise<string> {
  if (Buffer.byteLength(contents, "utf8") > MAX_BYTES) {
    throw new ClientLogsSizeError("Client logs exceed the 10 MiB limit");
  }
  const directory = path.resolve(paseoHome, "client-logs");
  // Serialize publication and pruning across clients of this daemon.
  const save = (pendingByDirectory.get(directory) ?? Promise.resolve())
    .catch(() => {})
    .then(() => writeAndPrune(directory, platform, contents));
  pendingByDirectory.set(directory, save);
  try {
    return await save;
  } finally {
    if (pendingByDirectory.get(directory) === save) pendingByDirectory.delete(directory);
  }
}

async function writeAndPrune(
  directory: string,
  platform: ClientLogsUploadRequest["platform"],
  contents: string,
): Promise<string> {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await fs.chmod(directory, 0o700);
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const filename = `${timestamp}-${platform}-${randomBytes(6).toString("hex")}.log`;
  const destination = path.join(directory, filename);
  const temporary = `${destination}.tmp`;
  const file = await fs.open(temporary, "wx", 0o600);
  try {
    try {
      await file.writeFile(contents, "utf8");
    } finally {
      await file.close();
    }
    await fs.rename(temporary, destination);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const previous = entries
    .filter((entry) => entry.isFile() && entry.name !== filename && LOG_NAME.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));
  await Promise.all(
    previous
      .slice(RETAIN_COUNT - 1)
      .map((entry) => fs.rm(path.join(directory, entry), { force: true })),
  );
  return destination;
}
