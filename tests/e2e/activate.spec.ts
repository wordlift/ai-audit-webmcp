import { expect, test } from "@playwright/test";
import { audit, step } from "./helpers";

/**
 * Activate, one click from the report: the publication preview, the existing delivery routes, the
 * prepared files and the numbers since. A fresh report has no readers yet, so the screen says what to expect.
 */
test("the Activate screen previews the publication, keeps the delivery routes and the files, and says what to expect", async ({ page, request }) => {
  const reportId = await audit(page, "https://alpina.travel");

  await step(page, "Activate").click();
  await expect(page).toHaveURL(new RegExp(`/reports/${reportId}/activate$`));
  await expect(page.getByRole("heading", { name: "Activate your Context Engine.", level: 1 })).toBeVisible();
  await expect(step(page, "Activate")).toHaveAttribute("aria-current", "step");
  // Other specs audit the same fixture, so the store may hold one reading or several: either the
  // movement or the promise of one, never a bare number.
  await expect(page.locator(".activate-score")).toContainText(/of 100 agent-ready(\. The next reading shows how it moved\.| since |, unchanged since )/);

  // Only what the audit's agent called is included as callable; nothing unverified is shown as verified.
  const preview = page.getByRole("tabpanel").getByRole("table");
  await expect(preview.getByRole("row", { name: /search the site/i })).toContainText(/Verified.*Included/);
  for (const row of await preview.getByRole("row").filter({ hasText: "Unverified" }).all()) await expect(row).toContainText("Not included as verified");

  // The existing routes: WordLift setup with the report and intent, the publishing prompt, the runbook, a new audit.
  const door = page.getByRole("link", { name: /continue with wordlift/i });
  await expect(door).toHaveAttribute("href", new RegExp(`report=${reportId}`));
  await expect(page.getByRole("button", { name: /copy publishing prompt/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /run the audit again/i })).toBeVisible();
  await page.getByRole("button", { name: /read the runbook/i }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Runbook" })).toBeVisible();
  await page.keyboard.press("Escape");

  // The technical files stay reachable, by name, through the report's own export links.
  await page.locator("summary", { hasText: "Technical files & contracts" }).click();
  for (const file of ["page.jsonld", "ai-catalog.json", "llms.txt", "skill.md", "runbook.md"]) await expect(page.locator(".file-list code", { hasText: file })).toBeVisible();
  const search = page.locator(".technical-files").getByRole("row", { name: /search the site/i });
  await expect(search).toContainText("Undecided");
  await expect(search).toContainText("The action, with its entry point");
  await expect(page.getByRole("heading", { name: /what agents are given to read/i })).toBeVisible();

  // A document opens in place, as the page it is; the raw file stays one click away.
  const skillRow = page.locator(".file-list li", { hasText: "skill.md" });
  await skillRow.getByRole("button", { name: /read/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Agent instructions" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Entities" })).toBeVisible();
  const rawUrl = await dialog.getByRole("link", { name: /open the raw file/i }).getAttribute("href");
  expect(rawUrl).toMatch(/\/publish\/skill\.md$/);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(await skillRow.getByRole("link", { name: /download/i }).getAttribute("href")).toBe(rawUrl);
  const skill = await request.get(rawUrl!);
  expect(skill.ok()).toBeTruthy();
  expect(await skill.text()).toMatch(/^---\nname: alpina\.travel Terms of Action/);

  await expect(page.getByText(/Nothing to prove yet/)).toBeVisible();

  // Back to Audit keeps the report.
  await step(page, "Audit").click();
  await expect(page).toHaveURL(new RegExp(`/reports/${reportId}$`));
});
