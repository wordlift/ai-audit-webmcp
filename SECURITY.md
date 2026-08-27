# Security

This application takes a URL from an anonymous caller and fetches it. That is the whole trust
problem, and the boundaries below are the answer.

## Reporting a vulnerability

Email **security@wordlift.io** with steps to reproduce. Please do not open a public issue for an
unpatched vulnerability. We will acknowledge within three working days.

## Outbound request policy

Every outbound URL passes `src/server/security/urlPolicy.ts` before any provider sees it.

- **Scheme:** `http` and `https` only. `file:`, `javascript:`, `ftp:`, and friends are rejected.
- **Credentials:** a URL carrying a username or password is rejected, never stripped and followed.
- **Ports:** only 80, 443, 8080, and 8443.
- **Hosts:** `localhost`, `metadata.google.internal`, and `.local` / `.internal` / `.home.arpa` /
  `.onion` suffixes are refused.
- **Addresses:** every resolved address must be globally routable. Loopback, private, link-local
  (including the `169.254.169.254` metadata address), CGNAT, documentation, multicast, and reserved
  ranges are blocked in IPv4 and IPv6, including IPv4-mapped and NAT64-embedded forms. If a host
  resolves to several addresses and *any* is non-public, the request fails closed.
- **Redirects:** each hop is revalidated against the full policy. A public URL that redirects to an
  internal one is stopped at the redirect. At most three hops.
- **Limits:** bounded bytes, request time, and endpoint count per audit.
- **Headers:** no cookies, no authorization, no caller headers are ever forwarded to a target. The
  audit identifies itself with a static user agent.

Residual risk: DNS rebinding between validation and connection is not fully preventable without a
pinned-IP connector. The blast radius is limited to an unauthenticated GET whose body is bounded,
sanitized, and never executed.

## Handling site content

Audited content is data. It is never instruction.

- Raw HTML stays in memory for one request and is discarded once normalized evidence exists.
- Stored evidence is capped (100 items, 500-character snippets), control characters are stripped,
  and unknown fields are rejected by schema.
- Site-authored text never reaches a WebMCP tool name, description, or input schema — those are
  static constants in `src/client/webmcp/toolSchemas.ts`.
- Reports never store cookies, headers, credentials, or private account identifiers.
- A response CSP allows only same-origin code, so collected markup cannot execute in the app.

## Secrets

- All provider credentials are server-side only. Nothing is read by the browser bundle.
- In production they come from Secret Manager, injected as environment variables.
- `.env` is git-ignored; `.env.example` carries names and safe defaults only.
- Fixtures are sanitized snapshots. Never commit a live capture containing personal data or keys.
- Errors returned to callers are typed and generic; provider internals and target content stay in
  the server.

## Rate limits and cost

Audits are expensive and call paid services. Two limits guard the path: per-IP and service-wide
(`src/server/security/rateLimits.ts`). Reading a shared report is never rate limited, so a link you
send to someone keeps working.

## Sidecars

A sidecar is a hand-written adapter for one approved endpoint.

- The upstream URL is a constant. There is no caller-supplied URL parameter, ever.
- Inputs are validated and outputs are allowlisted field by field.
- The Alpina availability sidecar is read-only: no booking session, no inventory hold, no guest
  data, no payment. Its tool description and every response repeat this.
- Only a successful invocation creates verification evidence, and it lands as a new immutable
  report revision — a shared report never changes under the person you sent it to.

## WebMCP

- Tools register on `document.modelContext` and unregister when their page context unmounts.
- The report-scoped and sidecar tools are only registered where they apply.
- Tool failures return `isError: true`. They never resolve as a vague success.
- The `tools` policy-controlled feature defaults to `'self'`; the app states it explicitly and does
  not delegate it to embedded frames.

## What this project deliberately does not do

- No arbitrary browser automation or form submission on audited sites.
- No universal reverse proxy for another site's endpoints.
- No booking, payment, application, or claim execution.
- No authenticated crawling. Public evidence only.
