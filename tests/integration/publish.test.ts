import { randomUUID } from "node:crypto";
import { parseHTML } from "linkedom";
import request from "supertest";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { ardManifestSchema } from "../../src/domain/publish/ardSchema.js";
import { compilePublication, gapLine, organizationType, publishableEntities, publishedAs } from "../../src/domain/publish/publication.js";
import { createApp } from "../../src/server/app.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import { interfacesNamedIn, isSkillEntry, parseCatalogEntries, sameOriginEntries } from "../../src/server/adapters/scrape/agentCatalog.js";
import { findEntryPoints } from "../../src/server/adapters/scrape/entryPoints.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { AuditOrchestrator } from "../../src/server/services/AuditOrchestrator.js";
import { bucketFor } from "../../src/server/services/VisitLedger.js";
import type { CapabilityResult, ReportRecord } from "../../src/shared/types/index.js";

const fixedNow = new Date("2026-09-07T09:00:00.000Z");
const ALPINA = new URL("https://alpina.travel/");

function harness() {
  const store = new MemoryReportStore(900_000, () => fixedNow);
  const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
    publicAppUrl: "https://audit.example/",
    ttlDays: 30,
    now: () => fixedNow,
  });
  return { store, orchestrator };
}

/** The alpina fixture, audited and then refined the way the three questions and the interview would. */
async function refinedAlpina(orchestrator: AuditOrchestrator) {
  const parent = await orchestrator.create({ requestId: randomUUID(), url: ALPINA.toString() });
  const child = await orchestrator.refine(parent.id, {
    businessRole: "destination-organization",
    terminology: [{ term: "availability", meaning: "partner lodging inventory" }],
    actionDecisions: [
      { actionId: "site.search", decision: "confirm", boundary: "owned" },
      {
        actionId: "availability.check",
        decision: "confirm",
        boundary: "partner-handoff",
        partner: { name: "Lungau Lodging", url: "https://lungau-lodging.example/book" },
        rationale: "Partners own the inventory.",
      },
      { actionId: "detail.retrieve", decision: "confirm", boundary: "informational-only" },
      { actionId: "items.compare", decision: "confirm", boundary: "not-applicable" },
      { actionId: "policy.explain", decision: "reject" },
    ],
  });
  return { parent, child };
}

const graphOf = (jsonLd: Record<string, unknown>) => jsonLd["@graph"] as Array<Record<string, unknown>>;
const actionsIn = (jsonLd: Record<string, unknown>) =>
  graphOf(jsonLd).flatMap((node) => (Array.isArray(node.potentialAction) ? (node.potentialAction as Array<Record<string, unknown>>) : []));

