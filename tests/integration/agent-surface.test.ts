import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { shareCard } from "../../src/server/routes/agentSurface.js";
import type { ReportRecord } from "../../src/shared/types/index.js";
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
writeFileSync(
  path.join(staticDirectory, "privacy.html"),
  "<!doctype html><html><head><title>Privacy Policy</title></head><body><h1>Privacy Policy</h1></body></html>",
);

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

  it("publishes the former tool names as deprecated, pointing at the current ones", async () => {
    const response = await request(testApp()).get("/.well-known/webmcp/tools.json").expect(200);
    const tools = response.body.tools as Array<{ name: string; deprecated?: boolean; replacedBy?: string }>;

    const inspectAlias = tools.find((tool) => tool.name === "inspect-service-map");
    const refineAlias = tools.find((tool) => tool.name === "refine-service-map");
    expect(inspectAlias).toMatchObject({ deprecated: true, replacedBy: INSPECT_SERVICE_MAP_TOOL.name });
    expect(refineAlias).toMatchObject({ deprecated: true, replacedBy: REFINE_SERVICE_MAP_TOOL.name });

    // The current names are the ones a reader is told to call.
    expect(tools.find((tool) => tool.name === INSPECT_SERVICE_MAP_TOOL.name)?.deprecated).toBeUndefined();
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

    // The site is named by its host: a raw address in a title or a description becomes a second link in a chat.
    expect(response.text).toContain("<title>shop.example: how AI understands this business, and what agents can do · WordLift AI Audit</title>");
    const description = /<meta name="description" content="([^"]*)"/.exec(response.text)![1]!;
    expect(description).not.toMatch(/https?:\/\//);
    expect(description).toMatch(/expected actions? (is|are) verified for AI agents|None of its \d+ expected actions is verified for AI agents yet/);
    expect(description).toMatch(/Read from \d+ pages?\.$/);
    expect(response.text).toContain('<link rel="canonical" href="https://audit.example/reports/');
    expect(response.text).toContain("<noscript>");
    expect(response.text).toContain("Machine-generated Terms of Action");
    // The app still mounts into an empty root; the summary never competes with React.
    expect(response.text).toContain('<div id="root"></div>');
    expect(response.text).not.toMatch(/<meta\s+name="description"[^>]*maps what humans can do/);
  });

  it("gives a shared link a preview: site name, title, description and an image a chat can draw", async () => {
    const app = testApp();
    const reportId = await completedReport(app);
    for (const path of [`/reports/${reportId}`, `/reports/${reportId}/activate`]) {
      const html = (await request(app).get(path).expect(200)).text;
      const tag = (property: string) => new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)"`).exec(html)?.[1];
      expect(tag("og:site_name")).toBe("WordLift AI Audit");
      // The card's title leaves the product's name to the site name, and never opens with an address.
      expect(tag("og:title")).toBe("shop.example: how AI understands this business, and what agents can do");
      expect(tag("og:description")).toBe(tag("description"));
      expect(tag("og:url")).toBe(`https://audit.example/reports/${reportId}`);
      // Absolute, and a PNG: a relative address or an SVG is the grey placeholder.
      expect(tag("og:image")).toBe("https://audit.example/brand/share-card.png");
      expect(tag("og:image:width")).toBe("1200");
      expect(tag("og:image:height")).toBe("630");
      expect(tag("twitter:card")).toBe("summary_large_image");
      expect(tag("twitter:image")).toBe(tag("og:image"));
      // One of each: a second og:image or title would be the one a scraper picks.
      for (const property of ["og:title", "og:image", "og:description"]) expect(html.split(`property="${property}"`).length - 1).toBe(1);
    }
  });

  it("says who the business is only when the report settled it, and quotes the site otherwise", () => {
    const base = { id: "11111111-1111-4111-8111-111111111111", status: "completed", phase: "complete", mode: "demo", requestedUrl: "https://www.shop.example/it", createdAt: "2026-10-13T08:00:00.000Z", expiresAt: "2026-11-12T08:00:00.000Z", actionModelVersion: "0.1.0", errors: [], evidenceTruncated: false } satisfies ReportRecord;
    const page = { url: "https://www.shop.example/it", title: "Shop", role: "entry" as const, description: "Outdoor clothing made to last, repaired for free.", headings: [], entityIds: [] };
    const entity = (id: string, name: string, origin?: "inferred") => ({ id, types: ["Organization"], name, alternateNames: [], sourceUrls: [page.url], sameAs: [], offers: [], confidence: 0.6, ...(origin ? { origin } : {}) });
    const action = (actionId: string, state: "agent-ready" | "missing") => ({ actionId, label: actionId, description: "d", stage: "discover" as const, intent: "informational" as const, importance: 3 as const, expected: true, expectationSource: ["archetype:commerce-retail"], state, humanSupport: false, agentSupport: state === "agent-ready", appliesTo: [], evidence: [] });
    const graph = (entities: ReturnType<typeof entity>[]) => ({ pages: [page], entities, lexicalEntries: [], interfaces: [], bindings: [] });

    // Only the text names an organization: it is not introduced as the business, and the site speaks for itself.
    const unsettled = shareCard({ ...base, contextGraph: graph([entity("x", "Some Partner Inc", "inferred")]), capabilities: [action("site.search", "missing"), action("detail.retrieve", "missing")] } as ReportRecord);
    expect(unsettled.title).toBe("shop.example: how AI understands this business, and what agents can do");
    expect(unsettled.description).toBe("In its own words: “Outdoor clothing made to last, repaired for free.” None of its 2 expected actions is verified for AI agents yet. Read from 1 page.");
    expect(unsettled.description).not.toContain("Some Partner Inc");
    // Declared by the site: the business is said, and the count is the page's count.
    const settled = shareCard({ ...base, contextGraph: graph([entity("org", "Trail Shop")]), capabilities: [action("site.search", "agent-ready"), action("detail.retrieve", "missing")] } as ReportRecord);
    expect(settled.description).toMatch(/^Trail Shop is /);
    expect(settled.description).toContain("1 of 2 expected actions is verified for AI agents.");
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

describe("the home page shared as a link", () => {
  it("carries its own preview, with an absolute image", async () => {
    const html = (await request(testApp()).get("/").expect(200)).text;
    expect(html).toContain("<title>WordLift AI Audit: see how AI understands your business, and what agents can do</title>");
    expect(html).toContain('<meta property="og:image" content="https://audit.example/brand/share-card.png" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain('<div id="root"></div>');
  });
});

describe("privacy policy", () => {
  it("serves the policy as plain HTML ahead of the SPA fallback", async () => {
    const response = await request(testApp()).get("/privacy").expect(200);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
    expect(response.text).toContain("Privacy Policy");
    expect(response.text).not.toContain(SHELL_TITLE);
  });

  it("is announced where agents look before they look at the page", async () => {
    const app = testApp();
    const llms = await request(app).get("/llms.txt").expect(200);
    expect(llms.text).toContain("/privacy");
    const manifest = await request(app).get("/.well-known/webmcp/tools.json").expect(200);
    expect(manifest.body.privacyPolicy).toMatch(/\/privacy$/);
  });
});
