import request from "supertest";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { createApp } from "../../src/server/app.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { PlatformEgress } from "../../src/server/security/platformEgress.js";
import type { RateLimitOptions } from "../../src/server/security/rateLimits.js";
import { AuditOrchestrator } from "../../src/server/services/AuditOrchestrator.js";

const fixedNow = new Date("2026-08-27T05:00:00.000Z");
const MCP_HEADERS = { accept: "application/json, text/event-stream", "content-type": "application/json" };

/** Three different addresses inside Anthropic's published /21: what three claude.ai users look like. */
const CLAUDE = ["160.79.104.10", "160.79.105.11", "160.79.111.12"];
/** Two addresses nobody published: a Claude Desktop and a Codex user on their own machines. */
const DIRECT = ["203.0.113.9", "203.0.113.10"];

function buildApp(limits: { audits?: RateLimitOptions; mcp?: RateLimitOptions } = {}) {
  const store = new MemoryReportStore(900_000, () => fixedNow);
  const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
    publicAppUrl: "https://audit.example/",
    ttlDays: 30,
    now: () => fixedNow,
  });
  return createApp({
    orchestrator,
    // Production sits behind one proxy hop, and the address the limiter sees is the forwarded one.
    trustProxy: true,
    platformEgress: new PlatformEgress([{ platform: "anthropic", cidr: "160.79.104.0/21" }]),
    rateLimits: { windowMs: 60_000, perIp: 100, platform: 100, global: 1_000, ...limits.audits },
    mcpRateLimits: { windowMs: 60_000, perIp: 100, platform: 100, global: 1_000, ...limits.mcp },
  });
}

type App = ReturnType<typeof buildApp>;

let nextId = 1;
const audit = (app: App, from: string, url = "https://shop.example/") =>
  request(app)
    .post("/mcp")
    .set(MCP_HEADERS)
    .set("x-forwarded-for", from)
    .send({ jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name: "audit-website", arguments: { url } } });

const list = (app: App, from: string) =>
  request(app).post("/mcp").set(MCP_HEADERS).set("x-forwarded-for", from).send({ jsonrpc: "2.0", id: nextId++, method: "tools/list", params: {} });

describe("rate-limit tiers for hosted assistants", () => {
  it("gives a hosted assistant one pool instead of one address's budget", async () => {
    const app = buildApp({ audits: { perIp: 1, platform: 2 } });

    // Two users, two addresses in the range, one pool: both audit.
    expect((await audit(app, CLAUDE[0] as string)).body.result.isError).toBeFalsy();
    expect((await audit(app, CLAUDE[1] as string)).body.result.isError).toBeFalsy();

    // A third address in the same range is the same pool, and the pool is spent.
    const third = await audit(app, CLAUDE[2] as string);
    expect(third.status).toBe(429);
    expect(third.body.error).toBe("rate_limited");
    expect(third.body.message).toMatch(/Claude has used the audits reserved for it/);
    expect(third.headers["retry-after"]).toBeDefined();
  });

  it("leaves direct clients their own budget while a pool is spent", async () => {
    const app = buildApp({ audits: { perIp: 1, platform: 1 } });
    await audit(app, CLAUDE[0] as string);
    expect((await audit(app, CLAUDE[1] as string)).status).toBe(429);

    // A person on their own machine is limited as themselves, and only as themselves.
    expect((await audit(app, DIRECT[0] as string)).body.result.isError).toBeFalsy();
    const again = await audit(app, DIRECT[0] as string);
    expect(again.status).toBe(429);
    expect(again.body.message).toMatch(/Too many audits from this address/);
    expect((await audit(app, DIRECT[1] as string)).body.result.isError).toBeFalsy();
  });

  it("tiers the conversation pool the same way", async () => {
    const app = buildApp({ mcp: { perIp: 1, platform: 2 } });

    expect((await list(app, CLAUDE[0] as string)).status).toBe(200);
    expect((await list(app, CLAUDE[1] as string)).status).toBe(200);
    const third = await list(app, CLAUDE[2] as string);
    expect(third.status).toBe(429);
    expect(third.body.message).toMatch(/Claude has used the MCP calls reserved for it/);

    expect((await list(app, DIRECT[0] as string)).status).toBe(200);
  });

  it("reports the ranges it holds on the health endpoint", async () => {
    const health = await request(buildApp()).get("/api/health").expect(200);
    expect(health.body.platformEgress).toEqual({ anthropic: 1 });
  });

  it("limits every address as itself when no platform is known", async () => {
    const store = new MemoryReportStore(900_000, () => fixedNow);
    const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
      publicAppUrl: "https://audit.example/",
      ttlDays: 30,
      now: () => fixedNow,
    });
    const app = createApp({ orchestrator, trustProxy: true, rateLimits: { windowMs: 60_000, perIp: 1, global: 1_000 } });

    expect((await audit(app, CLAUDE[0] as string)).body.result.isError).toBeFalsy();
    expect((await audit(app, CLAUDE[1] as string)).body.result.isError).toBeFalsy();
    expect((await audit(app, CLAUDE[0] as string)).status).toBe(429);
  });
});
