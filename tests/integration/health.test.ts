import request from "supertest";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { createApp } from "../../src/server/app.js";
import { MemoryClaimStore } from "../../src/server/adapters/claims/index.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import { MemoryLeadStore } from "../../src/server/adapters/leads/index.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { AuditOrchestrator } from "../../src/server/services/AuditOrchestrator.js";

describe("GET /api/health", () => {
  it("reports a healthy service without leaking framework details", async () => {
    const response = await request(createApp()).get("/api/health").expect(200);

    expect(response.body).toEqual({
      status: "ok",
      service: "ai-audit-webmcp",
      revision: "local",
      release: "development",
      mode: "demo",
      surfaces: { mcp: null, deepScans: false, claimedRefinement: false },
    });
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("says which surfaces this revision actually answers on", async () => {
    const orchestrator = new AuditOrchestrator(new MemoryReportStore(), loadActionModel(), new FixtureProvider(), {
      publicAppUrl: "https://audit.example/",
      ttlDays: 30,
    });
    const app = createApp({ orchestrator, leads: new MemoryLeadStore(), claims: new MemoryClaimStore() });

    const response = await request(app).get("/api/health").expect(200);

    expect(response.body.surfaces).toEqual({ mcp: "/mcp", deepScans: true, claimedRefinement: true });
  });
});
