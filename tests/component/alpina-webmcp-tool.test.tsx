// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AlpinaAvailabilityTool } from "../../src/client/webmcp/AlpinaAvailabilityTool";
import { installModelContextStub, toolText, type ModelContextStub } from "../../src/client/webmcp/testing/modelContextStub";

const REPORT_ID = "4a8a04c0-e247-4bec-a440-d9f3506f9212";
const CHILD_ID = "7f1c9c2e-9d16-4f4c-9a1b-2c8f8f5a1f21";

const availability = {
  source: "https://alpina.travel/api/booking/availability",
  propertyId: "samspitze-4",
  available: true,
  status: "available",
  checkIn: "2026-09-12",
  checkOut: "2026-09-15",
  nights: 3,
  adults: 2,
  childrenAges: [],
  totalGuests: 2,
  quote: { total: 644.8, currency: "EUR", instantConfirmation: true, cancellationSummary: "100% of the rent on cancellation" },
  checkoutUrl: "https://bookingnests.at/vermietung/buchen-ferienwohnung-441179.html",
  checkedAt: "2026-08-27T09:03:20.864Z",
  expiresAt: "2026-08-27T09:08:20.864Z",
  requiresRevalidation: true,
  readOnly: true,
  notice: "Availability and pricing are time-sensitive and must be revalidated. This lookup created no booking, held no inventory, sent no guest details, and took no payment.",
  updatedReportId: CHILD_ID,
  updatedReportUrl: `/reports/${CHILD_ID}`,
};

let modelContext: ModelContextStub;

beforeEach(() => {
  modelContext = installModelContextStub();
});

afterEach(() => {
  modelContext.uninstall();
  vi.unstubAllGlobals();
});

function renderTool(enabled = true) {
  return render(
    <MemoryRouter>
      <AlpinaAvailabilityTool reportId={REPORT_ID} enabled={enabled} />
    </MemoryRouter>,
  );
}

describe("check-alpina-availability tool", () => {
  it("is annotated read-only and declares no upstream URL input", async () => {
    renderTool();
    await waitFor(() => expect(modelContext.get("check-alpina-availability")).toBeDefined());

    const tool = modelContext.get("check-alpina-availability");
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    expect(tool?.description).toMatch(/creates no booking/);
    expect(Object.keys((tool?.inputSchema as { properties: object }).properties)).not.toContain("upstreamUrl");
  });

  it("is not registered when the report is not an Alpina report", async () => {
    renderTool(false);
    await waitFor(() => expect(modelContext.toolNames()).toEqual([]));
  });

  it("asks for missing dates and guest counts instead of inventing them", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderTool();
    await waitFor(() => expect(modelContext.get("check-alpina-availability")).toBeDefined());

    const noDates = await act(async () => modelContext.call("check-alpina-availability", { adults: 2 }));
    expect(noDates.isError).toBe(true);
    expect(toolText(noDates)).toMatch(/Ask the guest for the arrival date/);

    const noGuests = await act(async () =>
      modelContext.call("check-alpina-availability", { checkIn: "2026-09-12", checkOut: "2026-09-15" }),
    );
    expect(noGuests.isError).toBe(true);
    expect(toolText(noGuests)).toMatch(/how many adults/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns structured availability and repeats that nothing was booked", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(availability), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderTool();
    await waitFor(() => expect(modelContext.get("check-alpina-availability")).toBeDefined());

    const result = await act(async () =>
      modelContext.call("check-alpina-availability", { checkIn: "2026-09-12", checkOut: "2026-09-15", adults: 2 }),
    );

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ reportId: REPORT_ID, checkIn: "2026-09-12", adults: 2 });

    const text = toolText(result);
    expect(result.isError).toBeFalsy();
    expect(text).toMatch(/is available for 2026-09-12 to 2026-09-15/);
    expect(text).toMatch(/644\.80 EUR/);
    expect(text).toMatch(/created no booking/);
    expect(text).toMatch(new RegExp(`/reports/${CHILD_ID}`));
    expect(result.structuredContent).toMatchObject({ available: true, readOnly: true });
  });

  it("surfaces an upstream failure as an error, not as unavailability", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "upstream_unavailable", message: "The availability service could not be reached." }), {
          status: 502,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    renderTool();
    await waitFor(() => expect(modelContext.get("check-alpina-availability")).toBeDefined());

    const result = await act(async () =>
      modelContext.call("check-alpina-availability", { checkIn: "2026-09-12", checkOut: "2026-09-15", adults: 2 }),
    );

    expect(result.isError).toBe(true);
    expect(toolText(result)).toMatch(/could not be reached/);
    expect(toolText(result)).not.toMatch(/unavailable for/);
  });
});
