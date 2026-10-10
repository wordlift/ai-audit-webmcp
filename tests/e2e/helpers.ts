import { expect, type Page } from "@playwright/test";

/** Audits a site from the landing page and waits for the report's first screen. */
export async function audit(page: Page, url: string): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Website URL").fill(url);
  await page.getByRole("button", { name: /audit my site/i }).click();
  await expect(page).toHaveURL(/\/reports\//);
  await expect(page.locator(".doorway")).toBeVisible({ timeout: 60_000 });
  return reportIdOf(page);
}

export function reportIdOf(page: Page): string {
  return /\/reports\/([0-9a-f-]{36})/.exec(page.url())![1]!;
}

/** The model & evidence is one click from every screen: the link in the bar. */
export async function openEvidence(page: Page): Promise<void> {
  await page.getByRole("banner").getByRole("link", { name: "Evidence" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Model & evidence" })).toBeVisible();
}

export const step = (page: Page, name: "Audit" | "Fix" | "Activate") => page.getByRole("navigation", { name: "Steps" }).getByRole("link", { name });
