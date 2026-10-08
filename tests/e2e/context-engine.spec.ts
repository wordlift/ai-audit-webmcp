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

  // Correct the model where it is read: one card is not theirs. The first correction claims the
  // engine for this browser; no address is asked for on the report.
  await expect(page.getByRole("textbox", { name: /email/i })).toHaveCount(0);
  const cards = page.getByRole("list", { name: "What WordLift understood" });
  const group = cards.getByRole("group", { name: /^Is .+ right\?$/ }).first();
  const name = ((await group.getAttribute("aria-label")) ?? "").replace(/^Is /, "").replace(/ right\?$/, "");
  await group.getByRole("button", { name: "Not ours" }).click();
  await page.getByRole("button", { name: "Save 1 correction" }).click();
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
