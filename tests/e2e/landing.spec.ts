import { expect, test, type Page } from "@playwright/test";

/** The full audit is one click away, and the specs take that click before reading it. */
const openFullAudit = (page: Page) => page.locator("summary", { hasText: "Full audit" }).click();

test("landing page asks one question and takes a URL", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /can ai agents understand and use your business/i })).toBeVisible();
  await expect(page.getByLabel("Website URL")).toBeVisible();
  await expect(page.getByText(/what stops them, and what to fix/i)).toBeVisible();
});

test("a report opens with three words and keeps the full audit one click away", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Website URL").fill("https://shop.example");
  await page.getByRole("button", { name: /audit my site/i }).click();
  await expect(page).toHaveURL(/\/reports\//);

  // The first screen: one sentence, three actions, plain words, nothing precise.
  await expect(page.getByText(/AI agents can do \d+ of the \d+ things? that matter on/i)).toBeVisible();
  const three = page.getByRole("list", { name: /the actions that matter/i });
  await expect(three.getByRole("listitem")).toHaveCount(3);
  await expect(three).toContainText(/works|fix this|talk to us/i);
  // Understand follows: every entity the audit read, named plainly, with where it was found.
  await expect(page.getByRole("heading", { name: /fix what agents cannot understand|agents understand your business/i })).toBeVisible();
  await page.getByText(/see what agents currently understand/i).click();
  await expect(page.locator(".entity-row").filter({ hasText: "Trail Jacket" })).toBeVisible();
  await expect(page.locator(".entity-row").filter({ hasText: "Trail Jacket" })).toContainText("Product");
  // The full audit says what it is before it opens, and the precise names stay behind it.
  await expect(page.getByText(/Evidence, entities, terminology, actions, governance/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /commerce \/ retail/i })).toBeHidden();

  // One click below, the model with its exact names.
  await openFullAudit(page);
  await expect(page.getByRole("heading", { name: /commerce \/ retail/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /from what the site means to what an agent can do/i })).toBeVisible();
  await expect(page.getByText("Trail Jacket", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "What an agent should be able to do" })).toBeVisible();
  await expect(page.getByText("Highest-impact gaps")).toBeVisible();
  await page.locator(".action-map").getByRole("button", { name: /retrieve details/i }).click();
  await expect(page.getByRole("dialog")).toContainText("Product structured data is declared");
  await expect(page.getByRole("dialog")).toContainText("Machine-readable capability contract");
});
