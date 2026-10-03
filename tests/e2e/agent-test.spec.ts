import { expect, test, type Page } from "@playwright/test";

/**
 * The brief's agent test: an AI agent reading the free report through its tools can answer
 * meaningful questions about the business from the model the audit built, and every answer keeps
 * declared, inferred and verified apart. The business-model tools live on the page, so the test
 * calls them the way a browser agent does: through Chrome's own WebMCP, against the tools the
 * open report registered. The public remote MCP surface is review-only and does not carry them.
 */
test.use({ launchOptions: { args: ["--enable-features=WebMCPTesting"] } });

type ToolResult = { content?: Array<{ text?: string }>; structuredContent?: Record<string, unknown>; isError?: boolean };

async function call(page: Page, name: string, args: Record<string, unknown>) {
  // A tool registers when the report route mounts; wait until the browser lists it.
  await expect
    .poll(() => page.evaluate(async (tool) => {
      const testing = (navigator as unknown as { modelContextTesting?: { listTools: () => Promise<Array<{ name: string }>> } }).modelContextTesting;
      return testing ? (await testing.listTools()).some((entry) => entry.name === tool) : false;
    }, name), { timeout: 15_000 })
    .toBe(true);
  const raw = await page.evaluate(async ([tool, input]) => {
    const testing = (navigator as unknown as { modelContextTesting: { executeTool: (name: string, args: string) => Promise<unknown> } }).modelContextTesting;
    return testing.executeTool(tool, JSON.stringify(input));
  }, [name, args] as const);
  const body = (typeof raw === "string" ? JSON.parse(raw) : raw) as ToolResult;
  return { text: body.content?.[0]?.text ?? "", structured: body.structuredContent ?? {}, isError: Boolean(body.isError) };
}

test("an agent answers what the business offers, which entities matter, which are only inferred, and what it can do, with provenance intact", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Website URL").fill("https://alpina.travel");
  await page.getByRole("button", { name: /audit my site/i }).click();
  await expect(page).toHaveURL(/\/reports\//);
  await expect(page.locator(".first-screen")).toBeVisible({ timeout: 60_000 });
  const reportId = page.url().split("/reports/")[1]!;

  // What does this company offer, and which entities matter?
  const model = await call(page, "inspect-business-model", { reportId });
  expect(model.isError).toBe(false);
  const business = model.structured as { site: { host: string }; counts: Record<string, number>; business: { name: string } | null; entities: Array<{ id: string; name: string; role: string; provenance: string; answersFor: Array<{ agentReady: boolean; state: string }> }>; capabilities: Array<{ state: string; agentReady: boolean }>; boundaries: string };
  expect(business.site.host).toBe("alpina.travel");
  expect(business.business?.name).toBeTruthy();
  expect(business.entities.length).toBeGreaterThan(0);

  // Which are only inferred, and which were declared: every entity says, and the text says too.
  for (const entity of business.entities) expect(["declared", "inferred", "human-confirmed"]).toContain(entity.provenance);
  expect(business.counts.declared + business.counts.inferred + business.counts.humanConfirmed).toBe(business.counts.entities);
  expect(model.text).toMatch(/declared in the site's markup, \d+ inferred from its text/);
  expect(model.text).toContain("Actions an agent can perform today:");
  expect(model.text).toContain("never move readiness");

  // What can an agent do here today: only what was invoked, never what a word or a markup said.
  for (const capability of business.capabilities) expect(capability.agentReady).toBe(capability.state === "agent-ready");
  for (const entity of business.entities) for (const action of entity.answersFor) expect(action.agentReady).toBe(action.state === "agent-ready");

  // One entity in full, by the name a person would use, with the pages it was seen on and its evidence.
  const first = business.entities[0]!;
  const detail = await call(page, "explain-entity", { reportId, name: first.name });
  expect(detail.isError).toBe(false);
  const one = detail.structured as { id: string; provenance: string; pages: unknown[]; evidence: Array<{ verification: string }>; relations: unknown[] };
  expect(one.id).toBe(first.id);
  expect(one.provenance).toBe(first.provenance);
  expect(detail.text).toContain(`${first.name} (`);
  expect(detail.text).toContain("Full report:");

  // A name the model does not hold is refused with the names it does hold, never invented.
  const missing = await call(page, "explain-entity", { reportId, name: "Nobody Ever Heard Of" });
  expect(missing.isError).toBe(true);
  expect(missing.text).toContain("Known entities:");
});
