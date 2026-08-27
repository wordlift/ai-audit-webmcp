import { assertPublicDestination, type UrlPolicyOptions } from "../../security/urlPolicy.js";
import type { McpEndpointProbe } from "./ScrapeProvider.js";

const MAX_STREAM_BYTES = 128_000;
const MAX_TOOLS = 40;
const PROTOCOL_VERSION = "2025-06-18";
const CLIENT_INFO = { name: "wordlift-ai-audit", version: "0.1" };

const INITIALIZE_ID = 1;
const TOOLS_LIST_ID = 2;

interface JsonRpcMessage {
  id?: unknown;
  result?: Record<string, unknown>;
  error?: { message?: unknown };
}

function empty(url: string, transport: McpEndpointProbe["transport"], error?: string): McpEndpointProbe {
  return {
    url,
    transport,
    sessionOpened: false,
    initialized: false,
    serverName: "",
    protocolVersion: "",
    tools: [],
    ...(error ? { error } : {}),
  };
}

/**
 * Talks to an MCP endpoint, far enough to learn whether it is really a server and what it offers.
 * Streamable HTTP is tried first because it is the current transport and needs no held-open stream;
 * the deprecated HTTP+SSE transport is the fallback. The handshake is a genuine round trip; the tool
 * list it returns is still only a declaration, because listing a tool is not calling it.
 */
export async function probeMcpEndpoint(
  target: URL,
  options: UrlPolicyOptions & { timeoutMs?: number } = {},
): Promise<McpEndpointProbe> {
  const url = target.toString();
  try {
    await assertPublicDestination(target, options);
  } catch (error) {
    return empty(url, "streamable-http", describe(error));
  }

  const timeoutMs = options.timeoutMs ?? 8_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const streamable = await probeStreamableHttp(target, controller, options);
    if (streamable.initialized) return streamable;

    const sse = await probeSse(target, controller, options);
    // Report whichever transport got further, so the finding names the real obstacle.
    return sse.initialized || sse.sessionOpened || !streamable.sessionOpened ? sse : streamable;
  } catch (error) {
    return empty(url, "streamable-http", controller.signal.aborted ? "the endpoint did not answer in time" : describe(error));
  } finally {
    clearTimeout(timer);
  }
}

/** The current transport: JSON-RPC over POST, with replies inline as JSON or as an SSE body. */
async function probeStreamableHttp(
  target: URL,
  controller: AbortController,
  options: UrlPolicyOptions,
): Promise<McpEndpointProbe> {
  const probe = empty(target.toString(), "streamable-http");

  const opened = await postRpc(target, controller, options, null, {
    id: INITIALIZE_ID,
    method: "initialize",
    params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
  });
  if (opened.status < 200 || opened.status >= 300) {
    return { ...probe, error: `the endpoint refused the initialize request with HTTP ${opened.status}` };
  }

  // A 200 carrying the site's HTML is not a session. Only a JSON-RPC reply counts as one.
  const handshake = firstJsonRpc(opened.body);
  if (!handshake) {
    return { ...probe, error: "the endpoint answered the initialize request without a JSON-RPC message" };
  }

  probe.sessionOpened = true;
  if (!handshake.result) {
    return { ...probe, error: text(handshake.error?.message, 200) || "the initialize request was rejected" };
  }

  probe.initialized = true;
  probe.protocolVersion = text(handshake.result.protocolVersion, 40);
  const info = handshake.result.serverInfo;
  probe.serverName = info && typeof info === "object" ? text((info as Record<string, unknown>).name, 80) : "";

  const session = opened.sessionId;
  await postRpc(target, controller, options, session, { method: "notifications/initialized", params: {} });
  const listed = await postRpc(target, controller, options, session, { id: TOOLS_LIST_ID, method: "tools/list", params: {} });
  probe.tools = toolNames(firstJsonRpc(listed.body)?.result?.tools);

  return probe;
}

interface RpcReply {
  status: number;
  body: string;
  sessionId: string | null;
}

async function postRpc(
  target: URL,
  controller: AbortController,
  options: UrlPolicyOptions,
  sessionId: string | null,
  payload: Record<string, unknown>,
): Promise<RpcReply> {
  try {
    const response = await fetch(target, {
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "user-agent": options.userAgent ?? CLIENT_INFO.name,
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", ...payload }),
    });

    return {
      status: response.status,
      body: await boundedText(response),
      sessionId: response.headers.get("mcp-session-id"),
    };
  } catch {
    return { status: 0, body: "", sessionId: null };
  }
}

/** Reads a bounded reply body, whether it arrives as JSON or as a one-shot SSE stream. */
async function boundedText(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  try {
    while (out.length < MAX_STREAM_BYTES) {
      const chunk = await reader.read();
      if (chunk.done) break;
      out += decoder.decode(chunk.value, { stream: true });
    }
  } catch {
    // A truncated reply is still worth parsing for what did arrive.
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return out;
}

/** Finds the first JSON-RPC message in a body that may be raw JSON or SSE-framed. */
function firstJsonRpc(body: string): JsonRpcMessage | null {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) return parseMessage(trimmed);

  for (const frame of trimmed.replace(/\r\n|\r/g, "\n").split("\n\n")) {
    const { data } = parseFrame(frame);
    const message = data ? parseMessage(data) : null;
    if (message && (message.result || message.error)) return message;
  }
  return null;
}

