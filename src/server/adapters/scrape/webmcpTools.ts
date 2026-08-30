import type { AgentToolParameter, PageAgentTool } from "./ScrapeProvider.js";

const MAX_TOOLS = 25;
const MAX_PARAMETERS = 20;
const MAX_NAME = 64;
const MAX_DESCRIPTION = 400;

/** Attribute spellings seen in the declarative WebMCP proposal, plus their `data-` variants. */
const TOOL_NAME_ATTRIBUTES = ["toolname", "data-toolname", "data-tool-name"];
const TOOL_DESCRIPTION_ATTRIBUTES = ["tooldescription", "data-tooldescription", "data-tool-description"];
const PARAM_DESCRIPTION_ATTRIBUTES = [
  "toolparamdescription",
  "data-toolparamdescription",
  "data-tool-param-description",
];

/** The page-script surface WebMCP is registered through. Nothing else is scanned for tools. */
const WEBMCP_SURFACE = /\bmodelContext\b|\bregisterTool\b|\bprovideContext\b/;

/**
 * A tool literal is only believed when the surrounding object also carries the shape a WebMCP tool
 * has to have. Without this guard every `name:` in a bundle would be read as a tool.
 */
const TOOL_SHAPE = /\binputSchema\b|\binput_schema\b|\bexecute\s*[:(]/;

const NAME_LITERAL = /(?:^|[,{[(\s])name\s*:\s*(['"`])([\w][\w.:-]{1,62})\1/g;
const NAME_VALUE = /^[\w][\w.:-]*$/;

function attribute(element: Element, names: string[]): string {
  for (const name of names) {
    const value = element.getAttribute(name);
    if (value && value.trim().length > 0) return value.trim();
  }
  return "";
}

function clean(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Reads WebMCP tools declared directly on elements. This evidence sits in the same HTML the
 * collector already fetched, so it costs no extra request.
 */
export function collectDeclarativeTools(document: Document, sourceUrl: string): PageAgentTool[] {
  const selector = TOOL_NAME_ATTRIBUTES.map((name) => `[${name}]`).join(", ");
  const tools: PageAgentTool[] = [];

  for (const element of [...document.querySelectorAll(selector)].slice(0, MAX_TOOLS)) {
    const name = clean(attribute(element, TOOL_NAME_ATTRIBUTES), MAX_NAME);
    if (!name || !NAME_VALUE.test(name)) continue;

    const parameterSelector = PARAM_DESCRIPTION_ATTRIBUTES.map((attr) => `[${attr}]`).join(", ");
    const parameters: AgentToolParameter[] = [];
    for (const field of [...element.querySelectorAll(parameterSelector)].slice(0, MAX_PARAMETERS)) {
      const parameterName = clean(field.getAttribute("name") ?? field.getAttribute("id") ?? "", MAX_NAME);
      if (!parameterName) continue;
      parameters.push({
        name: parameterName,
        description: clean(attribute(field, PARAM_DESCRIPTION_ATTRIBUTES), MAX_DESCRIPTION),
      });
    }

    tools.push({
      name,
      description: clean(attribute(element, TOOL_DESCRIPTION_ATTRIBUTES), MAX_DESCRIPTION),
      origin: "declarative",
      sourceUrl,
      parameters,
    });
  }

  return tools;
}

/**
 * Statically reads tools out of a page script that registers them through `navigator.modelContext`.
 * The collector never executes site JavaScript, so this reports what the script declares, never
 * that a tool ran.
 */
export function extractImperativeTools(source: string, sourceUrl: string): PageAgentTool[] {
  if (!WEBMCP_SURFACE.test(source)) return [];

  const positions: Array<{ name: string; start: number }> = [];
  NAME_LITERAL.lastIndex = 0;
  for (let match = NAME_LITERAL.exec(source); match !== null; match = NAME_LITERAL.exec(source)) {
    positions.push({ name: match[2], start: match.index + match[0].length });
    if (positions.length >= MAX_TOOLS * 4) break;
  }

  const tools: PageAgentTool[] = [];
  const seen = new Set<string>();

  for (const [index, entry] of positions.entries()) {
    const end = Math.min(positions[index + 1]?.start ?? source.length, entry.start + 1_500);
    const window = source.slice(entry.start, end);
    if (!TOOL_SHAPE.test(window)) continue;
    if (seen.has(entry.name)) continue;
    seen.add(entry.name);

    tools.push({
      name: entry.name.slice(0, MAX_NAME),
      description: clean(quotedValue(window, "description") || quotedValue(window, "title"), MAX_DESCRIPTION),
      origin: "imperative",
      sourceUrl,
      parameters: [],
    });
    if (tools.length >= MAX_TOOLS) break;
  }

  return tools;
}

/** Reads a `key: "value"` literal, tolerating single, double, and template quoting from minifiers. */
function quotedValue(source: string, key: string): string {
  const pattern = new RegExp(`\\b${key}\\s*:\\s*(['"\`])((?:\\\\.|(?!\\1)[^\\\\])*)\\1`);
  const match = pattern.exec(source);
  return match ? match[2].replace(/\\(['"`\\])/g, "$1") : "";
}

export function dedupePageTools(tools: PageAgentTool[]): PageAgentTool[] {
  const byName = new Map<string, PageAgentTool>();
  for (const tool of tools) {
    const existing = byName.get(tool.name);
    // A declarative tool carries parameter documentation, so it wins over a bare script match.
    if (!existing || (existing.origin === "imperative" && tool.origin === "declarative")) {
      byName.set(tool.name, tool);
    }
  }
  return [...byName.values()].slice(0, MAX_TOOLS);
}
