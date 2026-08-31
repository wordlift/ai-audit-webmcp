import { ensureModelContext } from "../../src/client/webmcp/modelContextAlias.js";

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
