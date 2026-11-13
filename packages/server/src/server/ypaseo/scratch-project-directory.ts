/**
 * YPaseo: a new workspace can start in a scratch git repository. The app asks
 * `project.create_directory` for a new directory directly under the scratch root;
 * for those requests the daemon also creates the root when it is missing and
 * turns the new directory into a git repository with one empty commit, so
 * worktrees and diffs work from the start. Every other request behaves as
 * upstream. The root is resolved here, on the daemon, because the host may be
 * a different machine from the client.
 */
import { mkdir, rm, rmdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expandTilde } from "../../utils/path.js";
import { runGitCommand, type RunGitCommand } from "../../utils/run-git-command.js";
import type { createProjectDirectory } from "../project-directory-service.js";

/** Where scratch repositories live on the host. The app sends this path unexpanded. */
export const YPASEO_SCRATCH_PROJECT_ROOT = "~/tmp/paseo-workspaces";

type CreateProjectDirectoryDependencies = Parameters<typeof createProjectDirectory>[1];
type ProjectDirectoryFileSystem = NonNullable<CreateProjectDirectoryDependencies["filesystem"]>;

export interface ScratchProjectSetupOptions {
  /** Absolute scratch root; defaults to `YPASEO_SCRATCH_PROJECT_ROOT` under the daemon's home. */
  root?: string;
  runGit?: RunGitCommand;
}

export function resolveYpaseoScratchProjectRoot(): string {
  return resolve(expandTilde(YPASEO_SCRATCH_PROJECT_ROOT));
}

// The commit is not the user's work, so it skips signing and hooks, and falls
// back to a placeholder identity on hosts where git has none configured.
const INITIAL_COMMIT_ARGS = [
  "-c",
  "commit.gpgsign=false",
  "commit",
  "--allow-empty",
  "--no-verify",
  "-m",
  "Initial commit",
];
const FALLBACK_IDENTITY_ARGS = ["-c", "user.name=Paseo", "-c", "user.email=paseo@localhost"];

async function initializeScratchRepository(
  directory: string,
  runGit: RunGitCommand,
): Promise<void> {
  await runGit(["init"], { cwd: directory });
  try {
    await runGit(INITIAL_COMMIT_ARGS, { cwd: directory });
  } catch {
    await runGit([...FALLBACK_IDENTITY_ARGS, ...INITIAL_COMMIT_ARGS], { cwd: directory });
  }
}

/**
 * Wraps the dependencies of `createProjectDirectory` so that a directory created
 * directly under the scratch root becomes a git repository before it is registered.
 */
export function withYpaseoScratchProjectSetup(
  dependencies: CreateProjectDirectoryDependencies,
  options: ScratchProjectSetupOptions = {},
): CreateProjectDirectoryDependencies {
  const root = resolve(options.root ?? resolveYpaseoScratchProjectRoot());
  const runGit = options.runGit ?? runGitCommand;
  const isScratchProject = (path: string) => dirname(resolve(path)) === root;
  const filesystem: ProjectDirectoryFileSystem = {
    async stat(path) {
      if (resolve(path) === root) {
        await mkdir(root, { recursive: true });
      }
      return stat(path);
    },
    async mkdir(path) {
      await mkdir(path);
      if (!isScratchProject(path)) {
        return;
      }
      try {
        await initializeScratchRepository(path, runGit);
      } catch (error) {
        await rm(path, { recursive: true, force: true });
        throw error;
      }
    },
    async rmdir(path) {
      if (isScratchProject(path)) {
        await rm(path, { recursive: true, force: true });
        return;
      }
      await rmdir(path);
    },
  };
  return { ...dependencies, filesystem };
}
