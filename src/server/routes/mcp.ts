import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Router, type Request, type RequestHandler, type Response } from "express";
import { buildAuditMcpServer } from "../mcp/server.js";
import type { AuditToolService } from "../services/AuditToolService.js";

/**
 * The remote transport: Streamable HTTP at /mcp, one server per request.
 *
 * Nothing about an audit lives in a session. A report is addressed by id and stored, so a caller
 * that reconnects — or reaches a different Cloud Run instance mid-conversation — asks the same
 * question and gets the same answer. That makes the stateless mode the honest one: no session to
 * lose, and no instance affinity to pretend to.
 */
export function createMcpRouter(service: AuditToolService, limiters: RequestHandler[] = []): Router {
  const router = Router();

  router.post("/", ...limiters, async (request: Request, response: Response) => {
    const server = buildAuditMcpServer(service);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    response.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      console.error("mcp_transport_error", error instanceof Error ? error.name : "unknown");
      if (!response.headersSent) {
        response.status(500).json(protocolError(-32603, "The MCP request could not be handled."));
      }
    }
  });

  // Stateless means there is no stream to resume and no session to end. Saying so plainly beats
  // opening a connection that will never carry anything.
  for (const method of ["get", "delete"] as const) {
    router[method]("/", (_request, response) => {
      response.status(405).json(protocolError(-32000, "This MCP endpoint is stateless: send JSON-RPC over POST."));
    });
  }

  return router;
}

function protocolError(code: number, message: string) {
  return { jsonrpc: "2.0" as const, error: { code, message }, id: null };
}
