import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { createApp } from "../../src/server/app.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { documentStatus } from "../../src/server/adapters/scrape/NativeFetch.js";
import { AuditOrchestrator } from "../../src/server/services/AuditOrchestrator.js";
import {
  INSPECT_SERVICE_MAP_TOOL,
  REFINE_SERVICE_MAP_TOOL,
} from "../../src/client/webmcp/toolSchemas.js";

const fixedNow = new Date("2026-08-27T05:00:00.000Z");
const SHELL_TITLE = "WordLift AI Audit — Agent Capability Map";

/**
 * Mirrors the built shell rather than reading dist/, so the suite does not depend on a build
 * having run. The multi-line description meta is reproduced because the prerender has to strip it.
 */
const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="description"
      content="WordLift AI Audit maps what humans can do on a website to the functions AI agents need."
    />
    <title>${SHELL_TITLE}</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

const staticDirectory = mkdtempSync(path.join(os.tmpdir(), "ai-audit-shell-"));
writeFileSync(path.join(staticDirectory, "index.html"), SHELL);

function testApp() {
  const store = new MemoryReportStore(900_000, () => fixedNow);
  const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
    publicAppUrl: "https://audit.example/",
    ttlDays: 30,
    now: () => fixedNow,
  });
  return createApp({ orchestrator, staticDirectory });
}

async function completedReport(app: ReturnType<typeof testApp>): Promise<string> {
  const response = await request(app)
    .post("/api/reports")
    .send({ requestId: randomUUID(), url: "https://shop.example/", fixtureId: "commerce-retail" })
    .expect(200);
  return response.body.id as string;
}

describe("agent discovery documents", () => {
  it("serves robots.txt as plain text, not the SPA shell", async () => {
    const response = await request(testApp()).get("/robots.txt").expect(200);
    expect(response.headers["content-type"]).toMatch(/text\/plain/);
    expect(response.text).toMatch(/^User-agent: \*$/m);
    expect(response.text).toMatch(/^Allow: \/$/m);
    expect(response.text).not.toMatch(/<html/i);
  });

  it("serves an llms.txt that names the live tools", async () => {
    const response = await request(testApp()).get("/llms.txt").expect(200);
    expect(response.headers["content-type"]).toMatch(/text\/plain/);
    expect(response.text).toContain(INSPECT_SERVICE_MAP_TOOL.name);
    expect(response.text).toContain(REFINE_SERVICE_MAP_TOOL.name);
  });

  // The descriptor is generated from the constants the client registers, so a rename cannot leave
  // the published surface pointing at a tool that no longer exists.
  it("publishes a WebMCP descriptor that matches the registered tool names", async () => {
    const response = await request(testApp()).get("/.well-known/webmcp/tools.json").expect(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    const names = (response.body.tools as Array<{ name: string }>).map((tool) => tool.name);
    expect(names).toContain(INSPECT_SERVICE_MAP_TOOL.name);
    expect(names).toContain(REFINE_SERVICE_MAP_TOOL.name);
    expect(names).toContain("audit-website");
  });

  it("passes the collector's own soft-404 check", async () => {
    const app = testApp();
    for (const [kind, route] of [
      ["robots", "/robots.txt"],
      ["llms", "/llms.txt"],
      ["webmcp-tools", "/.well-known/webmcp/tools.json"],
    ] as const) {
      const response = await request(app).get(route).expect(200);
      expect(documentStatus(kind, response.status, response.text)).toBe("valid");
    }
  });
});

describe("report prerender", () => {
  it("gives a reader that runs no scripts the report itself", async () => {
    const app = testApp();
    const reportId = await completedReport(app);
    const response = await request(app).get(`/reports/${reportId}`).expect(200);

    expect(response.text).toContain("<title>https://shop.example/ — agent readiness");
    expect(response.text).toMatch(/<meta name="description" content="https:\/\/shop\.example\/ looks like a commerce\/retail site/);
    expect(response.text).toContain('<link rel="canonical" href="https://audit.example/reports/');
    expect(response.text).toContain("<noscript>");
    expect(response.text).toContain("Machine-generated Terms of Action");
    // The app still mounts into an empty root; the summary never competes with React.
    expect(response.text).toContain('<div id="root"></div>');
    expect(response.text).not.toMatch(/<meta\s+name="description"[^>]*maps what humans can do/);
  });

  it("escapes report text so site-authored content cannot inject markup", async () => {
    const app = testApp();
    const reportId = await completedReport(app);
    const response = await request(app).get(`/reports/${reportId}`).expect(200);

    const noscript = response.text.slice(response.text.indexOf("<noscript>"), response.text.indexOf("</noscript>"));
    expect(noscript).not.toMatch(/<(script|img|iframe|svg)\b/i);
    expect(noscript).toContain("&quot;");
  });

  it("emits JSON-LD that parses", async () => {
    const app = testApp();
    const reportId = await completedReport(app);
    const response = await request(app).get(`/reports/${reportId}`).expect(200);

    const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(response.text);
    expect(match).not.toBeNull();
    const parsed = JSON.parse((match as RegExpExecArray)[1] as string);
    expect(parsed["@type"]).toBe("Report");
    expect(parsed.url).toContain(reportId);
  });

  it("falls back to the untouched shell for a report that does not exist", async () => {
    const response = await request(testApp()).get("/reports/missing-report").expect(200);
    expect(response.text).not.toContain("<noscript>");
    expect(response.text).toContain(SHELL_TITLE);
  });
});
