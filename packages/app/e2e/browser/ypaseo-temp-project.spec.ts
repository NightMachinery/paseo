// YPaseo fork: see YPASEO.md. Cmd+N starts on "Temp", and the first message
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
const tempRoot = path.join(daemonHome, "tmp", "paseo-workspaces");

test.use({ e2eDaemonEnvironment: { HOME: daemonHome } });

interface TempWorkspace {
  id: string;
  projectId: string;
  projectRootPath: string;
}

async function findTempWorkspace(seeded: SeededWorkspace): Promise<TempWorkspace | undefined> {
  const { entries } = await seeded.client.fetchWorkspaces();
  return entries.find((entry) => entry.projectRootPath.startsWith(`${tempRoot}/`));
}

test.describe("YPaseo temp project", () => {
  test.afterAll(() => {
    rmSync(daemonHome, { recursive: true, force: true });
  });

  test("Cmd+N selects Temp and the first message starts in a new git repository", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const seed = await seedWorkspace({ repoPrefix: "ypaseo-temp-project-" });
    try {
      await runTempProjectScenario(page, seed, testInfo);
    } finally {
      await seed.cleanup();
    }
  });
});

async function runTempProjectScenario(
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
  await expect(trigger).toContainText("Temp", { timeout: 30_000 });
  expect(existsSync(tempRoot)).toBe(false);

  await trigger.click();
  const tempOption = page.getByTestId("new-workspace-project-picker-option-ypaseo-temp");
  await expect(tempOption).toBeVisible();
  await expect(tempOption).toContainText("~/tmp/paseo-workspaces");
  await expect(
    page.getByTestId(
      `new-workspace-project-picker-option-${projectEquivalenceViewKey(seed.projectKey)}`,
    ),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("picker-temp-selected.png") });
  await page.keyboard.press("Escape");
  await expect(tempOption).toHaveCount(0);

  await submitNewWorkspacePrompt(page, "Hello from a temp project");
  await expect(page).toHaveURL(/\/workspace\//, { timeout: 60_000 });

  let workspace: TempWorkspace | undefined;
  await expect
    .poll(
      async () => {
        workspace = await findTempWorkspace(seed);
        return workspace?.projectRootPath ?? null;
      },
      { timeout: 30_000 },
    )
    .toMatch(/\/[a-z]+-[a-z]+s-[a-z]+ly$/);
  const repository = workspace!.projectRootPath;
  expect(path.dirname(repository)).toBe(tempRoot);
  expect(existsSync(path.join(repository, ".git"))).toBe(true);
  expect(
    execFileSync("git", ["rev-list", "--count", "HEAD"], {
      cwd: repository,
      encoding: "utf8",
    }).trim(),
  ).toBe("1");

  const name = path.basename(repository);
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: testInfo.outputPath("temp-workspace-opened.png") });

  await seed.client.removeProject(workspace!.projectId);
}
