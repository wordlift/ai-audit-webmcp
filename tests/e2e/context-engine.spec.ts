import { expect, test } from "@playwright/test";

/**
 * The loop the brief asks for: claim the Context Engine, correct what it understood, see the
 * correction on the model, then read the site again and find the correction still there.
 * saas.example keeps this spec's decisions away from the sites other specs read.
 */
test("a claimed Context Engine keeps a correction across a new read of the site", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Website URL").fill("https://saas.example");
  await page.getByRole("button", { name: /audit my site/i }).click();
  await expect(page).toHaveURL(/\/reports\//);
  const firstUrl = page.url();
  await expect(page.getByText(/of saas\.example, WordLift built a model/)).toBeVisible();
  // A first visit says nothing about an unclaimed draft.
  await expect(page.getByText(/Draft Context Engine/)).toHaveCount(0);

  // Claim: the address goes with the expansion, and this browser now holds the engine.
  const offer = page.getByRole("region", { name: /claim your context engine/i });
  await offer.getByRole("button", { name: /claim your context engine/i }).click();
  await offer.getByLabel(/email address/i).fill("owner@example.com");
  await offer.getByRole("button", { name: /claim & expand/i }).click();
  await expect(page.getByText("Your Context Engine · claimed, ownership not verified")).toBeVisible();

  // Correct the model: one thing we found is not theirs.
  await page.locator("summary", { hasText: "Also tell us what matters" }).click();
  const question = page.getByRole("radiogroup", { name: /^Is .+ yours\?$/ }).first();
  const label = (await question.getAttribute("aria-label")) ?? "";
  const name = label.replace(/^Is /, "").replace(/ yours\?$/, "");
  await question.getByLabel("Not ours", { exact: true }).check();
  await page.getByRole("button", { name: /save my answers/i }).click();
  await expect(page).not.toHaveURL(firstUrl);

  // The correction shows where the model is, and the engine keeps it.
  await expect(page.getByText(/decision added · not ours:|decisions added · not ours:/)).toContainText(name);
  await expect(page.getByText(/Your Context Engine · claimed, ownership not verified · 1 decision kept/)).toBeVisible();

  // Back on the first report, the engine says a review landed since. Then a new read of the site:
  // the correction is carried onto it.
  await page.goto(firstUrl);
  await expect(page.getByText(/Reviewed since this report/)).toBeVisible();
  await page.getByRole("button", { name: /run again/i }).click();
  await expect(page).not.toHaveURL(firstUrl);
  await expect(page.getByText(/of saas\.example, WordLift built a model/)).toBeVisible();
  await page.getByRole("link", { name: /open it/i }).click();
  await expect(page.getByText(/Your earlier review carried over to this read/)).toBeVisible();
  await expect(page.getByText(/not ours:/)).toContainText(name);

  // Ownership is the next step, and it says so.
  await expect(page.getByRole("heading", { name: "Is saas.example yours?" })).toBeVisible();
  await page.getByRole("button", { name: "Verify ownership" }).click();
  await expect(page.getByText(/<meta name="wordlift-site-verification" content="wl-/)).toBeVisible();
});
