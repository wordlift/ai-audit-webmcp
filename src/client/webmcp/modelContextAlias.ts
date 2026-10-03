import type { WebMCPModelContext } from "./webmcp";

interface ModelContextHost {
  modelContext?: WebMCPModelContext;
}

/**
 * WebMCP implementations disagree on where the imperative API lives. Chrome now ships it on
 * `document.modelContext` and keeps `navigator.modelContext` only as a deprecated alias; earlier
 * previews and some embedded browsers expose only `navigator.modelContext`. `use-webmcp-tool`
 * registers against `document.modelContext`, so a page whose browser offers only the navigator
 * spelling has to be pointed at it. Returns the context in use, or null when the page has none.
 *
 * When `document` already carries the API, `navigator` is not read at all: reading Chrome's
 * deprecated getter only prints a warning, and the document is where the tools register.
 */
export function ensureModelContext(
  doc: ModelContextHost = document,
  nav: ModelContextHost = navigator,
): WebMCPModelContext | null {
  if (doc.modelContext) {
    // `in` does not invoke a getter, so a browser that defines both spellings is left alone.
    if (!("modelContext" in nav)) {
      try {
        nav.modelContext = doc.modelContext;
      } catch {
        // A sealed navigator keeps its shape; document still carries the context.
      }
    }
    return doc.modelContext;
  }
  if (nav.modelContext) {
    doc.modelContext = nav.modelContext;
    return doc.modelContext;
  }
  return null;
}

/**
 * An embedded browser may inject its WebMCP API after the page has booted. `use-webmcp-tool` keeps
 * looking at `document.modelContext` for ten seconds, but it never looks at `navigator`, so a late
 * navigator-only injection would leave every tool unregistered without a sound. This keeps
 * pointing the two at each other for the same window, then stops. Returns a function that stops
 * watching early.
 */
export function watchModelContext(
  doc: ModelContextHost = document,
  nav: ModelContextHost = navigator,
  { intervalMs = 500, attempts = 20 }: { intervalMs?: number; attempts?: number } = {},
): () => void {
  if (ensureModelContext(doc, nav)) return () => undefined;
  let tries = 0;
  const timer = setInterval(() => {
    if (ensureModelContext(doc, nav) || ++tries >= attempts) clearInterval(timer);
  }, intervalMs);
  return () => clearInterval(timer);
}
