// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { useCallback, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToastApi } from "@/components/toast-host";
import { ToastApiProvider } from "@/contexts/toast-api-context";
import type { HostProjectListItem } from "@/projects/host-projects";
import { SCRATCH_WORKSPACE_OPTION_ID } from "./scratch-workspace";
import {
  retargetMessagePayload,
  useYpaseoNewWorkspaceProjectPicker,
  useYpaseoScratchWorkspaceSubmit,
} from "./scratch-workspace-picker";

const createProjectDirectory = vi.fn();
const acceptProjectSnapshot = vi.fn();

vi.mock("@/runtime/host-features", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/runtime/host-features")>()),
  useHostFeature: () => true,
}));

vi.mock("@/runtime/host-runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/runtime/host-runtime")>()),
  getHostRuntimeStore: () => ({
    getClient: () => ({ isConnected: true, createProjectDirectory }),
    acceptProjectSnapshot,
  }),
}));

function project(projectId: string, projectName: string): HostProjectListItem {
  return {
    viewKey: `view-${projectId}`,
    projectKey: `key-${projectId}`,
    projectName,
    projectKind: "git",
    iconWorkingDir: `/work/${projectId}`,
    hosts: [
      {
        serverId: "host",
        projectId,
        iconWorkingDir: `/work/${projectId}`,
        worktreeSupport: "supported",
      },
    ],
    workspaceKeys: [],
  };
}

const alpha = project("alpha", "Alpha");
const beta = project("beta", "Beta");

function pickerInput(routeProject: HostProjectListItem | null) {
  return {
    selectedServerId: "host",
    projects: [alpha, beta],
    routeProject,
    routeProjectContextViewKey: routeProject?.viewKey ?? null,
    lastActiveProject: alpha,
    allowAllProjects: true,
  };
}

// Stable across renders, as the screen's inputs are: a fresh array on every
// render would make the upstream picker reconcile forever.
const unroutedInput = pickerInput(null);
const routedInput = pickerInput(beta);

const toast = { error: vi.fn() } as unknown as ToastApi & { error: ReturnType<typeof vi.fn> };
function wrapper({ children }: { children: ReactNode }) {
  return <ToastApiProvider api={toast}>{children}</ToastApiProvider>;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useYpaseoNewWorkspaceProjectPicker", () => {
  it("selects Scratch workspace, listed first, when the screen was not opened for a project", () => {
    const { result } = renderHook(() => useYpaseoNewWorkspaceProjectPicker(unroutedInput));

    expect(result.current.projectPickerOptions[0]).toEqual({
      id: SCRATCH_WORKSPACE_OPTION_ID,
      label: "Scratch workspace",
      description: "New git repository in ~/tmp/paseo-workspaces",
    });
    expect(result.current.selectedProjectOptionId).toBe(SCRATCH_WORKSPACE_OPTION_ID);
    expect(result.current.projectTriggerLabel).toBe("Scratch workspace");
    expect(result.current.selectedProject).toBeNull();
    expect(result.current.selectedSourceDirectory).toBeNull();
    expect(result.current.ypaseoScratchWorkspace.selected).toBe(true);
  });

  it("keeps the routed project when the screen was opened for one", () => {
    const { result } = renderHook(() => useYpaseoNewWorkspaceProjectPicker(routedInput));

    expect(result.current.selectedProject).toEqual(beta);
    expect(result.current.projectPickerOptions[0]?.id).toBe(SCRATCH_WORKSPACE_OPTION_ID);
    expect(result.current.ypaseoScratchWorkspace.selected).toBe(false);
  });

  it("switches between a project and Scratch workspace", () => {
    const { result } = renderHook(() => useYpaseoNewWorkspaceProjectPicker(unroutedInput));
    const betaOption = result.current.projectPickerOptions.find((o) => o.label === "Beta")!;

    act(() => result.current.handleSelectProjectOption(betaOption.id));
    expect(result.current.selectedProject).toEqual(beta);
    expect(result.current.ypaseoScratchWorkspace.selected).toBe(false);

    act(() => result.current.handleSelectProjectOption(SCRATCH_WORKSPACE_OPTION_ID));
    expect(result.current.selectedProject).toBeNull();
    expect(result.current.projectTriggerLabel).toBe("Scratch workspace");
  });
});

describe("useYpaseoScratchWorkspaceSubmit", () => {
  function useScreen() {
    const picker = useYpaseoNewWorkspaceProjectPicker(unroutedInput);
    const calls = useCallback(
      async (payload: { text: string; cwd: string }) => {
        // Upstream handlers read the selected project from their render.
        submitted.push({ payload, sourceDirectory: picker.selectedSourceDirectory });
      },
      [picker.selectedSourceDirectory],
    );
    const submit = useYpaseoScratchWorkspaceSubmit(
      picker.ypaseoScratchWorkspace,
      calls,
      retargetMessagePayload,
    );
    return { picker, submit };
  }
  const submitted: { payload: { text: string; cwd: string }; sourceDirectory: string | null }[] =
    [];

  // The wrapper waits for a render, which React holds back until an awaited
  // act() returns, so submit outside act and wait for the outcome instead.
  async function submitAndWait(
    run: (payload: { text: string; cwd: string }) => Promise<void>,
    text: string,
    until: () => void,
  ) {
    let submission!: Promise<void>;
    act(() => {
      submission = run({ text, cwd: "" });
    });
    await waitFor(until);
    await submission;
  }

  afterEach(() => {
    submitted.length = 0;
  });

  it("creates the scratch project, then submits from a render where it is selected", async () => {
    createProjectDirectory.mockImplementation(async ({ name }: { name: string }) => ({
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
    }));
    const { result } = renderHook(useScreen, { wrapper });

    await submitAndWait(result.current.submit, "hello", () => expect(submitted).toHaveLength(1));

    expect(createProjectDirectory).toHaveBeenCalledTimes(1);
    const directory = submitted[0]?.sourceDirectory;
    expect(directory).toMatch(/^\/home\/me\/tmp\/paseo-workspaces\/[a-z]+-[a-z]+-[a-z]+$/);
    expect(submitted).toEqual([
      { payload: { text: "hello", cwd: directory }, sourceDirectory: directory },
    ]);
    expect(acceptProjectSnapshot).toHaveBeenCalledWith(
      "host",
      expect.objectContaining({ projectRootPath: directory }),
    );
    expect(result.current.picker.selectedProject?.iconWorkingDir).toBe(directory);
    expect(result.current.picker.selectedProjectOptionId).toBe(SCRATCH_WORKSPACE_OPTION_ID);

    // A retry reuses the project instead of making another.
    await submitAndWait(result.current.submit, "again", () => expect(submitted).toHaveLength(2));
    expect(createProjectDirectory).toHaveBeenCalledTimes(1);
    expect(submitted[1]?.payload.cwd).toBe(directory);
  });

  it("shows the error and does not submit when the host refuses", async () => {
    createProjectDirectory.mockResolvedValue({
      requestId: "r",
      directoryPath: null,
      project: null,
      error: "Permission denied creating directory",
      errorCode: "permission_denied",
    });
    const { result } = renderHook(useScreen, { wrapper });

    await submitAndWait(result.current.submit, "hello", () =>
      expect(toast.error).toHaveBeenCalled(),
    );

    expect(submitted).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith("Permission denied creating directory");
    expect(result.current.picker.selectedProject).toBeNull();
  });
});
