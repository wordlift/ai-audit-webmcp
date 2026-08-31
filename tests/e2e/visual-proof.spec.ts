import { expect, test, type Page } from "@playwright/test";

async function openTravelReport(page: Page) {
  await page.goto("/");
  await page.getByLabel("Website URL").fill("https://alpina.travel");
  await page.getByRole("button", { name: /build the service map/i }).click();
  await expect(page).toHaveURL(/\/reports\//);
  await expect(page.getByRole("heading", { name: "What an agent should be able to do" })).toBeVisible();
}

test("visual proof captures the desktop capability map", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openTravelReport(page);
  await expect(page.getByText(/Structured data published with/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("travel-report-desktop.png"), fullPage: true });
  await page.getByText("Full WordLift audit").click();
  await expect(page.getByRole("heading", { name: "Audit findings" })).toBeVisible();
  await expect(page.getByText("Structured data inventory")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("foundation-audit-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: /check availability/i }).click();
  await expect(page.getByRole("dialog")).toContainText("How to close the gap");
  await page.screenshot({ path: testInfo.outputPath("availability-contract-desktop.png"), fullPage: true });
});

test("visual proof captures the mobile capability map", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTravelReport(page);
  await expect(page.getByText("Agent readiness")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("travel-report-mobile.png"), fullPage: true });
});
