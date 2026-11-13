// YPaseo fork: see YPASEO.md. "Scratch workspace" in the New workspace project picker: the
// first message creates a scratch git repository under ~/tmp/paseo-workspaces
// on the selected host, registers it as a project, and the workspace starts
// there. The daemon side is packages/server/src/server/ypaseo/scratch-project-directory.ts.
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { WorkspaceProjectDescriptorPayload } from "@getpaseo/protocol/messages";
import type { HostProjectListItem } from "@/projects/host-projects";
import { createProjectViewKey } from "@/projects/workspace-structure";
import { createScratchProjectName } from "./scratch-workspace-names";

/** Sent unexpanded: the daemon resolves `~` against its own home. */
export const SCRATCH_PROJECT_ROOT = "~/tmp/paseo-workspaces";
export const SCRATCH_WORKSPACE_LABEL = "Scratch workspace";
export const SCRATCH_WORKSPACE_DESCRIPTION = `New git repository in ${SCRATCH_PROJECT_ROOT}`;
export const SCRATCH_WORKSPACE_OPTION_ID = "ypaseo:scratch";
export const SCRATCH_WORKSPACE_VIEW_KEY = "ypaseo-scratch";

const MAX_NAME_ATTEMPTS = 8;

export interface ScratchProjectTarget {
  serverId: string;
  project: HostProjectListItem;
  sourceDirectory: string;
  descriptor: WorkspaceProjectDescriptorPayload;
}

/** The row the picker shows for the scratch workspace. It is never a selectable project itself. */
export function buildScratchWorkspacePickerItem(serverId: string): HostProjectListItem {
  return {
    viewKey: SCRATCH_WORKSPACE_VIEW_KEY,
    projectKey: null,
    projectName: SCRATCH_WORKSPACE_LABEL,
    projectKind: "unknown",
    iconWorkingDir: SCRATCH_PROJECT_ROOT,
    hosts: [
      {
        serverId,
        projectId: "",
        iconWorkingDir: SCRATCH_PROJECT_ROOT,
        worktreeSupport: "unknown",
      },
    ],
    workspaceKeys: [],
  };
}

/** The New workspace screen picks the scratch workspace unless it was opened for a specific project. */
export function isScratchWorkspaceDefault(routeProjectContextViewKey: string | null): boolean {
  return routeProjectContextViewKey === null;
}

function hostProjectFromScratchDescriptor(
  serverId: string,
  descriptor: WorkspaceProjectDescriptorPayload,
): HostProjectListItem {
  return {
    viewKey: createProjectViewKey({ kind: "placement", serverId, projectId: descriptor.projectId }),
    projectKey: descriptor.projectKey ?? null,
    projectName: descriptor.projectDisplayName,
    projectKind: descriptor.projectKind,
    iconWorkingDir: descriptor.projectRootPath,
    hosts: [
      {
        serverId,
        projectId: descriptor.projectId,
        iconWorkingDir: descriptor.projectRootPath,
        // The workspace is the scratch repository itself, so the screen offers
        // only Local isolation, whatever isolation the user last remembered.
        worktreeSupport: "unsupported",
      },
    ],
    workspaceKeys: [],
  };
}

/**
 * Creates `~/tmp/paseo-workspaces/<name>` on the host and registers it as a
 * project, picking another name while the directory already exists.
 */
export async function createScratchProject(input: {
  client: Pick<DaemonClient, "createProjectDirectory">;
  serverId: string;
  random?: () => number;
}): Promise<ScratchProjectTarget> {
  for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt += 1) {
    const name = createScratchProjectName(input.random);
    const payload = await input.client.createProjectDirectory({
      parentPath: SCRATCH_PROJECT_ROOT,
      name,
    });
    if (payload.project) {
      return {
        serverId: input.serverId,
        project: hostProjectFromScratchDescriptor(input.serverId, payload.project),
        sourceDirectory: payload.project.projectRootPath,
        descriptor: payload.project,
      };
    }
    if (payload.errorCode !== "directory_exists") {
      throw new Error(payload.error ?? "Unable to create a scratch workspace");
    }
  }
  throw new Error(`No free scratch workspace name found in ${SCRATCH_PROJECT_ROOT}`);
}
