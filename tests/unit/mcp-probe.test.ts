import { afterEach, describe, expect, it, vi } from "vitest";
import { probeMcpEndpoint } from "../../src/server/adapters/scrape/mcpProbe.js";

const ENDPOINT = new URL("https://alpina.travel/mcp/sse");
// The probe resolves every destination through the URL policy; keep it off the network.
const POLICY = { resolve: async () => ["93.184.216.34"], timeoutMs: 2_000 };

/**
 * A stand-in for the HTTP+SSE transport. Frames are CRLF-terminated, as alpina.travel's server
 * sends them, because an LF-only frame scanner silently reads nothing from a real server.
 */
function sseServer(options: { postStatus?: number; tools?: string[] } = {}) {
  const encoder = new TextEncoder();
  let sink: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      sink = controller;
    },
  });
  const push = (payload: unknown) =>
    queueMicrotask(() => sink?.enqueue(encoder.encode(`event: message\r\ndata: ${JSON.stringify(payload)}\r\n\r\n`)));

  return vi.fn(async (input: unknown, init?: RequestInit) => {
    if (init?.method !== "POST") {
      queueMicrotask(() =>
        sink?.enqueue(encoder.encode("event: endpoint\r\ndata: /mcp/messages/?session_id=abc\r\n\r\n")),
      );
      return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
    }

    const status = options.postStatus ?? 202;
    if (status >= 200 && status < 300) {
      const message = JSON.parse(String(init.body)) as { method: string };
      if (message.method === "initialize") {
        push({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18", serverInfo: { name: "alpina-travel" } } });
      } else if (message.method === "tools/list") {
        push({ jsonrpc: "2.0", id: 2, result: { tools: (options.tools ?? []).map((name) => ({ name })) } });
      }
    }
    return new Response(null, { status });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MCP endpoint probe", () => {
  it("completes a handshake over CRLF-framed events and lists the server's tools", async () => {
    vi.stubGlobal("fetch", sseServer({ tools: ["check_samspitze_availability", "search_lungau"] }));

    const probe = await probeMcpEndpoint(ENDPOINT, POLICY);

    expect(probe.sessionOpened).toBe(true);
    expect(probe.initialized).toBe(true);
    expect(probe.serverName).toBe("alpina-travel");
    expect(probe.protocolVersion).toBe("2025-06-18");
    expect(probe.tools).toEqual(["check_samspitze_availability", "search_lungau"]);
    expect(probe.error).toBeUndefined();
  });

  it("reports an endpoint that opens a session and then refuses the request", async () => {
    vi.stubGlobal("fetch", sseServer({ postStatus: 405 }));

    const probe = await probeMcpEndpoint(ENDPOINT, POLICY);

    expect(probe.sessionOpened).toBe(true);
    expect(probe.initialized).toBe(false);
    expect(probe.tools).toEqual([]);
    expect(probe.error).toBe("the session endpoint refused the initialize request with HTTP 405");
  });

  it("reports a path that is not an event stream at all", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<!doctype html><html></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    })));

    const probe = await probeMcpEndpoint(ENDPOINT, POLICY);

    expect(probe.sessionOpened).toBe(false);
    expect(probe.initialized).toBe(false);
    expect(probe.error).toMatch(/endpoint answered 200 text\/html/);
  });
});
