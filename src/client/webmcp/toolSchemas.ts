/**
 * Compatibility surface. The tool contracts moved to `src/shared/tools/` when the audit gained a
 * second transport; this path stays because the browser tools, the published agent surface, and
 * tests written against it all name it. Nothing is redefined here — a tool description exists once.
 */
export * from "../../shared/tools/definitions.js";
