import { afterEach, describe, expect, it, vi } from "vitest";
import { probeMcpEndpoint } from "../../src/server/adapters/scrape/mcpProbe.js";
import { harvestIdentifier, isSafeToCall } from "../../src/server/adapters/scrape/mcpToolCalls.js";

const ENDPOINT = new URL("https://alpina.travel/mcp/sse");
// The probe resolves every destination through the URL policy; keep it off the network.
const POLICY = { resolve: async () => ["93.184.216.34"], timeoutMs: 2_000, seedQuery: "alpine apartments" };

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
      const message = JSON.parse(String(init.body)) as { method: string; id?: number };
      if (message.method === "initialize") {
        push({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18", serverInfo: { name: "alpina-travel" } } });
      } else if (message.method === "tools/list") {
        push({
          jsonrpc: "2.0",
          id: 2,
          result: {
            tools: (options.tools ?? []).map((name) => ({
              name,
              annotations: { readOnlyHint: true, destructiveHint: false },
              inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
            })),
          },
        });
      } else if (message.method === "tools/call") {
        push({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: "ok" }] } });
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
    expect(probe.tools.map((tool) => tool.name)).toEqual(["check_samspitze_availability", "search_lungau"]);
    // The deprecated transport is listed only; calls are driven over streamable HTTP.
    expect(probe.tools.every((tool) => tool.called)).toBe(false);
    expect(probe.tools[0].note).toMatch(/deprecated SSE transport/);
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

/** Streamable HTTP answers in the POST body, so the whole exchange is request/response. */
function streamableServer(options: { tools?: Array<Record<string, unknown>>; callResult?: Record<string, unknown> } = {}) {
  return vi.fn(async (_input: unknown, init?: RequestInit) => {
    if (init?.method !== "POST") return new Response("nope", { status: 405 });
    const message = JSON.parse(String(init.body)) as { id?: number; method: string; params?: { name?: string } };

    const reply = (result: unknown) =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }), {
        status: 200,
        headers: { "content-type": "application/json", "mcp-session-id": "session-1" },
      });

    if (message.method === "initialize") {
      return reply({ protocolVersion: "2025-06-18", serverInfo: { name: "Alpina Travel Commerce" } });
    }
    if (message.method === "tools/list") return reply({ tools: options.tools ?? [] });
    if (message.method === "tools/call") {
      return reply(options.callResult ?? { content: [{ type: "text", text: "ok" }], products: [{ product_id: "samspitze-4" }] });
    }
    return new Response(null, { status: 202 });
  });
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false };

describe("calling the tools a live MCP server says are safe", () => {
  it("calls a read-only tool and reports the call, not just the listing", async () => {
    vi.stubGlobal("fetch", streamableServer({
      tools: [{
        name: "search_products",
        annotations: READ_ONLY,
        inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      }],
    }));

    const probe = await probeMcpEndpoint(ENDPOINT, POLICY);

    expect(probe.transport).toBe("streamable-http");
    expect(probe.initialized).toBe(true);
    expect(probe.tools[0]).toMatchObject({ name: "search_products", called: true, ok: true });
    expect(probe.tools[0].arguments).toBe('{"query":"alpine apartments"}');
  });

  it("refuses a tool the server did not annotate read-only", async () => {
    vi.stubGlobal("fetch", streamableServer({
      tools: [{ name: "nlweb_ask", annotations: { readOnlyHint: false }, inputSchema: { type: "object" } }],
    }));

    const probe = await probeMcpEndpoint(ENDPOINT, POLICY);
    expect(probe.tools[0]).toMatchObject({ called: false, note: "not annotated read-only" });
  });

  it("refuses a transactional name even when the server annotates it read-only", async () => {
    vi.stubGlobal("fetch", streamableServer({
      tools: [{ name: "create_checkout_session", annotations: READ_ONLY, inputSchema: { type: "object" } }],
    }));

    const probe = await probeMcpEndpoint(ENDPOINT, POLICY);
    expect(probe.tools[0]).toMatchObject({ called: false, note: "the name implies a transaction" });
  });

  it("never invents an identifier, but will use one an earlier call returned", async () => {
    vi.stubGlobal("fetch", streamableServer({
      tools: [
        {
          name: "get_product",
          annotations: READ_ONLY,
          inputSchema: { type: "object", properties: { product_id: { type: "string" } }, required: ["product_id"] },
        },
        {
          name: "search_products",
          annotations: READ_ONLY,
          inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
        },
      ],
    }));

    const probe = await probeMcpEndpoint(ENDPOINT, POLICY);
    const detail = probe.tools.find((tool) => tool.name === "get_product");
    expect(detail).toMatchObject({ called: true, ok: true, arguments: '{"product_id":"samspitze-4"}' });
  });

  it("leaves an identifier tool uncalled when nothing returned one", async () => {
    vi.stubGlobal("fetch", streamableServer({
      tools: [{
        name: "get_product",
        annotations: READ_ONLY,
        inputSchema: { type: "object", properties: { product_id: { type: "string" } }, required: ["product_id"] },
      }],
      callResult: { content: [{ type: "text", text: "nothing" }] },
    }));

    const probe = await probeMcpEndpoint(ENDPOINT, POLICY);
    expect(probe.tools[0]).toMatchObject({ called: false, note: "it needs an identifier the audit will not invent" });
  });

  it("records a call the server rejected as a failure", async () => {
    vi.stubGlobal("fetch", streamableServer({
      tools: [{
        name: "search_products",
        annotations: READ_ONLY,
        inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      }],
      callResult: { isError: true, content: [{ type: "text", text: "upstream unavailable" }] },
    }));

    const probe = await probeMcpEndpoint(ENDPOINT, POLICY);
    expect(probe.tools[0]).toMatchObject({ called: true, ok: false });
  });
});

