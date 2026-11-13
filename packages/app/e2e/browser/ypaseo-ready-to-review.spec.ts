// YPaseo fork: see YPASEO.md. "Mark all as read" on the Ready to review group, and finished
// subagents in a workspace of their own staying out of it.
import { PARENT_AGENT_ID_LABEL } from "@getpaseo/protocol/agent-labels";
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import { getServerId } from "../support/helpers/server-id";
import { seedWorkspace, type SeededWorkspace } from "../support/helpers/seed-client";
import { selectSidebarStatusGrouping } from "../support/helpers/sidebar";
import { waitForSidebarHydration } from "../support/helpers/workspace-ui";

async function createWorkspace(seed: SeededWorkspace, title: string): Promise<string> {
  const created = await seed.client.createWorkspace({
    source: { kind: "directory", path: seed.repoPath, projectId: seed.projectId },
    title,
  });
  if (!created.workspace) throw new Error(created.error ?? "Workspace creation failed");
  return created.workspace.id;
}

/** Runs one fast mock turn in the workspace and waits for it to finish. */
async function finishAgent(
  seed: SeededWorkspace,
  input: { workspaceId: string; title: string; labels?: Record<string, string> },
): Promise<string> {
  const agent = await seed.client.createAgent({
    provider: "mock",
    model: "e2e-fast-stream",
    modeId: "load-test",
    cwd: seed.repoPath,
    workspaceId: input.workspaceId,
    title: input.title,
    labels: input.labels,
  });
  await seed.client.sendAgentMessage(agent.id, "finish");
  await seed.client.waitForFinish(agent.id, 15_000);
  return agent.id;
}

async function requiresAttention(seed: SeededWorkspace, agentId: string): Promise<boolean> {
  const result = await seed.client.fetchAgents({ scope: "active" });
  // The seed client's type narrows the snapshot; the wire payload carries the attention mark.
  const agent = result.entries.find((entry) => entry.agent.id === agentId)?.agent as
    | { requiresAttention?: boolean }
    | undefined;
  return agent?.requiresAttention === true;
}

function workspaceRow(page: Page, bucket: string, workspaceId: string) {
  return page
    .getByTestId(`sidebar-status-group-rows-${bucket}`)
    .getByTestId(`sidebar-workspace-row-${getServerId()}:${workspaceId}`);
}

test.describe("YPaseo Ready to review", () => {
  let seed: SeededWorkspace;

  test.beforeEach(async () => {
    seed = await seedWorkspace({ repoPrefix: "ypaseo-ready-to-review-", title: "Review one" });
  });

  test.afterEach(async () => {
    await seed?.cleanup();
  });

  test("Mark all as read empties the group", async ({ page }, testInfo) => {
    const secondWorkspaceId = await createWorkspace(seed, "Review two");
    const agentIds = [
      await finishAgent(seed, { workspaceId: seed.workspaceId, title: "First finished agent" }),
      await finishAgent(seed, { workspaceId: secondWorkspaceId, title: "Second finished agent" }),
    ];

    await gotoAppShell(page);
    await waitForSidebarHydration(page);
    await selectSidebarStatusGrouping(page);
    await expect(workspaceRow(page, "attention", seed.workspaceId)).toBeVisible({
      timeout: 30_000,
    });
    await expect(workspaceRow(page, "attention", secondWorkspaceId)).toBeVisible();

    const header = page.getByTestId("sidebar-status-group-attention");
    await header.hover();
    const button = header.getByTestId("ypaseo-status-group-mark-all-read");
    await expect(button).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("before-mark-all-read.png") });

    await button.click();
    await expect(header).toHaveCount(0, { timeout: 15_000 });
    await expect(workspaceRow(page, "done", seed.workspaceId)).toBeVisible();
    await expect(workspaceRow(page, "done", secondWorkspaceId)).toBeVisible();
    for (const agentId of agentIds) {
      await expect.poll(() => requiresAttention(seed, agentId)).toBe(false);
    }
    await page.mouse.move(1200, 400);
    await page.screenshot({ path: testInfo.outputPath("after-mark-all-read.png") });
  });

  test("a finished subagent in its own workspace stays out of the group", async ({
    page,
  }, testInfo) => {
    const parent = await seed.client.createAgent({
      provider: "mock",
      model: "ten-second-stream",
      modeId: "load-test",
      cwd: seed.repoPath,
      workspaceId: seed.workspaceId,
      title: "Coordinator",
    });
    const childWorkspaceId = await createWorkspace(seed, "Subagent workspace");
    const childId = await finishAgent(seed, {
      workspaceId: childWorkspaceId,
      title: "Finished subagent",
      labels: { [PARENT_AGENT_ID_LABEL]: parent.id },
    });

    await gotoAppShell(page);
    await waitForSidebarHydration(page);
    await selectSidebarStatusGrouping(page);
    await expect(workspaceRow(page, "done", childWorkspaceId)).toBeVisible({ timeout: 30_000 });
    await expect(workspaceRow(page, "attention", childWorkspaceId)).toHaveCount(0);
    // The agent keeps its mark; only the workspace bucket ignores it.
    expect(await requiresAttention(seed, childId)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("finished-subagent-in-done.png") });
  });
});
