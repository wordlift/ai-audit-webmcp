import { expect, test } from "@playwright/test";

test("WebMCP invokes audit-website and exposes report-scoped explanation", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    type BrowserTool = { name: string; execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>> };
    const tools = new Map<string, BrowserTool>();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool(tool: BrowserTool, options: { signal: AbortSignal }) {
          tools.set(tool.name, tool);
          options.signal.addEventListener("abort", () => tools.delete(tool.name), { once: true });
        },
      },
    });
    Object.defineProperty(window, "__webMcpTools", { configurable: true, value: tools });
  });

  await page.goto("/");
  await expect.poll(() => page.evaluate(() => Array.from((window as never as { __webMcpTools: Map<string, unknown> }).__webMcpTools.keys()))).toEqual(["audit-website"]);

  const auditResult = await page.evaluate(async () => {
    const tools = (window as never as { __webMcpTools: Map<string, { execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>> }> }).__webMcpTools;
    return tools.get("audit-website")!.execute({ url: "https://alpina.travel" });
  });
  expect(auditResult).not.toHaveProperty("isError");
  expect(auditResult.structuredContent).toMatchObject({
    status: "completed",
    archetype: "travel-hospitality",
    stageCounts: { discover: 2, "understand-decide": 4, act: 2, manage: 2 },
  });
  await testInfo.attach("agent-audit-result.json", {
    body: Buffer.from(JSON.stringify(auditResult, null, 2)),
    contentType: "application/json",
  });

  const reportUrl = (auditResult.structuredContent as { reportUrl: string }).reportUrl;
  await page.goto(reportUrl);
  await expect(page.getByRole("heading", { name: "What an agent should be able to do" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Array.from((window as never as { __webMcpTools: Map<string, unknown> }).__webMcpTools.keys()).sort())).toEqual(["audit-website", "explain-capability"]);

  const explanation = await page.evaluate(async () => {
    const tools = (window as never as { __webMcpTools: Map<string, { execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>> }> }).__webMcpTools;
    return tools.get("explain-capability")!.execute({ actionId: "availability.check" });
  });
  expect(explanation).not.toHaveProperty("isError");
  expect(explanation.structuredContent).toMatchObject({ actionId: "availability.check", state: "unverified", humanSupport: true });
  await testInfo.attach("agent-capability-result.json", {
    body: Buffer.from(JSON.stringify(explanation, null, 2)),
    contentType: "application/json",
  });
  await page.screenshot({ path: testInfo.outputPath("agent-driven-report.png"), fullPage: true });
});
