import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * The brief's agent test: an AI agent reading the free report through its tools can answer
 * meaningful questions about the business from the model the audit built, and every answer keeps
 * declared, inferred and verified apart. The remote server answers the same tools the page does.
 */
const MCP_HEADERS = { accept: "application/json, text/event-stream", "content-type": "application/json" };

async function call(request: APIRequestContext, name: string, args: Record<string, unknown>, id: number) {
  const response = await request.post("/mcp", { headers: MCP_HEADERS, data: { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } } });
  expect(response.ok()).toBeTruthy();
  const raw = await response.text();
  const line = raw.split("\n").find((entry) => entry.startsWith("data:"));
  const body = JSON.parse(line ? line.slice(5) : raw) as { result: { isError?: boolean; content: Array<{ text: string }>; structuredContent: Record<string, unknown> } };
  return { text: body.result.content[0]?.text ?? "", structured: body.result.structuredContent, isError: Boolean(body.result.isError) };
}

test("an agent answers what the business offers, which entities matter, which are only inferred, and what it can do, with provenance intact", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Website URL").fill("https://alpina.travel");
  await page.getByRole("button", { name: /audit my site/i }).click();
  await expect(page).toHaveURL(/\/reports\//);
  await expect(page.locator(".first-screen")).toBeVisible({ timeout: 60_000 });
  const reportId = page.url().split("/reports/")[1]!;

  // What does this company offer, and which entities matter?
  const model = await call(page.request, "inspect-business-model", { reportId }, 1);
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
  const detail = await call(page.request, "explain-entity", { reportId, name: first.name }, 2);
  expect(detail.isError).toBe(false);
  const one = detail.structured as { id: string; provenance: string; pages: unknown[]; evidence: Array<{ verification: string }>; relations: unknown[] };
  expect(one.id).toBe(first.id);
  expect(one.provenance).toBe(first.provenance);
  expect(detail.text).toContain(`${first.name} (`);
  expect(detail.text).toContain("Full report:");

  // A name the model does not hold is refused with the names it does hold, never invented.
  const missing = await call(page.request, "explain-entity", { reportId, name: "Nobody Ever Heard Of" }, 3);
  expect(missing.isError).toBe(true);
  expect(missing.text).toContain("Known entities:");
});
