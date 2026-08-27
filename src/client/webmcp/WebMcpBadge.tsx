import type { WebMCPState } from "use-webmcp-tool";

/**
 * Shows the WebMCP registration state only when the browser exposes the API. Without it the
 * normal web interface is unchanged, which is the required degradation behavior.
 */
export function WebMcpBadge({ state, label }: { state: WebMCPState; label: string }) {
  if (!state.supported) return null;
  if (state.error) {
    return (
      <span className="webmcp-badge webmcp-badge-error" role="status">
        WebMCP tools blocked
      </span>
    );
  }
  if (!state.registered) return null;
  return (
    <span className="webmcp-badge" role="status" data-testid="webmcp-badge">
      <i aria-hidden="true" /> {label}
    </span>
  );
}
