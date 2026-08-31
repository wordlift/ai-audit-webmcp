import type { WebMCPModelContext } from "./webmcp";

interface ModelContextHost {
  modelContext?: WebMCPModelContext;
}

/**
 * WebMCP implementations disagree on where the imperative API lives: Chrome's preview exposes
 * `navigator.modelContext`, the Community Group draft (which `use-webmcp-tool` targets)
 * `document.modelContext`. Pointing whichever is missing at the other lets this page's tools
 * register wherever the browser actually looks. Returns the context in use, or null when the
 * page has none.
 */
export function ensureModelContext(
  doc: ModelContextHost = document,
  nav: ModelContextHost = navigator,
): WebMCPModelContext | null {
  if (!doc.modelContext && nav.modelContext) doc.modelContext = nav.modelContext;
  if (!nav.modelContext && doc.modelContext) {
    try {
      nav.modelContext = doc.modelContext;
    } catch {
      // A sealed navigator keeps its shape; document still carries the context.
    }
  }
  return doc.modelContext ?? null;
}
