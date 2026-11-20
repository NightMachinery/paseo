import { readFile } from "node:fs/promises";
import path from "node:path";
import { test, expect, type Page } from "../support/fixtures";
import { gotoAppShell, openSettings } from "../support/helpers/app";
import { daemonWsRoutePattern } from "../support/helpers/daemon-port";
import { openSettingsSection } from "../support/helpers/settings";

async function openAppDiagnostic(page: Page) {
  await gotoAppShell(page);
  await openSettings(page);
  await openSettingsSection(page, "diagnostics");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  const sheet = page.getByTestId("app-diagnostic-sheet");
  await expect(sheet).toBeVisible();
  return sheet;
}

async function downloadLogs(page: Page) {
  const started = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export logs", exact: true }).click();
  const download = await started;
  expect(download.suggestedFilename()).toMatch(/^paseo-logs-web-.+Z\.log$/);
  return readFile(await download.path(), "utf8");
}

test("downloads, sends, and clears the browser diagnostic logs", async ({ page }, testInfo) => {
  let sheet = await openAppDiagnostic(page);
  await page.evaluate(() => {
    console.warn("app-log-export-test", "Bearer example-secret-token");
  });
  await expect(sheet.getByTestId("client-log-summary")).toContainText("Oldest entry");

  const exported = await downloadLogs(page);
  expect(exported).toContain("Paseo app diagnostics");
  expect(exported).toContain("JavaScript logs");
  expect(exported).toContain("app-log-export-test");
  expect(exported).not.toContain("example-secret-token");

  await page.reload();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  sheet = page.getByTestId("app-diagnostic-sheet");
  await sheet.getByRole("button", { name: "Send logs to host" }).click();
  const saved = sheet.getByTestId("client-log-saved-path");
  await expect(saved).toBeVisible();
  const savedPath = await saved.innerText();
  expect(path.dirname(savedPath)).toBe(path.join(process.env.E2E_PASEO_HOME!, "client-logs"));
  expect(await readFile(savedPath, "utf8")).toContain("app-log-export-test");
  expect(await readFile(savedPath, "utf8")).not.toContain("example-secret-token");
  await expect(sheet.getByRole("button", { name: "Copy path" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("app-log-actions.png") });

  page.once("dialog", (dialog) => dialog.accept());
  await sheet.getByRole("button", { name: "Clear logs" }).click();
  await expect(sheet.getByTestId("client-log-summary")).toHaveText("No logs captured");
  expect(await downloadLogs(page)).not.toContain("app-log-export-test");
  await page.reload();
  await expect(page.getByRole("button", { name: "Run", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  expect(await downloadLogs(page)).not.toContain("app-log-export-test");
});

test("keeps local export available when an old daemon omits the upload flag", async ({ page }) => {
  let oldHandshakeSeen = false;
  await page.routeWebSocket(daemonWsRoutePattern(), (browser) => {
    const daemon = browser.connectToServer();
    daemon.onMessage((message) => {
      if (typeof message === "string") {
        const frame = JSON.parse(message) as {
          message?: {
            type?: string;
            payload?: { status?: string; features?: Record<string, unknown> };
          };
        };
        const payload = frame.message?.payload;
        if (
          frame.message?.type === "status" &&
          payload?.status === "server_info" &&
          payload.features
        ) {
          delete payload.features.clientLogsUpload;
          oldHandshakeSeen = true;
          browser.send(JSON.stringify(frame));
          return;
        }
      }
      browser.send(message);
    });
  });
  const sheet = await openAppDiagnostic(page);
  await expect.poll(() => oldHandshakeSeen).toBe(true);
  await expect(sheet.getByRole("button", { name: "Export logs" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Send logs to host" })).toHaveCount(0);
});
