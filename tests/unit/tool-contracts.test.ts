import {
  AUDIT_WEBSITE_TOOL,
  EXPLAIN_CAPABILITY_TOOL,
  GET_AUDIT_REPORT_TOOL,
  INSPECT_SERVICE_MAP_TOOL,
  INSPECT_SERVICE_MAP_TOOL_ALIAS,
  REFINE_SERVICE_MAP_TOOL,
  withRequiredReportId,
  type ToolDefinition,
} from "../../src/shared/tools/index.js";
import * as compatibility from "../../src/client/webmcp/toolSchemas.js";

describe("tool contracts", () => {
  it("keeps the identifiers agents key on", () => {
    expect(AUDIT_WEBSITE_TOOL.name).toBe("audit-website");
    expect(GET_AUDIT_REPORT_TOOL.name).toBe("get-audit-report");
    expect(INSPECT_SERVICE_MAP_TOOL.name).toBe("inspect-terms-of-action");
    expect(EXPLAIN_CAPABILITY_TOOL.name).toBe("explain-capability");
    expect(REFINE_SERVICE_MAP_TOOL.name).toBe("refine-terms-of-action");
    expect(INSPECT_SERVICE_MAP_TOOL_ALIAS.name).toBe("inspect-service-map");
    expect(INSPECT_SERVICE_MAP_TOOL_ALIAS.replacedBy).toBe(INSPECT_SERVICE_MAP_TOOL.name);
  });

  it("serves the browser's import path the same objects, not copies", () => {
    expect(compatibility.AUDIT_WEBSITE_TOOL).toBe(AUDIT_WEBSITE_TOOL);
    expect(compatibility.REFINE_SERVICE_MAP_TOOL).toBe(REFINE_SERVICE_MAP_TOOL);
    expect(compatibility.ARCHETYPE_VALUES).toContain("travel-hospitality");
  });

  it("requires the report id a remote caller cannot infer from an open page", () => {
    const remote = withRequiredReportId(INSPECT_SERVICE_MAP_TOOL);

    expect(remote.inputSchema.required).toContain("reportId");
    const browser: ToolDefinition = INSPECT_SERVICE_MAP_TOOL;
    expect(browser.inputSchema.required ?? []).not.toContain("reportId");
    expect(remote.name).toBe(INSPECT_SERVICE_MAP_TOOL.name);
    expect(remote.description).toBe(INSPECT_SERVICE_MAP_TOOL.description);
    expect(remote.annotations).toEqual(INSPECT_SERVICE_MAP_TOOL.annotations);
  });

  it("keeps a report id that was already required, without repeating it", () => {
    const remote = withRequiredReportId(GET_AUDIT_REPORT_TOOL);

    expect(remote.inputSchema.required).toEqual(["reportId"]);
  });

  it("refuses to scope a tool that has no report to scope to", () => {
    expect(() => withRequiredReportId(AUDIT_WEBSITE_TOOL)).toThrow(/not a report-scoped tool/);
  });
});
