// Provenance report: data, JSON and a self-contained HTML page, from a verification result.
export { buildReport } from "./build.ts";
export { escapeHtml } from "./escape.ts";
export { renderReportHtml } from "./html.ts";
export { serializeReportJson } from "./json.ts";
export { sha256Hex } from "./sha256.ts";
export type { ProvenanceReport, ReportInput, ReportRow, ReportSheet, ReportSheetInput, UnknownOpcodeEntry, UnsupportedFeatureEntry } from "./types.ts";
