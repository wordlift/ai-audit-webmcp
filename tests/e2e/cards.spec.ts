import { expect, test } from "@playwright/test";
import { audit } from "./helpers";

/**
 * The entity review, where the model is read: one entity is marked peripheral, the choice is saved
 * through the existing refinement, and the reviewed version that comes back says so.
 * publisher.example keeps this spec's review away from other specs' sites.
 */
test("the entity review saves a priority as a reviewed version, and Cancel writes nothing", async ({ page }) => {
  await audit(page, "https://publisher.example");
  const firstUrl = page.url();
  const refinements: string[] = [];
  page.on("request", (request) => { if (request.method() === "POST" && request.url().endsWith("/refine")) refinements.push(request.url()); });

  // Cancel after a change: nothing is written, and the page is where it was.
  await page.getByRole("button", { name: /review core entities/i }).click();
  const dialog = page.getByRole("dialog", { name: "What belongs at the core?" });
  await expect(dialog.getByText("No changes yet")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /save review/i })).toBeDisabled();
  const first = dialog.getByRole("radiogroup").first();
  const name = ((await first.getAttribute("aria-label")) ?? "").replace(/^Priority for /, "");
  await first.getByRole("radio", { name: "Peripheral" }).check();
  await expect(dialog.getByText("1 change staged")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(refinements).toHaveLength(0);
  await expect(page).toHaveURL(firstUrl);

  // Save: a new version, with what changed said back, and readiness where the evidence put it.
  const readiness = await page.locator(".readiness").textContent();
  await page.getByRole("button", { name: /review core entities/i }).click();
  await dialog.getByRole("radiogroup", { name: `Priority for ${name}` }).first().getByRole("radio", { name: "Peripheral" }).check();
  await dialog.getByRole("button", { name: /save review/i }).click();
  await expect(page).not.toHaveURL(firstUrl);
  expect(refinements).toHaveLength(1);
  await expect(page.getByRole("status").filter({ hasText: "Reviewed version saved." })).toContainText("1 entity marked peripheral.");
  await expect(page.getByText("1 marked peripheral")).toBeVisible();
  await expect(page.locator(".readiness")).toHaveText(readiness ?? "");

  // The reviewed version opens the review on the saved state, with nothing staged.
  await page.getByRole("button", { name: /explore all entities/i }).click();
  await expect(dialog.getByRole("radio", { name: "Peripheral", checked: true })).toHaveCount(1);
  await expect(dialog.getByText("No changes yet")).toBeVisible();
});
