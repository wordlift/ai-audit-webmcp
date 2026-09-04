import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import request from "supertest";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { createApp } from "../../src/server/app.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { AuditOrchestrator } from "../../src/server/services/AuditOrchestrator.js";

const fixedNow = new Date("2026-08-27T05:00:00.000Z");
const TRAVEL = "https://alpina.travel/";

function buildApp() {
  const store = new MemoryReportStore(900_000, () => fixedNow);
  const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
    publicAppUrl: "https://audit.example/",
    ttlDays: 30,
    now: () => fixedNow,
  });
  return createApp({ orchestrator, rateLimits: { enabled: false } });
}

/** A real client over a real socket: the handshake is the part a hand-rolled request would fake. */
async function connectedClient(): Promise<{ client: Client; close: () => Promise<void> }> {
  const http: HttpServer = createServer(buildApp());
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const { port } = http.address() as AddressInfo;

  const client = new Client({ name: "ai-audit-tests", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
  await client.connect(transport);

  return {
    client,
    close: async () => {
      await client.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}

function structured<T = Record<string, unknown>>(result: unknown): T {
  return (result as { structuredContent: T }).structuredContent;
}

describe("remote MCP server", () => {
  it("initializes, lists the public tools, and keeps the demo sidecar out of them", async () => {
    const { client, close } = await connectedClient();
    try {
      const { tools } = await client.listTools();
      const names = tools.map((tool) => tool.name).sort();

      expect(names).toEqual([
        "audit-website",
        "explain-capability",
        "explain-foundation-audit",
        "get-audit-report",
        "inspect-terms-of-action",
        "refine-terms-of-action",
      ]);
      expect(names).not.toContain("check-alpina-availability");
      expect(names).not.toContain("inspect-service-map");

      const inspect = tools.find((tool) => tool.name === "inspect-terms-of-action");
      expect(inspect?.inputSchema.required).toContain("reportId");
      expect(client.getInstructions()).toContain("inspect-terms-of-action");
    } finally {
      await close();
    }
  });

  it("audits a site and reads the stored report back by id", async () => {
    const { client, close } = await connectedClient();
    try {
      const audited = await client.callTool({ name: "audit-website", arguments: { url: TRAVEL } });
      const summary = structured<{ reportId: string; archetype: string; reportUrl: string }>(audited);

      expect(audited.isError).toBeFalsy();
      expect(summary.archetype).toBe("travel-hospitality");
      expect(summary.reportUrl).toBe(`https://audit.example/reports/${summary.reportId}`);
      expect((audited.content as Array<{ text: string }>)[0].text).toContain("readiness");

      const reread = await client.callTool({
        name: "get-audit-report",
        arguments: { reportId: summary.reportId },
      });
      expect(structured<{ reportId: string }>(reread).reportId).toBe(summary.reportId);
    } finally {
      await close();
    }
  });

  it("walks inspect → refine and leaves the machine draft untouched", async () => {
    const { client, close } = await connectedClient();
    try {
      const audited = await client.callTool({ name: "audit-website", arguments: { url: TRAVEL } });
      const { reportId, agentReadinessScore } = structured<{ reportId: string; agentReadinessScore: number }>(audited);

      const inspected = await client.callTool({ name: "inspect-terms-of-action", arguments: { reportId } });
      const actions = structured<{ actions: Array<{ actionId: string }> }>(inspected).actions;
      expect(actions.length).toBeGreaterThan(0);

      const refined = await client.callTool({
        name: "refine-terms-of-action",
        arguments: {
          reportId,
          businessRole: "destination-organization",
          actionDecisions: [{ actionId: actions[0].actionId, decision: "confirm", boundary: "owned" }],
        },
      });
      const child = structured<{ reportId: string; parentReportId: string; agentReadinessScore: number }>(refined);

      expect(child.parentReportId).toBe(reportId);
      expect(child.reportId).not.toBe(reportId);
      expect(child.agentReadinessScore).toBe(agentReadinessScore);
    } finally {
      await close();
    }
  });

  it("reports a bad call as a tool error the model can recover from", async () => {
    const { client, close } = await connectedClient();
    try {
      const missing = await client.callTool({
        name: "get-audit-report",
        arguments: { reportId: "11111111-2222-4333-8444-555555555555" },
      });
      expect(missing.isError).toBe(true);
      expect((missing.content as Array<{ text: string }>)[0].text).toContain("audit-website");

      const malformed = await client.callTool({ name: "audit-website", arguments: {} });
      expect(malformed.isError).toBe(true);
    } finally {
      await close();
    }
  });

  it("says plainly that the endpoint is stateless rather than opening a stream", async () => {
    const response = await request(buildApp()).get("/mcp").expect(405);
    expect(response.body.error.message).toContain("stateless");
  });
});
