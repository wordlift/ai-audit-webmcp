import { ensureModelContext, watchModelContext } from "../../src/client/webmcp/modelContextAlias.js";

type Host = { modelContext?: { registerTool: () => void } };

describe("model context alias", () => {
  it("lets tools register when the browser only exposes navigator.modelContext", () => {
    const doc: Host = {};
    const nav: Host = { modelContext: { registerTool: vi.fn() } };

    expect(ensureModelContext(doc, nav)).toBe(nav.modelContext);
    expect(doc.modelContext).toBe(nav.modelContext);
  });

  it("mirrors a document-injected context onto navigator", () => {
    const doc: Host = { modelContext: { registerTool: vi.fn() } };
    const nav: Host = {};

    ensureModelContext(doc, nav);
    expect(nav.modelContext).toBe(doc.modelContext);
  });

  it("survives a navigator that refuses new properties", () => {
    const doc: Host = { modelContext: { registerTool: vi.fn() } };
    const nav: Host = Object.freeze({});

    expect(ensureModelContext(doc, nav)).toBe(doc.modelContext);
  });

  it("reports no context when the page has none", () => {
    expect(ensureModelContext({}, {})).toBeNull();
  });
});

describe("model context watch", () => {
  afterEach(() => vi.useRealTimers());

  it("points document at a navigator context the browser injects after the page booted", () => {
    vi.useFakeTimers();
    const doc: Host = {};
    const nav: Host = {};
    watchModelContext(doc, nav);
    expect(doc.modelContext).toBeUndefined();

    vi.advanceTimersByTime(1500);
    nav.modelContext = { registerTool: vi.fn() };
    vi.advanceTimersByTime(500);
    expect(doc.modelContext).toBe(nav.modelContext);
  });

  it("stops looking after its window, as the registration hook does", () => {
    vi.useFakeTimers();
    const doc: Host = {};
    const nav: Host = {};
    watchModelContext(doc, nav, { intervalMs: 500, attempts: 20 });
    vi.advanceTimersByTime(10_500);
    nav.modelContext = { registerTool: vi.fn() };
    vi.advanceTimersByTime(5_000);
    expect(doc.modelContext).toBeUndefined();
  });

  it("does not read navigator when document already carries the API", () => {
    const doc: Host = { modelContext: { registerTool: vi.fn() } };
    const read = vi.fn(() => doc.modelContext);
    const nav = Object.defineProperty({}, "modelContext", { get: read, configurable: true }) as Host;

    expect(ensureModelContext(doc, nav)).toBe(doc.modelContext);
    expect(read).not.toHaveBeenCalled();
  });
});
