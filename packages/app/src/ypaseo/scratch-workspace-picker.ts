// YPaseo fork: see YPASEO.md. Adds "Scratch workspace" to the New workspace project picker
// and resolves it into a real project when the first message is sent. The
// screen calls these in place of the upstream picker hook and around its
// submit handlers; the logic lives in ./scratch-workspace.ts.
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ComboboxOption } from "@/components/ui/combobox";
import { useToast } from "@/contexts/toast-context";
import { registerProjectDescriptor } from "@/hooks/open-project";
import type { HostProjectListItem } from "@/projects/host-projects";
import { useHostFeature } from "@/runtime/host-features";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useNewWorkspaceProjectPicker } from "@/screens/new-workspace/project-picker";
import { useSessionStore } from "@/stores/session-store";
import { toErrorMessage } from "@/utils/error-messages";
import {
  buildScratchWorkspacePickerItem,
  createScratchProject,
  isScratchWorkspaceDefault,
  SCRATCH_WORKSPACE_DESCRIPTION,
  SCRATCH_WORKSPACE_LABEL,
  SCRATCH_WORKSPACE_OPTION_ID,
  type ScratchProjectTarget,
} from "./scratch-workspace";

type PickerInput = Parameters<typeof useNewWorkspaceProjectPicker>[0];
type PickerState = ReturnType<typeof useNewWorkspaceProjectPicker>;

export interface YpaseoScratchWorkspaceController {
  /** Scratch workspace is the selected picker option. */
  selected: boolean;
  /** The scratch project already created for this screen on the selected host. */
  target: ScratchProjectTarget | null;
  /** Creates the scratch project and makes it the screen's selected project. */
  create: () => Promise<ScratchProjectTarget>;
}

export function useYpaseoNewWorkspaceProjectPicker(
  input: PickerInput,
): PickerState & { ypaseoScratchWorkspace: YpaseoScratchWorkspaceController } {
  const picker = useNewWorkspaceProjectPicker(input);
  const { selectedServerId, routeProjectContextViewKey } = input;
  const supportsCreateDirectory = useHostFeature(selectedServerId, "projectCreateDirectory");
  // A manual choice holds until the screen is opened for another project, like
  // the upstream picker's manual selection.
  const [choice, setChoice] = useState(() => ({
    contextKey: routeProjectContextViewKey,
    scratch: isScratchWorkspaceDefault(routeProjectContextViewKey),
  }));
  const selected =
    choice.contextKey === routeProjectContextViewKey
      ? choice.scratch
      : isScratchWorkspaceDefault(routeProjectContextViewKey);
  const [createdTarget, setCreatedTarget] = useState<ScratchProjectTarget | null>(null);
  const target = selected && createdTarget?.serverId === selectedServerId ? createdTarget : null;

  const scratchItem = useMemo(
    () => buildScratchWorkspacePickerItem(selectedServerId),
    [selectedServerId],
  );
  const projectPickerOptions = useMemo<ComboboxOption[]>(
    () => [
      {
        id: SCRATCH_WORKSPACE_OPTION_ID,
        label: SCRATCH_WORKSPACE_LABEL,
        description: SCRATCH_WORKSPACE_DESCRIPTION,
      },
      ...picker.projectPickerOptions,
    ],
    [picker.projectPickerOptions],
  );
  const projectByOptionId = useMemo(
    () =>
      new Map<string, HostProjectListItem>([
        [SCRATCH_WORKSPACE_OPTION_ID, scratchItem],
        ...picker.projectByOptionId,
      ]),
    [picker.projectByOptionId, scratchItem],
  );
  const selectProject = picker.handleSelectProjectOption;
  const handleSelectProjectOption = useCallback(
    (id: string) => {
      if (id === SCRATCH_WORKSPACE_OPTION_ID) {
        setChoice({ contextKey: routeProjectContextViewKey, scratch: true });
        return;
      }
      if (!picker.projectByOptionId.has(id)) return;
      setChoice({ contextKey: routeProjectContextViewKey, scratch: false });
      selectProject(id);
    },
    [picker.projectByOptionId, routeProjectContextViewKey, selectProject],
  );

  const create = useCallback(async () => {
    if (!supportsCreateDirectory) {
      throw new Error("Update the host to start a scratch workspace.");
    }
    const client = getHostRuntimeStore().getClient(selectedServerId);
    if (!client?.isConnected) {
      throw new Error("Host is not connected");
    }
    const created = await createScratchProject({ client, serverId: selectedServerId });
    registerProjectDescriptor({
      serverId: selectedServerId,
      project: created.descriptor,
      upsertProject: (serverId, project) =>
        getHostRuntimeStore().acceptProjectSnapshot(serverId, project),
      setHasHydratedWorkspaces: useSessionStore.getState().setHasHydratedWorkspaces,
    });
    setCreatedTarget(created);
    return created;
  }, [selectedServerId, supportsCreateDirectory]);

  const ypaseoScratchWorkspace = useMemo(
    () => ({ selected, target, create }),
    [create, selected, target],
  );

  if (!selected) {
    return {
      ...picker,
      projectPickerOptions,
      projectByOptionId,
      handleSelectProjectOption,
      ypaseoScratchWorkspace,
    };
  }
  return {
    selectedProject: target?.project ?? null,
    selectedSourceDirectory: target?.sourceDirectory ?? null,
    projectPickerOptions,
    projectByOptionId,
    selectedProjectOptionId: SCRATCH_WORKSPACE_OPTION_ID,
    projectTriggerLabel: target?.project.projectName ?? SCRATCH_WORKSPACE_LABEL,
    handleSelectProjectOption,
    ypaseoScratchWorkspace,
  };
}

