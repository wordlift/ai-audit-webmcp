import { expect, test } from "@playwright/test";
import { audit, step } from "./helpers";

/**
 * The loop the brief asks for: claim the Context Engine, correct what it understood, see the
 * correction on the model, then read the site again and find the correction still there.
 * saas.example keeps this spec's decisions away from the sites other specs read.
 */
test("a claimed Context Engine keeps a correction across a new read of the site", async ({ page }) => {
  await audit(page, "https://saas.example");
  const firstUrl = page.url();
  // A first visit says nothing about an unclaimed draft.
  await expect(page.getByText(/Draft · not claimed/)).toHaveCount(0);

  // The audit landed at once, so the report asks for the address once; declining it is the end of
  // that. Correct the model where it is read: one entity is peripheral. The first correction claims
  // the engine for this browser, no address needed.
  await page.getByRole("button", { name: "No thanks" }).click();
  await expect(page.getByRole("textbox", { name: /email/i })).toHaveCount(0);
  await page.getByRole("button", { name: /review core entities/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radiogroup").first().getByRole("radio", { name: "Peripheral" }).check();
  await dialog.getByRole("button", { name: /save review/i }).click();
  await expect(page).not.toHaveURL(firstUrl);

  // The correction shows where the model is, and the engine keeps it.
  await expect(page.getByText("1 marked peripheral")).toBeVisible();
  await expect(page.getByText(/Kept in this browser · ownership not verified · 1 decision kept/)).toBeVisible();

  // Back on the first report, the engine says a review landed since. Then a new read of the site:
  // the correction is carried onto it.
  await page.goto(firstUrl);
  await expect(page.getByText(/Reviewed since this report/)).toBeVisible();
  await page.getByRole("button", { name: /run again/i }).click();
  await expect(page).not.toHaveURL(firstUrl);
  await expect(page.locator(".doorway")).toBeVisible();
  await page.getByRole("link", { name: /open it/i }).click();
  await expect(page.getByText(/Your earlier review carried over to this read/)).toBeVisible();
  await expect(page.getByText("1 marked peripheral")).toBeVisible();

  // Ownership is the next step, beside the business model, and it says so.
  await step(page, "Fix").click();
  await page.getByRole("tab", { name: "Business model" }).click();
  await expect(page.getByRole("heading", { name: "Is saas.example yours?" })).toBeVisible();
  await page.getByRole("button", { name: "Verify ownership" }).click();
  await expect(page.getByText(/<meta name="wordlift-site-verification" content="wl-/)).toBeVisible();
});