describe("the block list reads names as words", () => {
  it.each([
    ["create_checkout_session", false],
    ["createCheckoutSession", false],
    ["complete-order", false],
    ["book_room", false],
    ["check_booking_availability", true],
    ["search_products", true],
    ["get_merchant_config", true],
  ])("%s callable: %s", (name, expected) => {
    expect(isSafeToCall({ name, annotations: { readOnlyHint: true, destructiveHint: false } }).safe).toBe(expected);
  });
});

describe("harvesting an identifier from a tool result", () => {
  it("reads one out of JSON returned inside a text block", () => {
    const result = { content: [{ type: "text", text: JSON.stringify({ products: [{ id: "samspitze-4" }] }) }] };
    expect(harvestIdentifier(result)).toBe("samspitze-4");
  });

  it("reads one out of structuredContent", () => {
    expect(harvestIdentifier({ structuredContent: { items: [{ sku: "ABC-1" }] } })).toBe("ABC-1");
  });

  it("refuses an empty identifier, so nothing downstream is called with it", () => {
    const result = { content: [{ type: "text", text: JSON.stringify({ products: [{ id: "", sku: "" }] }) }] };
    expect(harvestIdentifier(result)).toBeUndefined();
  });

  it("returns nothing for prose", () => {
    expect(harvestIdentifier({ content: [{ type: "text", text: "no identifiers here" }] })).toBeUndefined();
  });
});

describe("guarding against a call that only looks successful", () => {
  it("treats an error payload as a failure even when isError is false", async () => {
    vi.stubGlobal("fetch", streamableServer({
      tools: [{
        name: "search_products",
        annotations: READ_ONLY,
        inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      }],
      callResult: {
        isError: false,
        content: [{ type: "text", text: JSON.stringify({ error: "Could not find exact match for 'alpina'." }) }],
      },
    }));

    const probe = await probeMcpEndpoint(ENDPOINT, POLICY);
    expect(probe.tools[0]).toMatchObject({ called: true, ok: false });
    expect(probe.tools[0].note).toMatch(/Could not find exact match/);
  });

  it("does not chain an identifier that came from a config result", async () => {
    vi.stubGlobal("fetch", streamableServer({
      tools: [
        {
          name: "get_merchant_config",
          annotations: READ_ONLY,
          inputSchema: { type: "object", properties: {}, required: [] },
        },
        {
          name: "get_product",
          annotations: READ_ONLY,
          inputSchema: { type: "object", properties: { product_id: { type: "string" } }, required: ["product_id"] },
        },
      ],
      callResult: { structuredContent: { bridge_id: "alpina_booking_bridge" } },
    }));

    const probe = await probeMcpEndpoint(ENDPOINT, POLICY);
    const detail = probe.tools.find((tool) => tool.name === "get_product");
    expect(detail).toMatchObject({ called: false, note: "it needs an identifier the audit will not invent" });
  });
});
