import { expect, test } from "@playwright/test";

test("a pitch puts three sites on one screen, shareable, and reads a repeated site from today's crawl", async ({ page, request }) => {
  await page.goto("/pitch");
  await page.getByLabel("Prospect website URL").fill("https://shop.example");
  await page.getByLabel("Competitor URL", { exact: true }).fill("https://publisher.example");
  await page.getByLabel(/second competitor url/i).fill("https://saas.example");
  await page.getByRole("button", { name: /compare them/i }).click();

  await expect(page).toHaveURL(/\/pitch\/[0-9a-f-]{36},[0-9a-f-]{36},[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: /shop\.example against publisher\.example and saas\.example/i })).toBeVisible();
  await expect(page.getByRole("list", { name: /agent readiness by site/i }).getByRole("listitem")).toHaveCount(3);
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("heading", { name: /fix these \d+ issues|nothing to fix/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /publish with wordlift/i })).toHaveAttribute("href", /report=[0-9a-f-]{36}/);

  // The same competitor in a second pitch is served from today's crawl: a new report, the old reading.
  const ids = new URL(page.url()).pathname.split("/").pop()!.split(",");
  await page.goto("/pitch");
  await page.getByLabel("Prospect website URL").fill("https://insurance.example");
  await page.getByLabel("Competitor URL", { exact: true }).fill("https://publisher.example");
  await page.getByRole("button", { name: /compare them/i }).click();
  await expect(page).toHaveURL(/\/pitch\/[0-9a-f-]{36},[0-9a-f-]{36}$/);
  const second = new URL(page.url()).pathname.split("/").pop()!.split(",");
  const competitor = await (await request.get(`/api/reports/${second[1]}`)).json();
  expect(competitor.reusedFrom).toBe(ids[1]);
});
