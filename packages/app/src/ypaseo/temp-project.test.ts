import { describe, expect, it, vi } from "vitest";
import type { ProjectCreateDirectoryResponse } from "@getpaseo/protocol/messages";
import { createTempProject, TEMP_PROJECT_ROOT } from "./temp-project";
import { createTempProjectName } from "./temp-project-names";

type ProjectCreateDirectoryPayload = ProjectCreateDirectoryResponse["payload"];

function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length]!;
}

function created(name: string): ProjectCreateDirectoryPayload {
  return {
    requestId: "r",
    directoryPath: `/home/me/tmp/paseo-workspaces/${name}`,
    project: {
      projectId: `proj-${name}`,
      projectDisplayName: name,
      projectRootPath: `/home/me/tmp/paseo-workspaces/${name}`,
      projectKind: "git",
    },
    error: null,
    errorCode: null,
  };
}

function failed(errorCode: string, error: string): ProjectCreateDirectoryPayload {
  return { requestId: "r", directoryPath: null, project: null, error, errorCode };
}

describe("createTempProjectName", () => {
  it("is three lowercase words: noun, verb, adverb", () => {
    for (let index = 0; index < 200; index += 1) {
      expect(createTempProjectName()).toMatch(/^[a-z]+-[a-z]+s-[a-z]+ly$/);
    }
  });

  it("uses every end of the random range", () => {
    expect(createTempProjectName(() => 0)).toBe("badger-bakes-boldly");
    expect(createTempProjectName(() => 0.999999)).toBe("wombat-writes-zestily");
  });
});

describe("createTempProject", () => {
  it("asks the host for a new directory under the temp root", async () => {
    const createProjectDirectory = vi.fn(async (input: { parentPath: string; name: string }) =>
      created(input.name),
    );

    const target = await createTempProject({
      client: { createProjectDirectory },
      serverId: "host",
      random: () => 0,
    });

    expect(createProjectDirectory).toHaveBeenCalledWith({
      parentPath: TEMP_PROJECT_ROOT,
      name: "badger-bakes-boldly",
    });
    expect(target.sourceDirectory).toBe("/home/me/tmp/paseo-workspaces/badger-bakes-boldly");
    expect(target.project.hosts).toEqual([
      expect.objectContaining({ serverId: "host", projectId: "proj-badger-bakes-boldly" }),
    ]);
  });

  it("tries another name while the directory exists", async () => {
    const createProjectDirectory = vi
      .fn()
      .mockResolvedValueOnce(failed("directory_exists", "exists"))
      .mockResolvedValueOnce(failed("directory_exists", "exists"))
      .mockImplementation(async (input: { name: string }) => created(input.name));

    const target = await createTempProject({
      client: { createProjectDirectory },
      serverId: "host",
      random: sequence([0, 0, 0, 0.5, 0.5, 0.5, 0.99, 0.99, 0.99]),
    });

    const names = createProjectDirectory.mock.calls.map(([input]) => input.name);
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
    expect(target.project.projectName).toBe(names[2]);
  });

  it("reports any other failure without retrying", async () => {
    const createProjectDirectory = vi
      .fn()
      .mockResolvedValue(failed("permission_denied", "Permission denied creating directory"));

    await expect(
      createTempProject({ client: { createProjectDirectory }, serverId: "host" }),
    ).rejects.toThrow("Permission denied creating directory");
    expect(createProjectDirectory).toHaveBeenCalledTimes(1);
  });

  it("gives up after a bounded number of taken names", async () => {
    const createProjectDirectory = vi.fn().mockResolvedValue(failed("directory_exists", "exists"));

    await expect(
      createTempProject({ client: { createProjectDirectory }, serverId: "host" }),
    ).rejects.toThrow("No free temp project name");
    expect(createProjectDirectory).toHaveBeenCalledTimes(8);
  });
});
