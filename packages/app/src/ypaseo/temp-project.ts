// YPaseo fork: see YPASEO.md. "Temp" in the New workspace project picker: the
// first message creates a scratch git repository under ~/tmp/paseo-workspaces
// on the selected host, registers it as a project, and the workspace starts
// there. The daemon side is packages/server/src/server/ypaseo/temp-project-directory.ts.
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { WorkspaceProjectDescriptorPayload } from "@getpaseo/protocol/messages";
import type { HostProjectListItem } from "@/projects/host-projects";
import { createProjectViewKey } from "@/projects/workspace-structure";
import { createTempProjectName } from "./temp-project-names";

/** Sent unexpanded: the daemon resolves `~` against its own home. */
export const TEMP_PROJECT_ROOT = "~/tmp/paseo-workspaces";
export const TEMP_PROJECT_LABEL = "Temp";
export const TEMP_PROJECT_OPTION_ID = "ypaseo:temp";
export const TEMP_PROJECT_VIEW_KEY = "ypaseo-temp";

const MAX_NAME_ATTEMPTS = 8;

export interface TempProjectTarget {
  serverId: string;
  project: HostProjectListItem;
  sourceDirectory: string;
  descriptor: WorkspaceProjectDescriptorPayload;
}

/** The row the picker shows for Temp. It is never a selectable project itself. */
export function buildTempProjectPickerItem(serverId: string): HostProjectListItem {
  return {
    viewKey: TEMP_PROJECT_VIEW_KEY,
    projectKey: null,
    projectName: TEMP_PROJECT_LABEL,
    projectKind: "unknown",
    iconWorkingDir: TEMP_PROJECT_ROOT,
    hosts: [
      {
        serverId,
        projectId: "",
        iconWorkingDir: TEMP_PROJECT_ROOT,
        worktreeSupport: "unknown",
      },
    ],
    workspaceKeys: [],
  };
}

/** The New workspace screen picks Temp unless it was opened for a specific project. */
export function isTempProjectDefault(routeProjectContextViewKey: string | null): boolean {
  return routeProjectContextViewKey === null;
}

function hostProjectFromTempDescriptor(
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
export async function createTempProject(input: {
  client: Pick<DaemonClient, "createProjectDirectory">;
  serverId: string;
  random?: () => number;
}): Promise<TempProjectTarget> {
  for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt += 1) {
    const name = createTempProjectName(input.random);
    const payload = await input.client.createProjectDirectory({
      parentPath: TEMP_PROJECT_ROOT,
      name,
    });
    if (payload.project) {
      return {
        serverId: input.serverId,
        project: hostProjectFromTempDescriptor(input.serverId, payload.project),
        sourceDirectory: payload.project.projectRootPath,
        descriptor: payload.project,
      };
    }
    if (payload.errorCode !== "directory_exists") {
      throw new Error(payload.error ?? "Unable to create a temp project");
    }
  }
  throw new Error(`No free temp project name found in ${TEMP_PROJECT_ROOT}`);
}
