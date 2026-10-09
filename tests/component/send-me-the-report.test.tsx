// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { deliveryAsked, SendMeTheReport } from "../../src/client/components/SendMeTheReport";

const REPORT_ID = "11111111-1111-4111-8111-111111111111";

function renderField() {
  return render(
    <MemoryRouter>
      <SendMeTheReport reportId={REPORT_ID} host="alpina.travel" />
    </MemoryRouter>,
  );
}

describe("SendMeTheReport, once on the report when the audit landed too fast", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  it("asks the same thing in the past tense, and a dismissal is remembered for this report", () => {
    const onDismiss = vi.fn();
    render(
      <MemoryRouter>
        <SendMeTheReport reportId={REPORT_ID} host="alpina.travel" variant="late" onDismiss={onDismiss} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("textbox", { name: /landed fast\. want the report for alpina\.travel by email too/i })).toBeVisible();
    expect(deliveryAsked(REPORT_ID)).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(deliveryAsked(REPORT_ID)).toBe(true);
    expect(deliveryAsked("22222222-2222-4222-8222-222222222222")).toBe(false);
  });
});

describe("SendMeTheReport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  it("asks for one optional address, and says the audit runs without it", () => {
    renderField();

    expect(screen.getByLabelText(/send me the report for alpina\.travel/i)).toBeVisible();
    expect(screen.getByText(/optional\. the audit runs either way/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /send it/i })).toBeDisabled();
  });

  it("files the address against the running report as the web form, then claims the engine for this browser", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      if (String(url).endsWith("/deliver")) {
        return new Response(JSON.stringify({ reportId: REPORT_ID, maskedEmail: "re******@example.com", status: "running" }), { status: 202, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ engine: { id: "e1", host: "alpina.travel" }, key: "k", standing: "holder" }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    renderField();

    fireEvent.change(screen.getByRole("textbox", { name: /send me the report/i }), { target: { value: "reviewer@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send it/i }));

    await waitFor(() => expect(screen.getByText("re******@example.com")).toBeVisible());
    expect(screen.queryByText("reviewer@example.com")).toBeNull();
    expect(screen.getByText(/stays readable here too, public and free/i)).toBeVisible();

    expect(calls[0]).toEqual({ url: `/api/reports/${REPORT_ID}/deliver`, body: { email: "reviewer@example.com", surface: "web" } });
    await waitFor(() => expect(calls.some((call) => call.url.includes("/claim"))).toBe(true));
  });

  it("keeps the field when the address is refused, and says why", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "invalid_email", message: "That email address does not look valid." }), { status: 400, headers: { "content-type": "application/json" } })));
    renderField();

    fireEvent.change(screen.getByRole("textbox", { name: /send me the report/i }), { target: { value: "nope@x" } });
    fireEvent.click(screen.getByRole("button", { name: /send it/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/does not look valid/i));
    expect(screen.getByRole("textbox", { name: /send me the report/i })).toBeVisible();
  });
});
