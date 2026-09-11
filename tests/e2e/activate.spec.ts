import { expect, test } from "@playwright/test";

/**
 * Activate, one click from the report: what the site publishes, the three documents, and the
 * numbers since. A fresh report has no readers yet, so the screen says what to expect.
 */
test("the Activate screen shows what the page carries, the three documents, and what to expect", async ({ page, request }) => {
  await page.goto("/");
  await page.getByLabel("Website URL").fill("https://alpina.travel");
  await page.getByRole("button", { name: /audit my site/i }).click();
  await expect(page).toHaveURL(/\/reports\//);
  const reportId = page.url().split("/reports/")[1]!;

  await page.getByRole("link", { name: /^activate$/i }).click();
  await expect(page).toHaveURL(new RegExp(`/reports/${reportId}/activate$`));
  await expect(page.getByRole("heading", { name: /make alpina\.travel usable by ai agents/i, level: 1 })).toBeVisible();
  // Other specs audit the same fixture, so the store may hold one reading or several: either the
  // movement or the promise of one, never a bare number.
  await expect(page.locator(".activate-score")).toContainText(/of 100 agent-ready(\. The next reading shows how it moved\.| since |, unchanged since )/);

  const search = page.getByRole("row", { name: /search the site/i });
  await expect(search).toContainText("Undecided");
  await expect(search).toContainText("The action, with its entry point");

  for (const title of ["On your pages", "For agents", "For registries"]) {
    await expect(page.getByRole("article", { name: title })).toBeVisible();
  }
  // The document opens in place, as the page it is; the raw file stays one click away.
  await page.getByRole("article", { name: "For agents" }).getByRole("button", { name: /read the whole file/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "For agents" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Entities" })).toBeVisible();
  await expect(dialog.getByText(/lines ·/)).toBeVisible();
  const rawUrl = await dialog.getByRole("link", { name: /open the raw file/i }).getAttribute("href");
  expect(rawUrl).toMatch(/\/publish\/skill\.md$/);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  const skillLink = page.getByRole("article", { name: "For agents" }).getByRole("link", { name: /^raw/i });
  const skillUrl = await skillLink.getAttribute("href");
  expect(skillUrl).toBe(rawUrl);
  const skill = await request.get(skillUrl!);
  expect(skill.ok()).toBeTruthy();
  expect(await skill.text()).toMatch(/^---\nname: alpina\.travel Terms of Action/);

  await expect(page.getByText("No crawler yet. Expect the first within days of publishing.")).toBeVisible();
  await expect(page.getByText(/No agent has activated a capability yet/)).toBeVisible();

  await page.getByRole("link", { name: /back to the report/i }).click();
  await expect(page).toHaveURL(new RegExp(`/reports/${reportId}$`));
});
