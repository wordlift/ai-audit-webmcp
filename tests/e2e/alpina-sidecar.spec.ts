import { expect, test } from "@playwright/test";

/**
 * The before/after proof. This test calls the real, public, read-only Alpina availability endpoint,
 * so it is skipped in CI where outbound calls to a third party would be flaky and impolite.
 * Run it locally to regenerate the submission screenshots.
 */
test.skip(Boolean(process.env.CI), "calls the live Alpina availability API");

test("a human-run sidecar call turns an unverified action into a verified agent function", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto("/");
  await page.getByLabel("Website URL").fill("https://alpina.travel");
  await page.getByRole("button", { name: /audit and refine my site/i }).click();
  await expect(page).toHaveURL(/\/reports\//);

  const availabilityNode = page.getByRole("button", { name: /check availability/i });
  await expect(availabilityNode).toContainText(/unverified/i);
  await page.screenshot({ path: testInfo.outputPath("sidecar-before.png"), fullPage: true });

  // The adapter lives behind the Labs fold now — a reference, not the product story.
  await page.getByText(/labs — approved-adapter reference/i).click();
  await page.getByRole("heading", { name: /turn one unverified capability/i }).scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: /run agent function/i }).click();

  await expect(page.getByRole("status").filter({ hasText: /created no booking/ })).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: testInfo.outputPath("sidecar-result.png"), fullPage: true });

  // The successful invocation becomes a new immutable revision of the report.
  await expect(page).toHaveURL(/\/reports\//, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /check availability/i })).toContainText(/sidecar enabled/i, {
    timeout: 15_000,
  });
  await page.screenshot({ path: testInfo.outputPath("sidecar-after.png"), fullPage: true });
});