describe("what the owner decided becomes what the page carries", () => {
  it("follows the table, action by action", async () => {
    const { orchestrator } = harness();
    const { child } = await refinedAlpina(orchestrator);
    const publication = await orchestrator.publish(child.id);
    const row = (actionId: string) => publication.actions.find((action) => action.actionId === actionId);

    expect(publication.host).toBe("alpina.travel");
    expect(publication.decided).toBe(child.refinement?.decisions);
    // Own it, and an entry point answered: the action, with the entry point the audit called.
    expect(row("site.search")).toMatchObject({ publishedAs: "action", boundary: "owned", entryPoint: { protocol: "mcp", via: "site", httpMethod: "POST" } });
    expect(row("site.search")?.entryPoint?.url).toContain("/mcp/alpina/http/mcp");
    // Hand it off: the action, with the partner as provider.
    expect(row("availability.check")).toMatchObject({ publishedAs: "handoff", provider: { name: "Lungau Lodging", url: "https://lungau-lodging.example/book" } });
    // Describe only: the entity alone. Not ours, and rejected: nothing.
    expect(row("detail.retrieve")?.publishedAs).toBe("entity");
    expect(row("items.compare")).toMatchObject({ publishedAs: "nothing", because: expect.stringContaining("not yours") });
    expect(row("policy.explain")).toMatchObject({ publishedAs: "nothing", because: expect.stringContaining("not yours") });
    // Undecided and unverified: the entity, because nothing is declared that the audit could not call.
    expect(row("inquiry.submit")).toMatchObject({ publishedAs: "entity", because: expect.stringContaining("could not call") });

    const actions = actionsIn(publication.jsonLd);
    const search = actions.find((action) => action["@type"] === "SearchAction");
    expect(search).toMatchObject({ "wlcap:actionId": "site.search", "wlcap:boundary": "owned", target: { "@type": "EntryPoint", httpMethod: "POST", "wlcap:protocol": "mcp" } });
    const check = actions.find((action) => action["@type"] === "CheckAction");
    expect(check).toMatchObject({ provider: { "@type": "Organization", name: "Lungau Lodging", url: "https://lungau-lodging.example/book" }, target: { url: "https://lungau-lodging.example/book" } });
    expect(actions.map((action) => action["@type"])).not.toContain("ViewAction");
    expect(actions.map((action) => action["@type"])).not.toContain("ChooseAction");
    expect(actions.map((action) => action["@type"])).not.toContain("ReadAction");

    // The operating role types the organisation; the owner's vocabulary is a DefinedTermSet.
    const organization = graphOf(publication.jsonLd).find((node) => node["wlcap:operatingRole"]);
    expect(organization).toMatchObject({ "@type": "TouristInformationCenter", "wlcap:operatingRole": "destination-organization" });
    const vocabulary = graphOf(publication.jsonLd).find((node) => node["@type"] === "DefinedTermSet");
    expect(vocabulary).toMatchObject({ hasDefinedTerm: [{ "@type": "DefinedTerm", name: "availability", description: "partner lodging inventory" }] });
    expect(publication.jsonLd["@context"]).toEqual(["https://schema.org", { wlcap: "https://wordlift.io/vocab/agent-capability/" }]);
  });

  it("publishes what the audit verified even before anyone decided anything", async () => {
    const { orchestrator } = harness();
    const parent = await orchestrator.create({ requestId: randomUUID(), url: ALPINA.toString() });
    const publication = await orchestrator.publish(parent.id);
    expect(publication.decided).toBe(0);
    expect(publication.actions.find((action) => action.actionId === "site.search")).toMatchObject({ publishedAs: "action", boundary: null });
    expect(publication.actions.filter((action) => action.publishedAs === "handoff")).toEqual([]);
    expect(publication.skill).toContain("before anyone reviewed it");
  });

  it("publishes declared entities, promoted inferred ones, and never a demoted one", () => {
    const entity = (id: string, extra: Record<string, unknown>) =>
      ({ id, types: ["Thing"], name: id, alternateNames: [], sourceUrls: ["https://alpina.travel/"], sameAs: [], offers: [], confidence: 1, ...extra }) as never;
    expect(
      publishableEntities([
        entity("declared", {}),
        entity("inferred", { origin: "inferred" }),
        entity("promoted", { origin: "inferred", humanPriority: "primary" }),
        entity("demoted", { humanPriority: "demoted" }),
      ]).map((item) => item.id),
    ).toEqual(["declared", "promoted"]);
  });

  it("maps the owner's role onto a type only when one fits", () => {
    expect(organizationType("destination-organization")).toBe("TouristInformationCenter");
    expect(organizationType("merchant")).toBe("Store");
    expect(organizationType("cooperative of makers")).toBe("Organization");
    expect(organizationType(undefined)).toBe("Organization");
  });

  it("never publishes an action the audit could not call", () => {
    const capability = (state: CapabilityResult["state"], extra: Partial<CapabilityResult> = {}): CapabilityResult => ({
      actionId: "checkout.create",
      label: "Create checkout",
      description: "Create checkout.",
      stage: "act",
      intent: "transactional",
      importance: 3,
      expected: true,
      expectationSource: ["archetype"],
      state,
      humanSupport: true,
      agentSupport: false,
      appliesTo: [],
      evidence: [],
      ...extra,
    });
    expect(publishedAs(capability("unverified", { boundary: "owned", boundarySource: "human-provided" })).publishedAs).toBe("entity");
    expect(publishedAs(capability("human-only")).publishedAs).toBe("entity");
    expect(publishedAs(capability("missing", { boundary: "not-applicable", boundarySource: "human-provided" })).publishedAs).toBe("nothing");
    expect(publishedAs(capability("agent-ready", { agentSupport: true })).publishedAs).toBe("action");
  });
});

