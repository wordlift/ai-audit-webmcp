import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

/**
 * The complete human-guided compilation: audit → inspect the machine draft → submit a reviewer's
 * decisions (as the refine-service-map tool would) → open the immutable child → see what changed.
 */
test("a human refinement turns the machine draft into a refined service map", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 1. Audit: the fixture travel site compiles a machine draft.
  await page.goto("/");
  await page.getByLabel("Website URL").fill("https://alpina.travel");
  await page.getByRole("button", { name: /audit and refine my site/i }).click();
  await expect(page).toHaveURL(/\/reports\//);

  // 2. The draft says whose interpretation it is, and offers the review path.
  await expect(page.getByText("Machine-generated service map")).toBeVisible();
  await expect(page.getByRole("button", { name: /review with chatgpt/i })).toBeVisible();

  // 3. Refinement: the decisions ChatGPT would submit through refine-service-map.
  const parentId = page.url().split("/reports/")[1];
  const response = await page.request.post(`/api/reports/${parentId}/refine`, {
    data: {
      businessRole: "destination-organization",
      terminology: [{ term: "availability", meaning: "partner lodging inventory" }],
      actionDecisions: [
        {
          actionId: "availability.check",
          decision: "confirm",
          boundary: "partner-handoff",
          rationale: "The organization helps visitors discover stays; partners own the inventory.",
        },
      ],
    },
  });
  expect(response.ok()).toBeTruthy();
  const child = (await response.json()) as { id: string; parentReportId: string };
  expect(child.parentReportId).toBe(parentId);

  // 4. The child is a new immutable report that names its human provenance and what changed.
  await page.goto(`/reports/${child.id}`);
  await expect(page.getByText("Human-refined service map")).toBeVisible();
  await expect(page.getByText(/destination organization/i)).toBeVisible();
  await expect(page.getByText(/"availability" means partner lodging inventory/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /compare with the machine draft/i })).toBeVisible();

  // 5. The affected action carries its responsibility boundary and the human rationale.
  const availability = page.getByRole("button", { name: /check availability/i });
  await expect(availability).toContainText(/partner handoff/i);
  await availability.click();
  await expect(page.getByRole("dialog")).toContainText(/partners own the inventory/i);
  await expect(page.getByRole("dialog")).toContainText(/human-provided/i);
  await page.keyboard.press("Escape");

  // 6. The machine draft is unchanged at its own URL.
  await page.goto(`/reports/${parentId}`);
  await expect(page.getByText("Machine-generated service map")).toBeVisible();

  // A refinement that references nothing in the report is refused, not silently accepted.
  const empty = await page.request.post(`/api/reports/${parentId}/refine`, {
    data: { actionDecisions: [{ actionId: "no.such-action", decision: "confirm" }] },
  });
  expect(empty.status()).toBe(400);

  // Idempotent creation guard: a fresh unrelated id 404s rather than refining another report.
  const missing = await page.request.post(`/api/reports/${randomUUID()}/refine`, {
    data: { businessRole: "merchant" },
  });
  expect(missing.status()).toBe(404);
});
