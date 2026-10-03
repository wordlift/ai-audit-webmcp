import { expect, test } from "@playwright/test";

/**
 * The correction where the model is read: a card is told it is not ours, the choice is saved, and the
 * reviewed version says so. publisher.example keeps this spec's review away from other specs' sites.
 */
test("a card on the first screen takes a correction, and the reviewed version shows it", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Website URL").fill("https://publisher.example");
  await page.getByRole("button", { name: /audit my site/i }).click();
  await expect(page).toHaveURL(/\/reports\//);
  const firstUrl = page.url();

  const cards = page.getByRole("list", { name: "What WordLift understood" });
  const group = cards.getByRole("group", { name: /^Is .+ right\?$/ }).first();
  const name = ((await group.getAttribute("aria-label")) ?? "").replace(/^Is /, "").replace(/ right\?$/, "");
  await group.getByRole("button", { name: "Not ours" }).click();
  await expect(page.getByRole("status").filter({ hasText: "1 correction ready" })).toBeVisible();
  await page.getByRole("button", { name: "Save 1 correction" }).click();

  await expect(page).not.toHaveURL(firstUrl);
  await expect(page.getByText(/decision added · not ours:/)).toContainText(name);
});
