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
import { summarizeReportForAgent } from "../../src/shared/format/agentSummary.js";

const fixedNow = new Date("2026-08-27T05:00:00.000Z");
const TRAVEL = "https://alpina.travel/";

function buildService() {
  const store = new MemoryReportStore(900_000, () => fixedNow);
  const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
    publicAppUrl: "https://audit.example/",
    ttlDays: 30,
    now: () => fixedNow,
  });
  return { orchestrator, app: createApp({ orchestrator, rateLimits: { enabled: false } }) };
}

function buildApp() {
  return buildService().app;
}

/** A real client over a real socket: the handshake is the part a hand-rolled request would fake. */
async function connectedClient(): Promise<{
  client: Client;
  orchestrator: AuditOrchestrator;
  close: () => Promise<void>;
}> {
  const { app, orchestrator } = buildService();
  const http: HttpServer = createServer(app);
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const { port } = http.address() as AddressInfo;

  const client = new Client({ name: "ai-audit-tests", version: "1.0.1" });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
  await client.connect(transport);

  return {
    client,
    orchestrator,
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
  it("initializes, lists the five public tools, and keeps browser-only writes and the demo sidecar out", async () => {
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
      ]);
      expect(names).not.toContain("refine-terms-of-action");
      expect(names).not.toContain("check-alpina-availability");
      expect(names).not.toContain("inspect-service-map");

      const inspect = tools.find((tool) => tool.name === "inspect-terms-of-action");
      expect(inspect?.inputSchema.required).toContain("reportId");
      expect(inspect?.description).not.toContain("refine-terms-of-action");
      for (const tool of tools) expect(tool.title, `${tool.name} has no title on the wire`).toMatch(/^[A-Z]/);
      expect(inspect?.title).toBe("Read the Terms of Action");
      expect(client.getInstructions()).toContain("inspect-terms-of-action");
      expect(client.getInstructions()).toContain("review-only");
    } finally {
      await close();
    }
  });

  it("audits a site and reads the stored report back by id without a bearer claim", async () => {
    const { client, close } = await connectedClient();
    try {
      const audited = await client.callTool({ name: "audit-website", arguments: { url: TRAVEL } });
      const summary = structured<{ reportId: string; archetype: string; reportUrl: string }>(audited);

      expect(audited.isError).toBeFalsy();
      expect(summary.archetype).toBe("travel-hospitality");
      expect(summary.reportUrl).toBe(`https://audit.example/reports/${summary.reportId}`);
      expect((audited.content as Array<{ text: string }>)[0].text).toContain("readiness");
      expect(JSON.stringify(audited)).not.toMatch(/claimToken/i);

      const reread = await client.callTool({
        name: "get-audit-report",
        arguments: { reportId: summary.reportId },
      });
      expect(structured<{ reportId: string }>(reread).reportId).toBe(summary.reportId);
    } finally {
      await close();
    }
  });

  it("inspects a report but refuses the browser-only refinement write", async () => {
    const { client, orchestrator, close } = await connectedClient();
    try {
      const audited = await client.callTool({ name: "audit-website", arguments: { url: TRAVEL } });
      const { reportId } = structured<{ reportId: string }>(audited);

      const inspected = await client.callTool({ name: "inspect-terms-of-action", arguments: { reportId } });
      const actions = structured<{ actions: Array<{ actionId: string }> }>(inspected).actions;
      expect(actions.length).toBeGreaterThan(0);

      const before = await orchestrator.get(reportId);
      const attemptedWrite = await client.callTool({
        name: "refine-terms-of-action",
        arguments: {
          reportId,
          businessRole: "destination-organization",
          actionDecisions: [{ actionId: actions[0].actionId, decision: "confirm", boundary: "owned" }],
        },
      });

      expect(attemptedWrite.isError).toBe(true);
      expect((attemptedWrite.content as Array<{ text: string }>)[0].text).toContain("No tool named");
      const after = await orchestrator.get(reportId);
      expect(after).toEqual(before);
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

  it("puts the same object on the wire that an in-page tool would build", async () => {
    const { client, orchestrator, close } = await connectedClient();
    try {
      const audited = await client.callTool({ name: "audit-website", arguments: { url: TRAVEL } });
      const remote = structured<{ reportId: string }>(audited);

      const stored = await orchestrator.get(remote.reportId);
      const inPage = summarizeReportForAgent(stored!, orchestrator.reportUrl(remote.reportId));

      expect(remote).toEqual(inPage);
    } finally {
      await close();
    }
  });

  it("carries findings without carrying the page they came from", async () => {
    const { client, close } = await connectedClient();
    try {
      const audited = await client.callTool({ name: "audit-website", arguments: { url: TRAVEL } });
      const { reportId } = structured<{ reportId: string }>(audited);
      const inspected = await client.callTool({ name: "inspect-terms-of-action", arguments: { reportId } });
      const foundation = await client.callTool({ name: "explain-foundation-audit", arguments: { reportId } });

      const wire = JSON.stringify([audited, inspected, foundation]).toLowerCase();
      for (const leak of ["<html", "<script", "set-cookie", "authorization:", "api_key", "bearer ", "claimtoken"]) {
        expect(wire, `an MCP result must never carry ${leak}`).not.toContain(leak);
      }
    } finally {
      await close();
    }
  });

  it("says plainly that the endpoint is stateless rather than opening a stream", async () => {
    const response = await request(buildApp()).get("/mcp").expect(405);
    expect(response.body.error.message).toContain("stateless");
  });
});
