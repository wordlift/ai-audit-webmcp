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
  await page.locator(".doorway").waitFor();

  // 7. What is inferred versus explicitly declared? No click: every entity on the first screen says which.
  await expect(page.getByRole("list", { name: /core entities/i }).getByText(/declared|inferred|confirmed/i).first()).toBeVisible();

  // 1, 2, 3, 4 and 8: one click on the action. The inspector says what it applies to, who handles it and
  // why, as a person's word; a second click shows which interfaces implement it and the evidence.
  await page.locator(".stage-map").getByRole("button", { name: /check availability/i }).click();
  const inspector = page.getByRole("complementary", { name: "Check availability" });
  await expect(inspector.getByRole("heading", { name: /about th(is|ese) entit/i })).toBeVisible();
  const saved = inspector.getByLabel("Saved responsibility");
  await expect(saved).toContainText("A partner: Lungau Lodging");
  await expect(saved).toContainText("Partners own the inventory.");
  await expect(saved).toContainText(/saved in a review/i);
  await expect(saved).toContainText("It is not evidence that the action works.");
  await inspector.getByRole("button", { name: /inspect evidence & contract/i }).click();
  await expect(inspector.getByRole("heading", { name: "For agents" })).toBeVisible();
  await expect(inspector.getByText(/declared by the site|called, and it/i).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // 5. When was it verified? One click on the action that works.
  await page.locator(".stage-map").getByRole("button", { name: /search the site/i }).click();
  await expect(page.getByRole("complementary").getByText(/verified (just now|\d+ (minutes?|hours?|days?) ago)/i)).toBeVisible();
  await page.keyboard.press("Escape");

  // 6. What is published to agents? One click to Activate, where the publication preview is, and one
  // more for the files and the agent-facing surfaces, today and from this report.
  await page.getByRole("navigation", { name: "Steps" }).getByRole("link", { name: "Activate" }).click();
  await expect(page).toHaveURL(/\/activate$/);
  await expect(page.getByRole("tabpanel").getByRole("row", { name: /check availability/i })).toContainText("Included as a handoff to Lungau Lodging");
  await page.locator("summary", { hasText: "Technical files & contracts" }).click();
  for (const file of ["page.jsonld", "ai-catalog.json", "skill.md"]) await expect(page.locator(".file-list code", { hasText: file })).toBeVisible();
  await expect(page.getByRole("heading", { name: /what agents are given to read/i })).toBeVisible();
  await expect(page.getByText(/terms of action, the skill agents load/i)).toBeVisible();

  // Back on the report, one click opens the model & evidence for the rest.
  await page.goto(`/reports/${childId}#full-audit`);

  // 8, again, for the whole business at once: the boundaries table, one click below, one row per action.
  const boundaries = page.getByRole("row", { name: /check availability/i }).filter({ hasText: /partner handoff/i });
  await expect(boundaries).toContainText("Lungau Lodging");
  await expect(boundaries).toContainText("Partners own the inventory.");
  await expect(boundaries).toContainText("Human-provided");
  // Six sections in the fold; the agent-facing surfaces moved to Activate, where publishing lives.
  await expect(page.getByRole("navigation", { name: /model and evidence sections/i }).getByRole("link")).toHaveCount(6);
});
