import { expect, test } from "@playwright/test";

test("landing page communicates the agent capability workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /agents need functions/i })).toBeVisible();
  await expect(page.getByLabel("Website URL")).toBeVisible();
  await expect(page.getByText("Map expected actions")).toBeVisible();
});

test("fixture report presents the action graph and expandable evidence", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Website URL").fill("https://alpina.travel");
  await page.getByRole("button", { name: /map capabilities/i }).click();
  await expect(page).toHaveURL(/\/reports\//);
  await expect(page.getByRole("heading", { name: /travel \/ hospitality/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What an agent should be able to do" })).toBeVisible();
  await expect(page.getByText("Highest-impact gaps")).toBeVisible();
  await page.getByRole("button", { name: /check availability/i }).click();
  await expect(page.getByRole("dialog")).toContainText("People can check dates through the booking interface");
  await expect(page.getByRole("dialog")).toContainText("Machine-readable capability contract");
});
