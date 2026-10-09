import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

/**
 * The complete human-guided compilation: audit → inspect the machine draft → submit a reviewer's
 * decisions (as the refine-terms-of-action tool would) → open the immutable child → see what changed.
 */
test("a human refinement turns the machine draft into refined Terms of Action", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 1. Audit: the fixture travel site compiles a machine draft.
  await page.goto("/");
  await page.getByLabel("Website URL").fill("https://alpina.travel");
  await page.getByRole("button", { name: /audit my site/i }).click();
  await expect(page).toHaveURL(/\/reports\//);

  // 2. The draft says whose interpretation it is, and offers the review path. Playwright has no
  // WebMCP, so the self-test badge must say exactly which browser the reader needs.
  await page.locator("summary", { hasText: "Model & evidence" }).click();
  await expect(page.getByText("Machine-generated Terms of Action")).toBeVisible();
  // The review is offered beside the Context Engine on the first screen, and again in the fold: the same prompt from either door.
  await expect(page.getByRole("button", { name: /review with chatgpt/i })).toHaveCount(2);
  await expect(page.getByText(/site tools require a webmcp-enabled browser/i)).toBeVisible();

  // 3. Refinement: the decisions ChatGPT would submit through refine-terms-of-action.
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

  // 4. The child is a new immutable report that EMBODIES the judgment: the human role leads the
  // header, the change summary is compact with the full log folded away, and human vocabulary
  // sits in the lexical graph itself.
  await page.goto(`/reports/${child.id}`);
  await page.locator("summary", { hasText: "Model & evidence" }).click();
  await expect(page.getByText("Human-refined Terms of Action")).toBeVisible();
  await expect(page.getByRole("heading", { name: /destination organization/i })).toBeVisible();
  await expect(page.getByText(/machine archetype: travel \/ hospitality/i)).toBeVisible();
  await expect(page.getByText(/1 term clarified/i)).toBeVisible();
  await page.getByText("Full decision log").click();
  await expect(page.getByText(/"availability" means partner lodging inventory/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /compare with the machine draft/i })).toBeVisible();
  await expect(page.locator(".lexical-human").filter({ hasText: "availability" })).toBeVisible();

  // 5. The affected action carries its responsibility boundary and the human rationale.
  const availability = page.locator(".action-map").getByRole("button", { name: /check availability/i });
  await expect(availability).toContainText(/partner handoff/i);
  await availability.click();
  await expect(page.getByRole("dialog")).toContainText(/partners own the inventory/i);
  await expect(page.getByRole("dialog")).toContainText(/human-provided/i);
  await page.keyboard.press("Escape");

  // 6. The machine draft is unchanged at its own URL.
  await page.goto(`/reports/${parentId}`);
  await page.locator("summary", { hasText: "Model & evidence" }).click();
  await expect(page.getByText("Machine-generated Terms of Action")).toBeVisible();

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

/**
 * The one thing the audit asks a visitor for is asked while the audit runs. When the audit lands
 * before anyone could answer — a site read earlier that day, or demo mode, where it lands at once —
 * the report asks the same thing once, as a strip that can be dismissed, and never again for that
 * report in that tab. A link opened cold is not asked at all.
 */
test("a report that landed at once asks for the address once, and a shared link never does", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Website URL").fill("https://alpina.travel");
  await page.getByRole("button", { name: /audit my site/i }).click();
  await expect(page).toHaveURL(/\/reports\//);
  await expect(page.locator(".first-screen")).toBeVisible({ timeout: 60_000 });
  const reportId = page.url().split("/reports/")[1]!;

  const late = page.getByRole("textbox", { name: /landed fast.*by email too/i });
  await expect(late).toBeVisible();
  await expect(page.getByRole("button", { name: /claim your context engine/i })).toHaveCount(0);
  await page.getByRole("button", { name: "No thanks" }).click();
  await expect(page.getByRole("textbox", { name: /email/i })).toHaveCount(0);

  // Dismissed is remembered for this tab; a cold open of the link never asks.
  await page.reload();
  await expect(page.locator(".first-screen")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("textbox", { name: /email/i })).toHaveCount(0);

  const delivery = await page.request.post(`/api/reports/${reportId}/deliver`, { data: { email: "reviewer@example.com", surface: "web" } });
  expect(delivery.status()).toBe(202);
  expect(await delivery.json()).toMatchObject({ reportId, maskedEmail: "re******@example.com", status: "completed" });

  // The address is never written into a page anyone with the link can open.
  await page.reload();
  await expect(page.locator(".first-screen")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("reviewer@example.com")).toHaveCount(0);
});
