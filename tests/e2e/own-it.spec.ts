import { expect, test } from "@playwright/test";
import { audit, openEvidence, step } from "./helpers";

/**
 * Who handles an action: one explicit decision in a focused modal. It lands in an immutable child
 * report through the same refinement the agent interview uses, and readiness does not move.
 */
test("a site owner says who handles an action, and readiness stays where the evidence put it", async ({ page }) => {
  await audit(page, "https://alpina.travel");
  const parentUrl = page.url();
  const readiness = await page.locator(".readiness").textContent();

  await step(page, "Fix").click();
  await page.getByRole("button", { name: "Check availability" }).click();
  const inspector = page.getByRole("complementary", { name: "Check availability" });
  await expect(inspector).toBeVisible();
  const trigger = inspector.getByRole("button", { name: /review ownership/i });
  await trigger.click();

  // Nothing is preselected for an action nobody has decided about, and nothing can be saved yet.
  const dialog = page.getByRole("dialog");
  for (const radio of await dialog.getByRole("radio").all()) await expect(radio).not.toBeChecked();
  const save = dialog.getByRole("button", { name: /save decision/i });
  await expect(save).toBeDisabled();

  // A partner needs a name; the fields appear only for that answer.
  await expect(dialog.getByLabel("Partner name")).toHaveCount(0);
  await dialog.getByRole("radio", { name: /a partner/i }).check();
  await expect(save).toBeDisabled();
  await dialog.getByLabel("Partner name").fill("Lungau Lodging");
  await expect(dialog.getByText("alpina.travel hands “Check availability” to Lungau Lodging.")).toBeVisible();
  await save.click();

  // A new version, not a change to the one that was open; the same view and the same selection.
  await expect(page).not.toHaveURL(parentUrl);
  await expect(page).toHaveURL(/\/reports\/[0-9a-f-]{36}\?.*action=availability\.check.*#step-fix$/);
  await expect(page.getByRole("status").filter({ hasText: "Reviewed version saved." })).toContainText("Agent readiness is unchanged");
  await expect(inspector.getByLabel("Saved responsibility")).toContainText("A partner: Lungau Lodging");
  await expect(page.getByRole("row", { name: /check availability/i })).toContainText("Handled by: A partner (Lungau Lodging)");
  // The next step is offered, not opened.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(inspector.getByRole("button", { name: /change ownership/i })).toBeVisible();

  await step(page, "Audit").click();
  await expect(page.locator(".readiness")).toHaveText(readiness ?? "");

  // The precise vocabulary lives one click away, with the decision's provenance.
  await openEvidence(page);
  await expect(page.getByText("Human-refined Terms of Action")).toBeVisible();
  await expect(page.getByText(/1 action boundary decided/i)).toBeVisible();
});

test("closing the ownership modal returns focus to where it was opened, and Escape closes the inspector back onto its row", async ({ page }) => {
  await audit(page, "https://alpina.travel");
  await step(page, "Fix").click();
  const row = page.getByRole("button", { name: "Submit an inquiry" });
  await row.click();
  const trigger = page.getByRole("complementary").getByRole("button", { name: /review ownership/i });
  await trigger.click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary")).toHaveCount(0);
  await expect(row).toBeFocused();
});
