import { expect, test } from "@playwright/test";

/**
 * Three questions a site owner can answer in under a minute. The answers land in an immutable
 * child report through the same refinement the agent interview uses, and readiness does not move.
 */
test("a site owner says who runs each action, and the score stays where the evidence put it", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Website URL").fill("https://alpina.travel");
  await page.getByRole("button", { name: /audit my site/i }).click();
  await expect(page).toHaveURL(/\/reports\//);
  const parentUrl = page.url();
  const score = await page.locator(".first-score b").textContent();

  const questions = page.locator(".own-it-question");
  await expect(questions).toHaveCount(3);
  await questions.nth(0).getByLabel("We do", { exact: true }).check();
  await questions.nth(1).getByLabel("A partner does", { exact: true }).check();
  await questions.nth(1).getByLabel("Partner name").fill("Lungau Lodging");
  await questions.nth(2).getByLabel("We only describe it", { exact: true }).check();
  await page.getByRole("button", { name: /save my answers/i }).click();

  // A new version, not a change to the one that was open.
  await expect(page).not.toHaveURL(parentUrl);
  await expect(page).toHaveURL(/\/reports\/[0-9a-f-]{36}$/);
  const said = page.getByRole("list", { name: /what you said/i });
  await expect(said.getByRole("listitem")).toHaveCount(3);
  await expect(said).toContainText("Ours");
  await expect(said).toContainText("A partner runs it: Lungau Lodging");
  await expect(said).toContainText("Described only");
  await expect(page.locator(".first-score b")).toHaveText(score ?? "");

  // The precise vocabulary lives one click below, with the decision's provenance.
  await page.locator("summary", { hasText: "Full audit" }).click();
  await expect(page.getByText("Human-refined Terms of Action")).toBeVisible();
  await expect(page.getByText(/3 action boundaries decided/i)).toBeVisible();
});