describe("llms.txt, for language models", () => {
  it("says what the business is from what may be published, lists only actions that answered, and links the other documents", async () => {
    const { orchestrator } = harness();
    const { child } = await refinedAlpina(orchestrator);
    const report = (await orchestrator.get(child.id))!;
    const { llms, documents, actions } = await orchestrator.publish(child.id);

    expect(llms).toMatch(/^# .+\n\n> .+\n/);
    expect(llms).toContain("## What an agent can do");
    // The file is read on the site, long after the report is gone: it links to the site's own copies, never to the report's.
    expect(llms).toContain("- [Terms of Action](https://alpina.travel/.well-known/terms-of-action.md)");
    expect(llms).toContain("- [Business data](https://alpina.travel/)");
    expect(llms).not.toContain(documents.skill);
    expect(llms).not.toContain(documents.pageJsonLd);
    expect(llms).toContain("- [Agent catalog](https://alpina.travel/.well-known/ai-catalog.json)");
    expect(llms).toContain(`- [AI Audit report](${report ? `https://audit.example/reports/${child.id}` : ""})`);
    // An action is listed only where an agent's call answered.
    // An action is listed as callable only where an agent's call answered; a partner's is said as the partner's.
    const callable = llms.slice(llms.indexOf("## What an agent can do"), llms.indexOf("## How to act here"));
    for (const action of actions.filter((candidate) => candidate.publishedAs === "entity" || candidate.publishedAs === "nothing")) expect(callable).not.toContain(`- [${action.label}](`);
    // What a person can do and an agent cannot is a page to send them to, said as that.
    for (const action of actions.filter((candidate) => candidate.publishedAs === "entity" && candidate.humanUrl)) {
      expect(llms).toContain(`- [${action.label}](${action.humanUrl}): a page for people; there is nothing here for an agent to call`);
    }
    for (const action of actions.filter((candidate) => candidate.publishedAs === "handoff" && candidate.provider)) expect(llms).toContain(`handled by ${action.provider!.name}`);
    // Nothing the text alone suggested is published.
    for (const entity of (report.contextGraph?.entities ?? []).filter((candidate) => candidate.origin === "inferred" && candidate.humanPriority !== "primary")) {
      expect(llms).not.toContain(`[${entity.name}]`);
    }
    const served = await request(createApp({ orchestrator, rateLimits: { enabled: false } })).get(`/api/reports/${child.id}/publish/llms.txt`);
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toMatch(/text\/plain/);
    expect(served.text).toBe(llms);
  });
});

describe("the skill, for acting", () => {
  it("carries every decision and no readiness claim", async () => {
    const { orchestrator } = harness();
    const { child } = await refinedAlpina(orchestrator);
    const { skill } = await orchestrator.publish(child.id);

    expect(skill).toMatch(/^---\nname: alpina\.travel Terms of Action\n/);
    // An unclaimed review speaks as a reviewer; only a verified owner's decisions are the business's word.
    expect(skill).toContain("In the reviewer's words: destination organization.");
    expect(skill).toContain("made in a review; the reviewer has not proved the site is theirs");
    const owned = await orchestrator.refine(child.id, { businessRole: "destination-organization" }, { filedBy: "owner" });
    expect((await orchestrator.publish(owned.id)).skill).toContain("In the owner's words: destination organization.");
    expect(skill).toContain("- **availability**: partner lodging inventory");
    expect(skill).toContain("- Who runs it: ours.");
    expect(skill).toContain("- Who runs it: a partner runs it — Lungau Lodging (https://lungau-lodging.example/book).");
    expect(skill).toContain("- Why: Partners own the inventory.");
    expect(skill).toContain("an MCP server at https://alpina.travel/mcp/alpina/http/mcp");
    expect(skill).toContain("- Retrieve details (`detail.retrieve`): alpina.travel describes this and does not carry it out for agents.");
    expect(skill).toMatch(/Never attempt compare options, explain policies here/);
    // Neither published action changes anything for a person, so there is no confirmation rule to state.
    expect(skill).not.toContain("Never perform");
    expect(skill).toContain("https://audit.example/reports/" + child.id);
    // The file states boundaries and addresses, and the date the audit's call answered; never that anything answers today.
    expect(skill).not.toMatch(/agent-ready|verified|\bworks\b|succeed/i);
    expect(skill).toContain("It never says an action answers today");
    expect(skill).toContain("kept for a limited time");
  });

  it("tells an assistant what to do about what it cannot call, and names every way in the audit used", async () => {
    const { orchestrator } = harness();
    const report = await orchestrator.create({ requestId: randomUUID(), url: "https://alpina.travel" });
    const { skill, actions, runbook } = await orchestrator.publish(report.id);
    const gaps = skill.slice(skill.indexOf("## Not available to agents here yet"));
    expect(gaps).toContain("Nothing in this section can be called.");
    for (const action of actions.filter((candidate) => candidate.publishedAs === "entity")) {
      const line = gaps.split("\n").find((candidate) => candidate.includes(`(\`${action.actionId}\`)`))!;
      // Each gap says its own reason, and where a person does it when the audit saw a page for that.
      expect(line).toBe(`- ${action.label} (\`${action.actionId}\`): ${gapLine(action, "alpina.travel")}`);
      if (action.humanUrl) expect(line).toContain(action.humanUrl);
      expect(line).not.toMatch(/nothing is declared that an agent could not call/);
    }
    // A person's page is on the site itself, and is never offered as something to call.
    for (const action of actions.filter((candidate) => candidate.humanUrl)) expect(action.humanUrl).toMatch(/^https:\/\/alpina\.travel\//);
    // An MCP server with no tool named says how to find one, rather than leaving the agent to guess.
    for (const action of actions.filter((candidate) => candidate.entryPoint?.protocol === "mcp" && !candidate.entryPoint.tool)) {
      expect(skill).toContain("list the server's tools with `tools/list` and choose by description");
      expect(action.entryPoint!.url).toBeTruthy();
    }
    // The runbook promises only what the product checks.
    expect(runbook).not.toContain("is listed there by name");
    expect(runbook).toContain("nothing on the site may depend on it");
  });

  it("uses each gap's own finding", () => {
    const action = (state: "missing" | "human-only" | "unverified", extra: Record<string, unknown> = {}) => ({ actionId: "availability.check", label: "Check availability", state, boundary: null, publishedAs: "entity" as const, because: "", ...extra });
    expect(gapLine(action("human-only", { humanUrl: "https://shop.example/dates" }), "shop.example")).toBe("People do this on the site; no interface for agents was found. Send the person to https://shop.example/dates.");
    expect(gapLine(action("missing"), "shop.example")).toMatch(/^Not found on the pages the audit read/);
    expect(gapLine(action("unverified"), "shop.example")).toContain("Tell the person it cannot be done through an agent yet.");
    expect(gapLine(action("missing", { boundary: "owned" }), "shop.example")).toMatch(/^shop\.example handles this itself\. /);
  });
});

describe("the catalog, for discovery", () => {
  it("validates against the ARD entry schema, anchored to the site's domain, and says how it is read", async () => {
    const { orchestrator } = harness();
    const { child } = await refinedAlpina(orchestrator);
    const publication = await orchestrator.publish(child.id);
    const catalog = ardManifestSchema.parse(publication.catalog);

    expect(catalog).toMatchObject({ specVersion: "1.0", host: { identifier: "alpina.travel" } });
    for (const entry of catalog.entries) expect(entry.identifier).toMatch(/^urn:air:alpina\.travel:/);
    const skill = catalog.entries.find((entry) => entry.type === "application/ai-skill+md");
    expect(skill).toMatchObject({
      identifier: "urn:air:alpina.travel:terms-of-action",
      url: `https://audit.example/api/reports/${child.id}/publish/skill.md`,
      capabilities: expect.arrayContaining(["site.search", "availability.check"]),
      metadata: { report: `https://audit.example/reports/${child.id}`, generator: "WordLift AI Audit", decisions: child.refinement?.decisions },
    });
    const search = catalog.entries.find((entry) => entry.identifier === "urn:air:alpina.travel:site:search");
    expect(search).toMatchObject({ type: "application/ld+json", capabilities: ["site.search"], metadata: { protocol: "mcp", via: "site" } });
    expect((search?.data as Record<string, unknown>)["@type"]).toBe("SearchAction");
    expect(search?.url).toBeUndefined();

    // What A4 reads back: the entries by type, the skill's interfaces, and nothing from another domain.
    const entries = parseCatalogEntries(JSON.stringify(catalog));
    expect(entries.filter(isSkillEntry)).toHaveLength(1);
    expect(sameOriginEntries(entries, ALPINA)).toEqual([]);
    expect(sameOriginEntries(entries, new URL("https://audit.example/"))).toHaveLength(1);
    expect(interfacesNamedIn(publication.skill, ALPINA)).toContain("https://alpina.travel/mcp/alpina/http/mcp");
  });
});

describe("the round trip", () => {
  it("publishes a verified HTTP entry point as a template that verify-by-calling reads back", () => {
    const report: ReportRecord = {
      id: "4a8a04c0-e247-4bec-a440-d9f3506f9212",
      status: "completed",
      phase: "complete",
      mode: "demo",
      requestedUrl: "https://shop.example/",
      createdAt: fixedNow.toISOString(),
      expiresAt: "2026-10-07T09:00:00.000Z",
      actionModelVersion: "0.1.0",
      errors: [],
      evidenceTruncated: false,
      capabilities: [
        {
          actionId: "checkout.create",
          label: "Create checkout",
          description: "Start a purchase.",
          stage: "act",
          intent: "transactional",
          importance: 3,
          expected: true,
          expectationSource: ["archetype"],
          state: "agent-ready",
          via: "site",
          humanSupport: true,
          agentSupport: true,
          appliesTo: [],
          evidence: [
            {
              id: "mcp-call-create_checkout",
              actionId: "checkout.create",
              audience: "agent",
              kind: "tool-result",
              sourceUrl: "https://shop.example/mcp",
              claim: "An agent called the site's MCP tool create_checkout and it answered",
              confidence: 1,
              verification: "invoked",
              collectedAt: fixedNow.toISOString(),
            },
          ],
        },
        {
          actionId: "availability.check",
          label: "Check availability",
          description: "Check whether an item is in stock.",
          stage: "act",
          intent: "informational",
          importance: 3,
          expected: true,
          expectationSource: ["archetype"],
          state: "agent-ready",
          via: "site",
          humanSupport: true,
          agentSupport: true,
          appliesTo: [],
          evidence: [
            {
              id: "entry-point-availability.check-CheckAction",
              actionId: "availability.check",
              audience: "agent",
              kind: "api-result",
              sourceUrl: "https://shop.example/api/availability?q=trail",
              snippet: "https://shop.example/api/availability?q={query}",
              claim: "An agent executed the site's declared CheckAction entry point and it answered",
              confidence: 1,
              verification: "invoked",
              collectedAt: fixedNow.toISOString(),
            },
          ],
        },
      ],
    };
    const publication = compilePublication(report, { reportUrl: "https://audit.example/reports/x", apiUrl: "https://audit.example/api/reports/x", serviceUrl: "https://audit.example", now: () => fixedNow });
    const check = actionsIn(publication.jsonLd).find((action) => action["@type"] === "CheckAction");
    expect(check).toMatchObject({
      "@type": "CheckAction",
      target: { "@type": "EntryPoint", urlTemplate: "https://shop.example/api/availability?q={query}", httpMethod: "GET", "wlcap:protocol": "http" },
      "query-input": "required name=query",
    });

    const page = parseHTML(`<html><head><script type="application/ld+json">${JSON.stringify(publication.jsonLd)}</script></head></html>`).document;
    const base = new URL("https://shop.example/");
    expect(findEntryPoints(page, base, base.toString())).toMatchObject([
      { actionType: "CheckAction", actionId: "availability.check", template: "https://shop.example/api/availability?q={query}", read: true },
    ]);
    expect(publication.skill).toContain("`GET https://shop.example/api/availability?q={query}`, filling `{query}` with the query.");
    // The MCP tool is named, the write is fenced, and the page carries a POST entry point that verify-by-calling will not execute.
    expect(publication.skill).toContain("an MCP server at https://shop.example/mcp (Streamable HTTP; JSON-RPC over POST), tool `create_checkout`.");
    expect(publication.skill).toContain("- Never perform create checkout without a person's confirmation");
    expect(actionsIn(publication.jsonLd).find((action) => action["@type"] === "ReserveAction")).toMatchObject({ target: { url: "https://shop.example/mcp", httpMethod: "POST", "wlcap:tool": "create_checkout" } });
  });
});

describe("the publish endpoint", () => {
  it("serves the model and the three documents, each as itself", async () => {
    const { orchestrator } = harness();
    const app = createApp({ orchestrator });
    const created = await request(app).post("/api/reports").send({ requestId: randomUUID(), url: ALPINA.toString() }).expect(200);
    const id = created.body.id as string;

    const model = await request(app).get(`/api/reports/${id}/publish`).expect(200);
    expect(model.body).toMatchObject({ host: "alpina.travel", reportId: id, documents: { skill: `https://audit.example/api/reports/${id}/publish/skill.md` } });

    const page = await request(app).get(`/api/reports/${id}/publish/page.jsonld`).expect(200);
    expect(page.headers["content-type"]).toContain("application/ld+json");
    expect(JSON.parse(page.text)["@graph"]).toBeInstanceOf(Array);

    const skill = await request(app).get(`/api/reports/${id}/publish/skill.md`).expect(200);
    expect(skill.headers["content-type"]).toContain("text/markdown");
    expect(skill.text).toMatch(/^---\nname: alpina\.travel Terms of Action/);

    const catalog = await request(app).get(`/api/reports/${id}/publish/ai-catalog.json`).expect(200);
    expect(catalog.headers["content-type"]).toContain("application/json");
    expect(ardManifestSchema.parse(JSON.parse(catalog.text)).entries.length).toBeGreaterThan(0);

    await request(app).get(`/api/reports/${randomUUID()}/publish`).expect(404);
  });

  it("serves the runbook an agent applies, and the catalog as the site should serve it", async () => {
    const { orchestrator } = harness();
    const app = createApp({ orchestrator });
    const created = await request(app).post("/api/reports").send({ requestId: randomUUID(), url: ALPINA.toString() }).expect(200);
    const id = created.body.id as string;

    const runbook = await request(app).get(`/api/reports/${id}/publish/runbook.md`).expect(200);
    expect(runbook.headers["content-type"]).toContain("text/markdown");
    const text = runbook.text;
    // Where each document goes, in the site's own paths; what to fetch; how to prove it from outside.
    expect(text).toMatch(/^# Activate alpina\.travel/);
    for (const path of ["/.well-known/ai-catalog.json", "/.well-known/terms-of-action.md", "/llms.txt"]) expect(text).toContain(`\`${path}\``);
    expect(text).toContain(`https://audit.example/api/reports/${id}/publish/site-catalog.json`);
    expect(text).toContain(`<link rel="ai-catalog" href="/.well-known/ai-catalog.json">`);
    expect(text).toContain("Agentmap: https://alpina.travel/.well-known/ai-catalog.json");
    expect(text).toContain(`curl -sI https://alpina.travel/.well-known/ai-catalog.json`);
    expect(text).toContain(`-X POST https://audit.example/api/reports`);
    // The line that keeps this off the generator path.
    expect(text).toContain("Do not add tools, endpoints or actions that are not in these documents");
    expect(text).toContain("Do not mark anything as working");
    expect(text).toContain(`book-a-demo/?source=ai-audit&report=${id}`);

    // The site catalog points its skill entry at the site's own copy; ours still points at ours.
    const ours = JSON.parse((await request(app).get(`/api/reports/${id}/publish/ai-catalog.json`).expect(200)).text);
    const theirs = JSON.parse((await request(app).get(`/api/reports/${id}/publish/site-catalog.json`).expect(200)).text);
    const skillOf = (catalog: { entries: Array<{ type: string; url?: string }> }) => catalog.entries.find((entry) => entry.type === "application/ai-skill+md")?.url;
    expect(skillOf(ours)).toBe(`https://audit.example/api/reports/${id}/publish/skill.md`);
    expect(skillOf(theirs)).toBe("https://alpina.travel/.well-known/terms-of-action.md");
    expect(ardManifestSchema.parse(theirs).entries).toHaveLength(ours.entries.length);
    expect(theirs.entries.filter((entry: { type: string }) => entry.type !== "application/ai-skill+md")).toEqual(ours.entries.filter((entry: { type: string }) => entry.type !== "application/ai-skill+md"));
  });

  it("is counted as a read of the report, like the page and the contracts", () => {
    const id = "4a8a04c0-e247-4bec-a440-d9f3506f9212";
    expect(bucketFor(`/api/reports/${id}/publish`)).toBe(id);
    expect(bucketFor(`/api/reports/${id}/publish/skill.md`)).toBe(id);
    expect(bucketFor(`/api/reports/${id}/publish/skill.md/extra`)).toBeNull();
  });
});
