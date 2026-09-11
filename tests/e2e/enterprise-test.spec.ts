import { expect, test } from "@playwright/test";

/**
 * The enterprise test from the brief: a senior architect, a compliance person or an AI lead opens
 * the same result and, within two clicks, can answer eight questions. Each block below is one
 * question and counts its clicks from the report. If this test fails, the simplification has
 * hidden something the enterprise layer must keep.
 */
test("the eight enterprise questions are each two clicks from the report", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Website URL").fill("https://alpina.travel");
  await page.getByRole("button", { name: /audit my site/i }).click();
  await expect(page).toHaveURL(/\/reports\//);
  const reportId = page.url().split("/reports/")[1]!;

  // A refinement with a rationale, as the interview files it: the governance decision to find later.
  const refined = await page.request.post(`/api/reports/${reportId}/refine`, {
    data: {
      businessRole: "destination-organization",
      actionDecisions: [
        { actionId: "availability.check", decision: "confirm", boundary: "partner-handoff", partner: { name: "Lungau Lodging" }, rationale: "Partners own the inventory." },
      ],
    },
  });
  expect(refined.ok()).toBeTruthy();
  const childId = ((await refined.json()) as { id: string }).id;
  await page.goto(`/reports/${childId}`);
  await page.locator(".first-screen").waitFor();

  // 7. What is inferred versus explicitly declared? No click: the two groups are on the page.
  await expect(page.getByText(/agents read these/i)).toBeVisible();
  await expect(page.getByText(/only in your text/i)).toBeVisible();

  // 1, 2, 3, 4 and 8: one click on the action. The dialog says what it applies to, who owns it and
  // why, with the decision's provenance, which interfaces implement it, and what evidence supports it.
  await page.locator(".three-actions").getByRole("button", { name: /check availability/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/this action applies to/i)).toBeVisible();
  await expect(dialog.getByText(/business owner/i)).toBeVisible();
  await expect(dialog.getByText(/a partner runs it: lungau lodging/i)).toBeVisible();
  await expect(dialog.getByText(/partners own the inventory/i)).toBeVisible();
  await expect(dialog.getByText(/human-provided/i).first()).toBeVisible();
  await expect(dialog.getByRole("heading", { name: /for agents/i })).toBeVisible();
  await expect(dialog.getByText(/webmcp|mcp|declared/i).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // 5. When was it verified? One click on the action that works.
  await page.locator(".three-actions").getByRole("button", { name: /search the site/i }).click();
  await expect(page.getByRole("dialog").getByText(/verified (just now|\d+ (minutes?|hours?|days?) ago)/i)).toBeVisible();
  await page.keyboard.press("Escape");

  // 6. What is published to agents? One click to Activate, where the three documents are readable
  // and, beneath them, the agent-facing surfaces list every document and interface, today and from this report.
  await page.getByRole("link", { name: /^activate$/i }).click();
  await expect(page).toHaveURL(/\/activate$/);
  for (const title of ["Business data", "Agent instructions", "Discovery"]) await expect(page.getByRole("article", { name: title })).toBeVisible();
  await page.locator("summary", { hasText: "For your engineers" }).click();
  await expect(page.getByRole("heading", { name: /what agents are given to read/i })).toBeVisible();
  await expect(page.getByText(/terms of action, the skill agents load/i)).toBeVisible();

  // Back on the report, one click opens the full audit for the rest.
  await page.goto(`/reports/${childId}`);
  await page.locator("summary", { hasText: "Full audit" }).click();

  // 8, again, for the whole business at once: the boundaries table, one click below, one row per action.
  const boundaries = page.getByRole("row", { name: /check availability/i }).filter({ hasText: /partner handoff/i });
  await expect(boundaries).toContainText("Lungau Lodging");
  await expect(boundaries).toContainText("Partners own the inventory.");
  await expect(boundaries).toContainText("Human-provided");
  // Six sections in the fold; the agent-facing surfaces moved to Activate, where publishing lives.
  await expect(page.getByRole("navigation", { name: /full audit sections/i }).getByRole("link")).toHaveCount(6);
});
