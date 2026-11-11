// YPaseo fork: see YPASEO.md. The tab strip's "Agents and terminals" menu.
import { expect, test } from "../support/fixtures";
import {
  expectWorkspaceTabHidden,
  expectWorkspaceTabVisible,
} from "../support/helpers/archive-tab";
import { expectAgentTabActive } from "../support/helpers/launcher";
import { openAgentRoute } from "../support/helpers/mock-agent";
import { seedWorkspace, type SeededWorkspace } from "../support/helpers/seed-client";
import { seedParentWithSubagent } from "../support/helpers/subagents";

test.describe("YPaseo workspace activity menu", () => {
  let workspace: SeededWorkspace;

  test.beforeAll(async () => {
    workspace = await seedWorkspace({ repoPrefix: "ypaseo-activity-menu-" });
  });

  test.afterAll(async () => {
    await workspace?.cleanup();
  });

  test("lists an agent without a tab and opens it", async ({ page }, testInfo) => {
    const agents = await seedParentWithSubagent(workspace, {
      parentTitle: "Activity parent",
      childTitle: "Activity child",
    });
    await openAgentRoute(page, { workspaceId: agents.workspaceId, agentId: agents.parent.id });
    await expectWorkspaceTabHidden(page, agents.child.id);

    await page.getByTestId("ypaseo-workspace-activity-button").filter({ visible: true }).click();
    const menu = page.getByTestId("ypaseo-workspace-activity-menu");
    const parentRow = menu.getByTestId(`ypaseo-workspace-activity-agent:${agents.parent.id}`);
    const childRow = menu.getByTestId(`ypaseo-workspace-activity-agent:${agents.child.id}`);
    await expect(parentRow).toBeVisible();
    await expect(childRow).toBeVisible();
    await expect(childRow).toContainText("Activity child");
    await expect(childRow).toContainText("subagent");
    await expect(childRow).toContainText("no tab");
    await expect(parentRow).not.toContainText("no tab");
    await page.screenshot({ path: testInfo.outputPath("menu.png") });

    await childRow.click();
    await expectWorkspaceTabVisible(page, agents.child.id);
    await expectAgentTabActive(page, agents.child.id);
  });
});
