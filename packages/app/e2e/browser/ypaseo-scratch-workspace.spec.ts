// YPaseo fork: see YPASEO.md. Cmd+N starts on "Scratch workspace", and the first message
// creates a scratch git repository under ~/tmp/paseo-workspaces on the host.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import { submitNewWorkspacePrompt } from "../support/helpers/new-workspace";
import { seedWorkspace, type SeededWorkspace } from "../support/helpers/seed-client";
import { projectEquivalenceViewKey } from "../support/helpers/project-view-key";
import { getServerId } from "../support/helpers/server-id";
import {
  switchWorkspaceViaSidebar,
  waitForSidebarHydration,
} from "../support/helpers/workspace-ui";

// The daemon resolves ~ against its own HOME, so give this worker's daemon a
// throwaway one instead of writing into the developer's ~/tmp.
const daemonHome = realpathSync(mkdtempSync(path.join(tmpdir(), "ypaseo-temp-project-home-")));
const scratchRoot = path.join(daemonHome, "tmp", "paseo-workspaces");

test.use({ e2eDaemonEnvironment: { HOME: daemonHome } });

interface ScratchWorkspace {
  id: string;
  projectId: string;
  projectRootPath: string;
}

async function findScratchWorkspace(
  seeded: SeededWorkspace,
): Promise<ScratchWorkspace | undefined> {
  const { entries } = await seeded.client.fetchWorkspaces();
  return entries.find((entry) => entry.projectRootPath.startsWith(`${scratchRoot}/`));
}

test.describe("YPaseo scratch workspace", () => {
  test.afterAll(() => {
    rmSync(daemonHome, { recursive: true, force: true });
  });

  test("Cmd+N selects Scratch workspace and the first message starts in a new git repository", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const seed = await seedWorkspace({ repoPrefix: "ypaseo-scratch-workspace-" });
    try {
      await runScratchWorkspaceScenario(page, seed, testInfo);
    } finally {
      await seed.cleanup();
    }
  });
});

async function runScratchWorkspaceScenario(
  page: Page,
  seed: SeededWorkspace,
  testInfo: TestInfo,
): Promise<void> {
  await gotoAppShell(page);
  await waitForSidebarHydration(page);
  await switchWorkspaceViaSidebar({
    page,
    serverId: getServerId(),
    workspaceId: seed.workspaceId,
  });

  // Switching left the pointer on the sidebar row, whose hover card would
  // cover the project field.
  await page.mouse.move(900, 600);
  await expect(page.getByTestId("hover-card-workspace-branch")).toHaveCount(0);

  await page.keyboard.press(process.platform === "darwin" ? "Meta+N" : "Control+N");
  await expect(page).toHaveURL(/\/new(?:\?.*)?$/, { timeout: 30_000 });
  expect(page.url()).not.toContain("projectId=");

  const trigger = page.getByTestId("new-workspace-project-picker-trigger");
  await expect(trigger).toContainText("Scratch workspace", { timeout: 30_000 });
  expect(existsSync(scratchRoot)).toBe(false);
  await trigger.screenshot({ path: testInfo.outputPath("trigger-scratch-selected.png") });
  await page.screenshot({ path: testInfo.outputPath("screen-scratch-selected.png") });

  await trigger.click();
  const scratchOption = page.getByTestId("new-workspace-project-picker-option-ypaseo-scratch");
  await expect(scratchOption).toBeVisible();
  await expect(scratchOption).toContainText("Scratch workspace");
  await expect(scratchOption).toContainText("New git repository in ~/tmp/paseo-workspaces");
  // Its own group, closed off from the projects by a separator.
  await expect(page.getByTestId("ypaseo-scratch-workspace-group")).toBeVisible();
  await expect(
    page.getByTestId(
      `new-workspace-project-picker-option-${projectEquivalenceViewKey(seed.projectKey)}`,
    ),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("picker-scratch-selected.png") });
  await page.keyboard.press("Escape");
  await expect(scratchOption).toHaveCount(0);

  await submitNewWorkspacePrompt(page, "Hello from a scratch workspace");
  await expect(page).toHaveURL(/\/workspace\//, { timeout: 60_000 });

  let workspace: ScratchWorkspace | undefined;
  await expect
    .poll(
      async () => {
        workspace = await findScratchWorkspace(seed);
        return workspace?.projectRootPath ?? null;
      },
      { timeout: 30_000 },
    )
    .toMatch(/\/[a-z]+-[a-z]+s-[a-z]+ly$/);
  const repository = workspace!.projectRootPath;
  expect(path.dirname(repository)).toBe(scratchRoot);
  expect(existsSync(path.join(repository, ".git"))).toBe(true);
  expect(
    execFileSync("git", ["rev-list", "--count", "HEAD"], {
      cwd: repository,
      encoding: "utf8",
    }).trim(),
  ).toBe("1");

  const name = path.basename(repository);
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: testInfo.outputPath("scratch-workspace-opened.png") });

  await seed.client.removeProject(workspace!.projectId);
}
