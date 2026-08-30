import { expect, test } from "@playwright/test";

test("landing page communicates the agent capability workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /agents need a service map/i })).toBeVisible();
  await expect(page.getByLabel("Website URL")).toBeVisible();
  await expect(page.getByText("Extract entities & meaning")).toBeVisible();
});

test("fixture report presents the action graph and expandable evidence", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Website URL").fill("https://shop.example");
  await page.getByRole("button", { name: /build the service map/i }).click();
  await expect(page).toHaveURL(/\/reports\//);
  await expect(page.getByRole("heading", { name: /commerce \/ retail/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /from what the site means to what an agent can do/i })).toBeVisible();
  await expect(page.getByText("Trail Jacket", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "What an agent should be able to do" })).toBeVisible();
  await expect(page.getByText("Highest-impact gaps")).toBeVisible();
  await page.getByRole("button", { name: /retrieve details/i }).click();
  await expect(page.getByRole("dialog")).toContainText("Product structured data is declared");
  await expect(page.getByRole("dialog")).toContainText("Machine-readable capability contract");
});
