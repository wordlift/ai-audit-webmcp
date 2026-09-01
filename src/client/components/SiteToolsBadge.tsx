import { Wrench } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { WebMCPModelContext } from "../webmcp/webmcp";

type ToolNames = string[] | "supported" | "unsupported";

function currentContext(): WebMCPModelContext | null {
  return document.modelContext ?? navigator.modelContext ?? null;
}

/**
 * A small self-test for the page's agent interface. When the browser exposes WebMCP it names the
 * registered site tools; when it does not, it says exactly which browser the reader needs — the
 * failure mode is otherwise invisible.
 */
export function SiteToolsBadge() {
  const [names, setNames] = useState<ToolNames>("unsupported");
  const [open, setOpen] = useState(false);

  const read = useCallback(async () => {
    const context = currentContext();
    if (!context) {
      setNames("unsupported");
      return;
    }
    try {
      const tools = typeof context.getTools === "function" ? await context.getTools() : null;
      setNames(tools ? tools.map((tool) => tool.name).sort() : "supported");
    } catch {
      setNames("supported");
    }
  }, []);

  useEffect(() => {
    // Tools register asynchronously after mount; look again shortly, then stop.
    void read();
    const timer = window.setTimeout(() => void read(), 1_500);
    return () => window.clearTimeout(timer);
  }, [read]);

  if (names === "unsupported") {
    return (
      <span className="site-tools site-tools-missing" role="status">
        <Wrench aria-hidden="true" /> Site tools require a WebMCP-enabled browser — open this report in the
        ChatGPT desktop app's built-in browser.
      </span>
    );
  }

  return (
    <span className="site-tools" role="status">
      <button
        type="button"
        className="site-tools-toggle"
        onClick={() => {
          void read();
          setOpen((value) => !value);
        }}
      >
        <Wrench aria-hidden="true" /> Site tools{Array.isArray(names) ? ` · ${names.length} available` : " · live"}
      </button>
      {open && Array.isArray(names) && (
        <ul className="site-tools-list">
          {names.map((name) => (
            <li key={name}>✓ {name}</li>
          ))}
        </ul>
      )}
    </span>
  );
}
