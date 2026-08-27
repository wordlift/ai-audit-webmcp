import type { WebMCPModelContext, WebMCPToolDescriptor, WebMCPToolResult } from "../webmcp";

/**
 * A minimal stand-in for the browser's `document.modelContext`, used by this project's tests and
 * available to contributors testing their own tools without a WebMCP-enabled browser. It mirrors
 * the two behaviors the application depends on: registration order and abort-based unregistration.
 */
export interface ModelContextStub extends WebMCPModelContext {
  toolNames(): string[];
  get(name: string): WebMCPToolDescriptor | undefined;
  call(name: string, args?: Record<string, unknown>): Promise<WebMCPToolResult>;
  uninstall(): void;
}

export function installModelContextStub(target: Document = document): ModelContextStub {
  const tools = new Map<string, WebMCPToolDescriptor>();
  const previous = target.modelContext;

  const stub: ModelContextStub = {
    registerTool(tool, options) {
      tools.set(tool.name, tool);
      options?.signal?.addEventListener("abort", () => {
        if (tools.get(tool.name) === tool) tools.delete(tool.name);
      });
    },
    toolNames() {
      return [...tools.keys()].sort();
    },
    get(name) {
      return tools.get(name);
    },
    async call(name, args = {}) {
      const tool = tools.get(name);
      if (!tool) throw new Error(`Tool ${name} is not registered. Registered: ${[...tools.keys()].join(", ") || "none"}`);
      return tool.execute(args);
    },
    uninstall() {
      tools.clear();
      target.modelContext = previous;
    },
  };

  target.modelContext = stub;
  return stub;
}

export function toolText(result: WebMCPToolResult): string {
  return result.content
    .map((entry) => (typeof entry.text === "string" ? entry.text : ""))
    .join("\n");
}
