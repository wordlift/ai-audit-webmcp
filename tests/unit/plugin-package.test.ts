import { readFileSync } from "node:fs";
import path from "node:path";
import { REMOTE_TOOLS } from "../../src/server/mcp/tools.js";

const root = path.resolve(process.cwd(), "plugins/ai-audit");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const json = (relative: string) => JSON.parse(read(relative)) as Record<string, unknown>;

const skill = read("skills/review-ai-audit/SKILL.md");
const manifest = json(".codex-plugin/plugin.json");
const servers = json(".mcp.json");

describe("the published plugin", () => {
  it("declares itself the way the directory reads it", () => {
    const listing = manifest.interface as Record<string, unknown>;

    expect(manifest.name).toBe("wordlift-ai-audit");
    expect(manifest.version).toBe("1.0.1");
    expect(manifest.skills).toBe("./skills/");
    expect(manifest.mcpServers).toBe("./.mcp.json");
    for (const field of ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]) {
      expect(String(listing[field]), `${field} must be a public https URL`).toMatch(/^https:\/\//);
    }

    expect(String(listing.displayName).length).toBeLessThanOrEqual(30);
    expect(String(listing.shortDescription).length).toBeLessThanOrEqual(30);

    const prompts = listing.defaultPrompt as string[];
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts.length).toBeLessThanOrEqual(3);
    for (const prompt of prompts) expect(prompt.length).toBeLessThanOrEqual(128);

    expect(listing.logo).toBe("./assets/icon.svg");
    expect(listing.composerIcon).toBe("./assets/icon.svg");
    expect(read("assets/icon.svg")).toMatch(/viewBox="0 0 400 400"/);
  });

  it("points at the production endpoint over https", () => {
    const server = (servers.mcpServers as Record<string, { url: string; type: string }>)["wordlift-ai-audit"];

    expect(server.type).toBe("http");
    expect(server.url).toBe("https://beta.audit.wordlift.io/mcp");
  });

  it("carries the frontmatter a skill is loaded by", () => {
    const [, frontmatter] = skill.split("---");

    expect(frontmatter).toMatch(/name:\s*review-ai-audit/);
    expect(frontmatter).toMatch(/description:\s*\S+/);
    expect(frontmatter.length).toBeGreaterThan(120);
  });

  it("names only tools this public server actually offers", () => {
    const published = new Set(REMOTE_TOOLS.map((tool) => tool.definition.name));
    const mentioned = new Set(
      [...skill.matchAll(/`((?:audit|get|inspect|explain|refine)-[a-z-]+)`/g)].map((match) => match[1]),
    );

    expect([...mentioned].filter((name) => !published.has(name))).toEqual([]);
    for (const required of ["audit-website", "inspect-terms-of-action", "explain-capability"]) {
      expect(mentioned).toContain(required);
    }
  });

  it("does not teach the model to carry an authorization secret", () => {
    expect(skill).not.toMatch(/claimToken/i);
    expect(skill).not.toMatch(/`refine-terms-of-action`/);
  });

  it("teaches review-before-proposal and evidence-grounded readiness", () => {
    const inspectAt = skill.indexOf("inspect-terms-of-action");
    const proposeAt = skill.indexOf("Confirm the correction plan");

    expect(inspectAt).toBeGreaterThan(-1);
    expect(proposeAt).toBeGreaterThan(inspectAt);
    expect(skill).toMatch(/explicit confirmation/i);
    expect(skill).toMatch(/never mark an action ready/i);
  });

  it("shows no client site other than the one this project may name", () => {
    const text = `${skill}${JSON.stringify(manifest)}`.toLowerCase();
    const sites = [...text.matchAll(/\b([a-z0-9-]+\.(?:travel|shop|store))\b/g)].map((match) => match[1]);

    expect(sites.filter((site) => site !== "alpina.travel")).toEqual([]);
  });
});
