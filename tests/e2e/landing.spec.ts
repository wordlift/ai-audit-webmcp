import { expect, test } from "@playwright/test";

test("landing page communicates the agent capability workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /agents need functions/i })).toBeVisible();
  await expect(page.getByLabel("Website URL")).toBeVisible();
  await expect(page.getByText("Map expected actions")).toBeVisible();
});