/** Points a composer message at the scratch project, as the screen's `cwd` would have. */
export function retargetMessagePayload<P extends { cwd: string }>(
  args: [P],
  sourceDirectory: string,
): [P] {
  return [{ ...args[0], cwd: sourceDirectory }];
}

async function createAndRender(
  create: () => Promise<ScratchProjectTarget>,
  waiters: ((target: ScratchProjectTarget) => void)[],
): Promise<ScratchProjectTarget> {
  const rendered = new Promise<ScratchProjectTarget>((resolve) => {
    waiters.push(resolve);
  });
  try {
    await create();
  } catch (error) {
    waiters.length = 0;
    throw error;
  }
  return rendered;
}

/**
 * Wraps a New workspace submit handler. With Scratch workspace selected, it first creates the
 * scratch project, waits until the screen has rendered with that project
 * selected, and then runs the handler from that render, so the upstream
 * creation path sees an ordinary project. A failure shows a toast and leaves
 * the composer as it was.
 */
export function useYpaseoScratchWorkspaceSubmit<A extends unknown[]>(
  scratch: YpaseoScratchWorkspaceController,
  handler: (...args: A) => Promise<void>,
  retarget?: (args: A, sourceDirectory: string) => A,
): (...args: A) => Promise<void> {
  const toast = useToast();
  const latest = useRef({ handler, target: scratch.target });
  const waiters = useRef<((target: ScratchProjectTarget) => void)[]>([]);
  const creating = useRef<Promise<ScratchProjectTarget> | null>(null);
  const { create, selected } = scratch;

  useLayoutEffect(() => {
    latest.current = { handler, target: scratch.target };
    const target = scratch.target;
    if (!target || waiters.current.length === 0) return;
    for (const resolve of waiters.current.splice(0)) resolve(target);
  });

  return useCallback(
    async (...args: A) => {
      if (!selected) {
        await latest.current.handler(...args);
        return;
      }
      let target = latest.current.target;
      if (!target) {
        // A second submit while the first is still creating waits for the same project.
        creating.current ??= createAndRender(create, waiters.current).finally(() => {
          creating.current = null;
        });
        try {
          target = await creating.current;
        } catch (error) {
          toast.error(toErrorMessage(error));
          return;
        }
      }
      const nextArgs = retarget ? retarget(args, target.sourceDirectory) : args;
      await latest.current.handler(...nextArgs);
    },
    [create, retarget, selected, toast],
  );
}
