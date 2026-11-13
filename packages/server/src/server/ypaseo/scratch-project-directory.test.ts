import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectDirectory } from "../project-directory-service.js";
import type { PersistedProjectRecord } from "../workspace-registry.js";
import { withYpaseoScratchProjectSetup } from "./scratch-project-directory.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

describe("withYpaseoScratchProjectSetup", () => {
  let sandbox: string;
  let root: string;
  const registered: string[] = [];
  const registerProject = async (directoryPath: string) => {
    registered.push(directoryPath);
    return { projectId: directoryPath } as unknown as PersistedProjectRecord;
  };

  beforeEach(async () => {
    sandbox = await realpath(await mkdtemp(join(tmpdir(), "ypaseo-temp-project-")));
    root = join(sandbox, "home", "tmp", "paseo-workspaces");
    registered.length = 0;
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it("creates the missing scratch root and initializes a git repository with one commit", async () => {
    const result = await createProjectDirectory(
      { parentPath: root, name: "rabbit-runs-wryly" },
      withYpaseoScratchProjectSetup({ registerProject }, { root }),
    );

    const directory = join(root, "rabbit-runs-wryly");
    expect(result.directoryPath).toBe(directory);
    expect(registered).toEqual([directory]);
    expect(existsSync(join(directory, ".git"))).toBe(true);
    expect(git(directory, ["rev-list", "--count", "HEAD"])).toBe("1");
    expect(git(directory, ["status", "--porcelain"])).toBe("");
  });

  it("leaves directories outside the scratch root as plain directories", async () => {
    const parent = join(sandbox, "projects");
    await mkdir(parent);

    await createProjectDirectory(
      { parentPath: parent, name: "plain" },
      withYpaseoScratchProjectSetup({ registerProject }, { root }),
    );

    expect(existsSync(join(parent, "plain"))).toBe(true);
    expect(existsSync(join(parent, "plain", ".git"))).toBe(false);
  });

  it("does not create a missing parent outside the scratch root", async () => {
    await expect(
      createProjectDirectory(
        { parentPath: join(sandbox, "missing"), name: "plain" },
        withYpaseoScratchProjectSetup({ registerProject }, { root }),
      ),
    ).rejects.toMatchObject({ code: "parent_directory_not_found" });
    expect(existsSync(join(sandbox, "missing"))).toBe(false);
  });

  it("does not initialize a repository nested deeper than the scratch root", async () => {
    const nested = join(root, "group");
    await mkdir(nested, { recursive: true });

    await createProjectDirectory(
      { parentPath: nested, name: "inner" },
      withYpaseoScratchProjectSetup({ registerProject }, { root }),
    );

    expect(existsSync(join(nested, "inner", ".git"))).toBe(false);
  });

  it("removes the directory and reports the error when git fails", async () => {
    const runGit = vi.fn().mockRejectedValue(new Error("git is missing"));

    await expect(
      createProjectDirectory(
        { parentPath: root, name: "otter-naps-softly" },
        withYpaseoScratchProjectSetup({ registerProject }, { root, runGit }),
      ),
    ).rejects.toMatchObject({ code: "filesystem_error" });
    expect(existsSync(join(root, "otter-naps-softly"))).toBe(false);
    expect(registered).toEqual([]);
  });

  it("reports an existing name so the app can pick another", async () => {
    await mkdir(join(root, "taken"), { recursive: true });

    await expect(
      createProjectDirectory(
        { parentPath: root, name: "taken" },
        withYpaseoScratchProjectSetup({ registerProject }, { root }),
      ),
    ).rejects.toMatchObject({ code: "directory_exists" });
  });
});
