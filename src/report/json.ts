// The report as JSON: two-space indent, keys in model order, trailing newline (requirement 38).
import type { ProvenanceReport } from "./types.ts";

export const serializeReportJson = (report: ProvenanceReport): string => `${JSON.stringify(report, null, 2)}\n`;
