/**
 * Minimal ambient types for the experimental WebMCP surface. The Community Group draft (and the
 * `use-webmcp-tool` hook) put the imperative API on `document.modelContext`; Chrome's preview
 * exposes it on `navigator.modelContext`. Both are declared because `modelContextAlias.ts` points
 * whichever is missing at the other.
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
  interface Navigator {
    modelContext?: WebMCPModelContext;
  }
}