/** The deprecated HTTP+SSE transport: the server names a session endpoint on a held-open stream. */
async function probeSse(
  target: URL,
  controller: AbortController,
  options: UrlPolicyOptions,
): Promise<McpEndpointProbe> {
  const url = target.toString();
  try {
    const response = await fetch(target, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { accept: "text/event-stream", "user-agent": options.userAgent ?? CLIENT_INFO.name },
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (response.status !== 200 || !contentType.includes("text/event-stream") || !response.body) {
      return empty(url, "sse", `endpoint answered ${response.status} ${contentType || "with no content type"}`);
    }

    return await readSseSession(target, response.body, controller, options);
  } catch (error) {
    return empty(url, "sse", controller.signal.aborted ? "the endpoint did not answer in time" : describe(error));
  }
}

/**
 * Drives the HTTP+SSE transport: the server announces a session endpoint on the stream, requests go
 * out as POSTs, and every reply comes back on the same stream.
 */
async function readSseSession(
  base: URL,
  body: ReadableStream<Uint8Array>,
  controller: AbortController,
  options: UrlPolicyOptions,
): Promise<McpEndpointProbe> {
  const probe = empty(base.toString(), "sse");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  // A `\r` at the end of a chunk may still turn out to be half of a `\r\n`, so it waits.
  let carry = "";
  let read = 0;
  let sessionUrl: URL | null = null;

  /** Returns the HTTP status of the delivery attempt. The reply itself arrives on the stream. */
  const post = async (payload: Record<string, unknown>): Promise<number> => {
    if (!sessionUrl) return 0;
    const sent = await fetch(sessionUrl, {
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", ...payload }),
    });
    await sent.body?.cancel().catch(() => undefined);
    return sent.status;
  };

  try {
    while (read < MAX_STREAM_BYTES) {
      const chunk = await reader.read();
      if (chunk.done) break;
      read += chunk.value.byteLength;
      // SSE allows CRLF, LF, or a bare CR as a line break; the frame scan below only knows LF.
      const decoded = carry + decoder.decode(chunk.value, { stream: true });
      carry = decoded.endsWith("\r") ? "\r" : "";
      buffer += (carry ? decoded.slice(0, -1) : decoded).replace(/\r\n|\r/g, "\n");

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");

        const { event, data } = parseFrame(frame);
        if (!data) continue;

        if (event === "endpoint") {
          const resolved = resolveSession(data, base);
          if (!resolved) return { ...probe, error: "the session endpoint was not a usable URL" };
          await assertPublicDestination(resolved, options);
          sessionUrl = resolved;
          probe.sessionOpened = true;
          const delivered = await post({
            id: INITIALIZE_ID,
            method: "initialize",
            params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
          });
          // An endpoint that opens a session and then refuses the request is advertised but unusable,
          // which is worth reporting straight away rather than waiting out the timeout.
          if (delivered < 200 || delivered >= 300) {
            return {
              ...probe,
              error: `the session endpoint refused the initialize request with HTTP ${delivered}`,
            };
          }
          continue;
        }

        const message = parseMessage(data);
        if (!message) continue;

        if (message.id === INITIALIZE_ID && message.result) {
          probe.initialized = true;
          probe.protocolVersion = text(message.result.protocolVersion, 40);
          const info = message.result.serverInfo;
          probe.serverName = info && typeof info === "object" ? text((info as Record<string, unknown>).name, 80) : "";
          await post({ method: "notifications/initialized", params: {} });
          await post({ id: TOOLS_LIST_ID, method: "tools/list", params: {} });
          continue;
        }

        if (message.id === TOOLS_LIST_ID) {
          probe.tools = toolNames(message.result?.tools);
          return probe;
        }

        if (message.id === INITIALIZE_ID && message.error) {
          return { ...probe, error: text(message.error.message, 200) || "the initialize handshake was rejected" };
        }
      }
    }

    return probe.initialized ? probe : { ...probe, error: "the endpoint never completed a handshake" };
  } catch (error) {
    return { ...probe, error: controller.signal.aborted ? "the handshake did not finish in time" : describe(error) };
  } finally {
    controller.abort();
    await reader.cancel().catch(() => undefined);
  }
}

function parseFrame(frame: string): { event: string; data: string } {
  let event = "message";
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  return { event, data: data.join("\n") };
}

function parseMessage(data: string): JsonRpcMessage | null {
  try {
    const parsed: unknown = JSON.parse(data);
    return parsed && typeof parsed === "object" ? (parsed as JsonRpcMessage) : null;
  } catch {
    return null;
  }
}

function resolveSession(data: string, base: URL): URL | null {
  try {
    const resolved = new URL(data, base);
    // A session endpoint that moves to another host is not this site's server.
    return resolved.host === base.host && /^https?:$/.test(resolved.protocol) ? resolved : null;
  } catch {
    return null;
  }
}

function toolNames(tools: unknown): string[] {
  if (!Array.isArray(tools)) return [];
  return tools
    .map((tool) => (tool && typeof tool === "object" ? text((tool as { name?: unknown }).name, 64) : ""))
    .filter(Boolean)
    .slice(0, MAX_TOOLS);
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 200) : "the endpoint could not be reached";
}
