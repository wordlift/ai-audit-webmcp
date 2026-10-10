import { expect, test } from "@playwright/test";
import { audit, openEvidence, step } from "./helpers";

test("landing page asks one question and takes a URL", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /your business, as ai agents read it/i })).toBeVisible();
  await expect(page.getByLabel("Website URL")).toBeVisible();
  await expect(page.getByText(/checks what AI agents can actually do with it/i)).toBeVisible();
});

test("a site typed the way people type it, without https://, is audited", async ({ page }) => {
  await audit(page, "alpina.travel");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("alpina.travel");
});

test("a report opens on the business, then what agents can do, and keeps the model & evidence one click away", async ({ page }) => {
  await audit(page, "https://shop.example");

  // The doorway: the host, its sector, what was understood with provenance, then the four-stage map.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("shop.example");
  await expect(page.getByText(/Commerce \/ Retail/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "What we understood about your business" })).toBeVisible();
  const core = page.getByRole("list", { name: /core entities/i });
  await expect(core).toContainText(/declared|inferred/i);
  await expect(core.getByRole("listitem").filter({ hasText: "Trail Jacket" }).first()).toContainText("Product");
  await expect(page.getByRole("heading", { name: "What can agents do here?" })).toBeVisible();
  for (const stage of ["Discover", "Understand & decide", "Act", "Manage"]) await expect(page.getByRole("heading", { name: stage, exact: true })).toBeVisible();
  await expect(page.getByText(/\d+ \/ \d+ verified/)).toBeVisible();
  await expect(page.getByRole("link", { name: /pitching to a client/i })).toHaveCount(0);
  // The precise names stay off the first screen.
  await expect(page.getByRole("heading", { name: /commerce \/ retail/i })).toHaveCount(0);

  // The three steps are views over the same report.
  await expect(step(page, "Audit")).toHaveAttribute("aria-current", "step");
  await step(page, "Fix").click();
  await expect(page.getByRole("heading", { level: 1, name: "Make your business actionable." })).toBeVisible();
  await expect(step(page, "Fix")).toHaveAttribute("aria-current", "step");

  // One click away, the model with its exact names.
  await openEvidence(page);
  await expect(page.getByRole("heading", { name: /commerce \/ retail/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /from what the site means to what an agent can do/i })).toBeVisible();
  await expect(page.getByText("Trail Jacket", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "What an agent should be able to do" })).toBeVisible();
  await expect(page.getByText("Highest-impact gaps")).toBeVisible();
  await page.locator(".action-map").getByRole("button", { name: /retrieve details/i }).click();
  await expect(page.getByRole("dialog")).toContainText("Product structured data is declared");
  await expect(page.getByRole("dialog")).toContainText("Machine-readable capability contract");
});
