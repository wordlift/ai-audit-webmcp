import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The design handoff's completion criterion, walked on the report it was drawn from: a reviewer can
 * identify the site and sector, inspect one core entity, understand one capability gap, and find the
 * activation route, without losing context or confusing review with verification. The observed
 * wordlift.io report (nothing verified, mixed provenance, linked identities, an unsettled business)
 * is served from a snapshot, so a fresh scan changing never invalidates the check.
 */
const report = JSON.parse(readFileSync(resolve(process.cwd(), "tests/fixtures/reports/wordlift-zero-ready.json"), "utf8")) as { id: string };

async function open(page: Page, suffix = "") {
  await page.route(`**/api/reports/${report.id}`, (route) => route.fulfill({ json: report }));
  await page.goto(`/reports/${report.id}${suffix}`);
}

test("a reviewer recognises the business, inspects an entity and a gap, and finds the route to activate", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);

  // The site and its sector, and whether it runs WordLift, at once.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("wordlift.io");
  await expect(page.getByText(/Software \/ SaaS/)).toContainText("5 pages analyzed");
  await expect(page.getByRole("heading", { name: "WordLift detected" })).toBeVisible();
  await expect(page.getByText("Business identity needs review")).toBeVisible();
  await expect(page.getByText("0 / 8 verified")).toBeVisible();

  // Detection evidence opens in the inspector, and says what it does not prove.
  await page.getByRole("button", { name: /view detection evidence/i }).click();
  const detection = page.getByRole("complementary", { name: "WordLift detected" });
  await expect(detection).toContainText("The WordLift WordPress plugin is installed.");
  await expect(detection).toContainText("It is not an account connection");
  await detection.getByRole("button", { name: /close/i }).click();
  await expect(detection).toBeHidden();

  // One core entity: its provenance, where it was read, its linked identity. Nothing is staged by looking.
  await page.getByRole("button", { name: "Details for WordLift" }).click();
  const review = page.getByRole("dialog", { name: "What belongs at the core?" });
  await expect(review.getByRole("heading", { name: "Why WordLift?" })).toBeVisible();
  await expect(review.getByText("Inferred from text")).toBeVisible();
  await expect(review.getByRole("link", { name: /WordLift on Wikidata/ }).first()).toHaveAttribute("href", "https://www.wikidata.org/wiki/Q31998763");
  await expect(review.getByText("No changes yet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(review).toBeHidden();

  // One capability gap, from the map: the same inspector Fix uses, and the selection travels there.
  await page.locator(".stage-map").getByRole("button", { name: /submit an inquiry/i }).click();
  const inspector = page.getByRole("complementary", { name: "Submit an inquiry" });
  await expect(inspector).toContainText("No agent-accessible interface was found in this scan.");
  await expect(inspector).toContainText("This defines responsibility. It does not verify execution.");
  await page.getByRole("navigation", { name: "Steps" }).getByRole("link", { name: "Fix" }).click();
  await expect(page).toHaveURL(/action=inquiry\.submit.*#step-fix$/);
  await expect(page.getByRole("row", { name: /submit an inquiry/i })).toHaveAttribute("aria-selected", "true");
  await expect(inspector).toBeVisible();

  // Filtering keeps the selection; closing the inspector keeps the filter.
  await page.getByRole("combobox").selectOption("no-interface");
  await expect(page.getByRole("row", { name: /start a trial/i })).toHaveCount(0);
  await inspector.getByRole("button", { name: /close/i }).click();
  await expect(page).toHaveURL(/filter=no-interface/);
  await expect(page.getByRole("row", { name: /compare plans/i })).toBeVisible();

  // The other detected actions stay reachable, and the activation route is always in sight.
  await page.getByRole("combobox").selectOption("all");
  await page.getByRole("button", { name: /4 other detected actions/ }).click();
  await expect(page.getByRole("row", { name: /search the site/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /continue to activate/i })).toHaveAttribute("href", `/reports/${report.id}/activate`);
});

test("the vocabulary review needs a meaning for a replacement", async ({ page }) => {
  await open(page, "?view=vocabulary#step-fix");
  const term = page.locator(".term-list li").first();
  await term.getByRole("radio", { name: "Replace" }).check();
  await expect(page.getByRole("button", { name: /save review/i })).toBeDisabled();
  await expect(page.getByText(/A replacement needs a meaning/)).toBeVisible();
  await term.getByRole("textbox").fill("How we describe our service");
  await expect(page.getByRole("button", { name: /save review/i })).toBeEnabled();
});

for (const width of [1440, 1024, 390]) {
  test(`at ${width}px nothing overflows, and the inspector is ${width >= 1181 ? "beside the table" : width > 720 ? "a drawer" : "the whole screen"}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(1);
    // Every stage and both statuses stay readable: the map is sections, never compressed tiles.
    for (const stage of ["Discover", "Understand & decide", "Act", "Manage"]) await expect(page.getByRole("heading", { name: stage, exact: true })).toBeVisible();

    await open(page, "?action=inquiry.submit#step-fix");
    const inspector = page.getByRole("complementary", { name: "Submit an inquiry" });
    await expect(inspector).toBeVisible();
    const box = (await inspector.boundingBox())!;
    const position = await inspector.evaluate((element) => getComputedStyle(element).position);
    if (width >= 1181) expect(position).toBe("sticky");
    else {
      expect(position).toBe("fixed");
      if (width <= 720) expect(Math.round(box.width)).toBe(width);
      else expect(box.width).toBeLessThan(width);
    }
    await inspector.getByRole("button", { name: /close/i }).click();
    expect(await overflow()).toBeLessThanOrEqual(1);
    await expect(page.getByRole("row", { name: /submit an inquiry/i })).toContainText("Observed");
    await expect(page.getByRole("row", { name: /submit an inquiry/i })).toContainText("No interface found");
  });
}
