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
    expect(manifest.skills).toBe("./skills/");
    expect(manifest.mcpServers).toBe("./.mcp.json");
    for (const field of ["websiteURL", "privacyPolicyURL", "termsOfServiceURL"]) {
      expect(String(listing[field]), `${field} must be a public https URL`).toMatch(/^https:\/\//);
    }
    expect((listing.defaultPrompt as string[]).length).toBeGreaterThanOrEqual(4);
  });

  it("points at the production endpoint over https", () => {
    const server = (servers.mcp_servers as Record<string, { url: string; type: string }>)["wordlift-ai-audit"];

    expect(server.type).toBe("http");
    expect(server.url).toBe("https://beta.audit.wordlift.io/mcp");
  });

  it("carries the frontmatter a skill is loaded by", () => {
    const [, frontmatter] = skill.split("---");

    expect(frontmatter).toMatch(/name:\s*review-ai-audit/);
    expect(frontmatter).toMatch(/description:\s*\S+/);
    // The description is what decides whether the skill is reached for at all.
    expect(frontmatter.length).toBeGreaterThan(120);
  });

  it("names only tools this server actually offers", () => {
    const published = new Set(REMOTE_TOOLS.map((tool) => tool.definition.name));
    // Anything in backticks that reads like a tool name: a rename must not leave the skill
    // instructing an agent to call something that no longer exists.
    const mentioned = new Set(
      [...skill.matchAll(/`((?:audit|get|inspect|explain|refine)-[a-z-]+)`/g)].map((match) => match[1]),
    );

    expect([...mentioned].filter((name) => !published.has(name))).toEqual([]);
    for (const required of ["audit-website", "inspect-terms-of-action", "refine-terms-of-action"]) {
      expect(mentioned).toContain(required);
    }
  });

  it("teaches the order the workflow depends on", () => {
    const inspectAt = skill.indexOf("inspect-terms-of-action");
    const refineAt = skill.lastIndexOf("refine-terms-of-action");

    expect(inspectAt).toBeGreaterThan(-1);
    expect(inspectAt).toBeLessThan(refineAt);
    expect(skill).toMatch(/explicit confirmation/i);
    expect(skill).toMatch(/never mark an action ready/i);
  });

  it("shows no client site other than the one this project may name", () => {
    const text = `${skill}${JSON.stringify(manifest)}`.toLowerCase();
    const sites = [...text.matchAll(/\b([a-z0-9-]+\.(?:travel|shop|store))\b/g)].map((match) => match[1]);

    expect(sites.filter((site) => site !== "alpina.travel")).toEqual([]);
  });
});
