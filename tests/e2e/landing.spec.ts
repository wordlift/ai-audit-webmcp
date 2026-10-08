import { expect, test, type Page } from "@playwright/test";

/** The model & evidence fold is one click away, and the specs take that click before reading it. */
const openFullAudit = (page: Page) => page.locator("summary", { hasText: "Model & evidence" }).click();

test("landing page asks one question and takes a URL", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /turn your website into a context engine for ai agents/i })).toBeVisible();
  await expect(page.getByLabel("Website URL")).toBeVisible();
  await expect(page.getByText(/checks what AI agents can actually do with it/i)).toBeVisible();
});

test("a site typed the way people type it, without https://, is audited", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Website URL").fill("alpina.travel");
  await page.getByRole("button", { name: /audit my site/i }).click();
  await expect(page).toHaveURL(/\/reports\//);
  await expect(page.getByText(/its Context Engine|AI agents can do \d+ of the \d+/i).first()).toBeVisible();
});

test("a report opens with the Context Engine, then three words, and keeps the model & evidence one click away", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Website URL").fill("https://shop.example");
  await page.getByRole("button", { name: /audit my site/i }).click();
  await expect(page).toHaveURL(/\/reports\//);

  // The first screen: the Context Engine first, then what agents can do with it, in plain words.
  await expect(page.getByRole("list", { name: /what wordlift understood/i })).toContainText(/declared|inferred/i);
  await expect(page.getByRole("button", { name: /review with chatgpt/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Can agents use it?" })).toBeVisible();
  await expect(page.getByRole("link", { name: /pitching to a client/i })).toHaveCount(0);
  await expect(page.getByText(/its Context Engine|AI agents can do \d+ of the \d+/i).first()).toBeVisible();
  const three = page.getByRole("list", { name: /the actions that matter/i });
  await expect(three.getByRole("listitem")).toHaveCount(3);
  await expect(three).toContainText(/works|fix this|talk to us/i);
  // The model, one card per thing, on the first screen; Fix names what needs fixing, or says in one line that nothing does.
  await expect(page.getByText(/fix what agents cannot understand|agents understand your business/i).first()).toBeVisible();
  await expect(page.getByRole("list", { name: "What WordLift understood" }).getByRole("listitem").filter({ hasText: "Trail Jacket" }).first()).toContainText("Product");
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
