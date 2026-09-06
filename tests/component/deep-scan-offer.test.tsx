// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DeepScanOffer } from "../../src/client/components/DeepScanOffer";
import type { ReportRecord } from "../../src/shared/types/index.js";

const report = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "completed",
  phase: "complete",
  mode: "demo",
  requestedUrl: "https://alpina.travel/",
  canonicalUrl: "https://alpina.travel/",
  createdAt: "2026-08-27T05:00:00.000Z",
  expiresAt: "2026-09-26T05:00:00.000Z",
  actionModelVersion: "0.1.0",
  errors: [],
  evidenceTruncated: false,
  contextGraph: { pages: [{}, {}, {}, {}], entities: [], interfaces: [], lexicon: [] },
} as unknown as ReportRecord;

function renderOffer(overrides: Partial<ReportRecord> = {}) {
  return render(
    <MemoryRouter>
      <DeepScanOffer report={{ ...report, ...overrides } as ReportRecord} />
    </MemoryRouter>,
  );
}

describe("DeepScanOffer", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("offers the deeper read against what the free scan actually did", () => {
    renderOffer();

    expect(screen.getByText(/read 4 representative pages/i)).toBeVisible();
    expect(screen.getByText(/up to 12 of them/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /send me the deep scan/i })).toBeDisabled();
  });

  it("asks for nothing on a report that already read the whole site", () => {
    const { container } = renderOffer({ scanDepth: "deep" });

    expect(container).toBeEmptyDOMElement();
  });

  it("declares itself the web form so the lead is not counted as an agent's", async () => {
    const sent: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ ...report, status: "running", phase: "understanding" }), {
        status: 202,
        headers: { "content-type": "application/json" },
      });
    }));

    renderOffer();
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "reviewer@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send me the deep scan/i }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      url: "https://alpina.travel/",
      depth: "deep",
      email: "reviewer@example.com",
      surface: "web",
    });
  });

  it("confirms with the address masked, and a link to watch the scan", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ...report, status: "running", phase: "understanding" }), {
        status: 202,
        headers: { "content-type": "application/json" },
      }),
    ));

    renderOffer();
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "reviewer@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send me the deep scan/i }));

    // The address a reader can recognise, in a page anyone with the link can open.
    expect(await screen.findByText("re******@example.com")).toBeVisible();
    expect(screen.queryByText(/reviewer@example\.com/)).toBeNull();
    expect(screen.getByRole("link", { name: /follow it live/i })).toHaveAttribute("href", expect.stringContaining("/reports/"));
  });

  it("says what went wrong instead of pretending the scan started", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ error: "rate_limited", message: "Too many audits from this address." }), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
    ));

    renderOffer();
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "reviewer@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send me the deep scan/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/too many audits/i);
    expect(screen.queryByText(/deep scan running/i)).toBeNull();
  });
});
