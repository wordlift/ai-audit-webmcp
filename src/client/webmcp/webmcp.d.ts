/**
 * Minimal ambient types for the experimental WebMCP surface this build targets:
 * `document.modelContext.registerTool`, per the WebMCP Community Group draft.
 * The older `navigator.modelContext` shape is deliberately not declared.
 */
export interface WebMCPToolContent {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface WebMCPToolResult {
  content: WebMCPToolContent[];
  structuredContent?: unknown;
  isError?: boolean;
}

export interface WebMCPToolDescriptor {
  name: string;
  description: string;
  inputSchema?: object;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (args: Record<string, unknown>) => Promise<WebMCPToolResult> | WebMCPToolResult;
}

export interface WebMCPModelContext {
  registerTool: (tool: WebMCPToolDescriptor, options?: { signal?: AbortSignal }) => void;
}

declare global {
  interface Document {
    modelContext?: WebMCPModelContext;
  }
}
