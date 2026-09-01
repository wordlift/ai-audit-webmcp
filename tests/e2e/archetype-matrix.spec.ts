import { expect, test } from "@playwright/test";

const FIXTURES = [
  { url: "https://shop.example", archetype: /commerce \/ retail/i, entity: "Trail Jacket", action: /retrieve details/i, pages: 3 },
  { url: "https://publisher.example", archetype: /publisher \/ content/i, entity: "How agents change digital commerce", action: /retrieve details/i, pages: 3 },
  { url: "https://alpina.travel", archetype: /travel \/ hospitality/i, entity: "AlpiNest Feriendorf Lungau", action: /check availability/i, pages: 4 },
  { url: "https://insurance.example", archetype: /finance \/ insurance/i, entity: "Travel Cover", action: /request a quote/i, pages: 3 },
  { url: "https://saas.example", archetype: /saas/i, entity: "Context Cloud", action: /start a trial/i, pages: 3 },
  // The "other" bucket reads as "a general site" — never "a other site".
  { url: "https://organization.example", archetype: /general/i, entity: "Example Foundation", action: /submit an inquiry/i, pages: 3 },
] as const;

for (const fixture of FIXTURES) {
  test(`${fixture.url} compiles a complete entity-aware service map`, async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Website URL").fill(fixture.url);
    await page.getByRole("button", { name: /build the service map/i }).click();

    await expect(page).toHaveURL(/\/reports\//);
    await expect(page.getByRole("heading", { name: fixture.archetype }).first()).toBeVisible();
    await expect(page.getByText(`${fixture.pages} representative pages analyzed`)).toBeVisible();
    await expect(page.getByText(/classification selects the expected action journey/i)).toBeVisible();

    await page.getByRole("button", { name: new RegExp(fixture.entity, "i") }).first().click();
    await expect(page.getByRole("button", { name: fixture.action }).first()).toBeVisible();
  });
}
