import { expect, test, type Page } from "@playwright/test";
import { audit, step } from "./helpers";

/**
 * The page's agent interface is the same on the rebuilt surface as it was before it: every tool is
 * registered on every view of a report, and each one answers. Called the way a browser agent calls
 * them, through Chrome's own WebMCP, against what the open page registered.
 */
test.use({ launchOptions: { args: ["--enable-features=WebMCPTesting"] } });

type ToolResult = { content?: Array<{ text?: string }>; structuredContent?: Record<string, unknown>; isError?: boolean };
type Testing = { listTools: () => Promise<Array<{ name: string }>>; executeTool: (name: string, args: string) => Promise<unknown> };

const REPORT_TOOLS = ["inspect-terms-of-action", "inspect-business-model", "explain-entity", "explain-capability", "explain-foundation-audit", "refine-terms-of-action"];
const EVERYWHERE = ["audit-website", "get-audit-report"];

const listed = (page: Page) =>
  page.evaluate(async () => {
    const testing = (navigator as unknown as { modelContextTesting?: Testing }).modelContextTesting;
    return testing ? (await testing.listTools()).map((entry) => entry.name).sort() : [];
  });

async function expectTools(page: Page, names: string[]) {
  await expect.poll(async () => { const have = await listed(page); return names.every((name) => have.includes(name)); }, { timeout: 15_000 }).toBe(true);
}

async function call(page: Page, name: string, args: Record<string, unknown>) {
  await expectTools(page, [name]);
  const raw = await page.evaluate(async ([tool, input]) => {
    const testing = (navigator as unknown as { modelContextTesting: Testing }).modelContextTesting;
    return testing.executeTool(tool, JSON.stringify(input));
  }, [name, args] as const);
  const body = (typeof raw === "string" ? JSON.parse(raw) : raw) as ToolResult;
  return { text: body.content?.[0]?.text ?? "", structured: body.structuredContent ?? {}, isError: Boolean(body.isError) };
}

test("every tool is registered on every view of a report, and the bar's two on Activate", async ({ page }) => {
  await audit(page, "https://shop.example");
  await expectTools(page, [...EVERYWHERE, ...REPORT_TOOLS]);
  await step(page, "Fix").click();
  await expect(page.getByRole("heading", { level: 1, name: "Make your business actionable." })).toBeVisible();
  await expectTools(page, [...EVERYWHERE, ...REPORT_TOOLS]);
  // With detail open and a modal over it, nothing is unregistered.
  await page.locator(".capability-table .row-open").first().click();
  await page.getByRole("complementary").getByRole("button", { name: /review ownership/i }).click();
  await expectTools(page, [...EVERYWHERE, ...REPORT_TOOLS]);
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("banner").getByRole("link", { name: "Evidence" }).click();
  await expectTools(page, [...EVERYWHERE, ...REPORT_TOOLS]);
  await step(page, "Activate").click();
  await expect(page.getByRole("heading", { level: 1, name: "Activate your Context Engine." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expectTools(page, EVERYWHERE);
  // On the landing page too.
  await page.goto("/");
  await expectTools(page, EVERYWHERE);
});

test("each tool answers on the rebuilt surface, and a refinement through the tool lands as a reviewed version", async ({ page }) => {
  const reportId = await audit(page, "https://insurance.example");

  const report = await call(page, "get-audit-report", { reportId });
  expect(report.isError).toBe(false);
  expect(JSON.stringify(report.structured)).toContain(reportId);

  const terms = await call(page, "inspect-terms-of-action", { reportId });
  expect(terms.isError).toBe(false);
  expect(terms.text.length).toBeGreaterThan(40);

  const model = await call(page, "inspect-business-model", { reportId });
  expect(model.isError).toBe(false);
  const business = model.structured as { entities: Array<{ id: string; name: string }>; capabilities: Array<{ actionId: string }> };
  expect(business.entities.length).toBeGreaterThan(0);

  const entity = await call(page, "explain-entity", { reportId, entityId: business.entities[0]!.id });
  expect(entity.isError).toBe(false);
  expect(entity.text).toContain(business.entities[0]!.name);

  const actionId = business.capabilities[0]!.actionId;
  const capability = await call(page, "explain-capability", { reportId, actionId });
  expect(capability.isError).toBe(false);
  expect(JSON.stringify(capability.structured)).toContain(actionId);

  const foundation = await call(page, "explain-foundation-audit", { reportId });
  expect(foundation.isError).toBe(false);
  expect(foundation.text.length).toBeGreaterThan(20);

  // The write: the same contract the modals use. The answer names the child, and the page shows it as saved there.
  const refined = await call(page, "refine-terms-of-action", { reportId, actionDecisions: [{ actionId, decision: "confirm", boundary: "owned" }] });
  expect(refined.isError).toBe(false);
  const childId = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.exec(JSON.stringify(refined.structured).replace(reportId, ""))?.[0];
  expect(childId).toBeTruthy();
  await page.goto(`/reports/${childId}?view=capabilities&action=${encodeURIComponent(actionId)}#step-fix`);
  await expect(page.getByRole("complementary").getByLabel("Saved responsibility")).toContainText("Our team");

  // A new audit through the tool, from the page an agent is on.
  const started = await call(page, "audit-website", { url: "https://publisher.example" });
  expect(started.isError).toBe(false);
  expect(started.text).toMatch(/publisher\.example/);
});

test("the approved availability tool is offered on alpina.travel only", async ({ page }) => {
  await audit(page, "https://alpina.travel");
  await expectTools(page, ["check-alpina-availability"]);
  await audit(page, "https://shop.example");
  await expect.poll(async () => (await listed(page)).includes("check-alpina-availability"), { timeout: 10_000 }).toBe(false);
});
