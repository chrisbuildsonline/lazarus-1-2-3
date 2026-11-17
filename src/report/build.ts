// buildReport: the provenance report from a verification result and five scalars (requirement 27).
// Pure; copies every value, so later changes to the input do not reach the report.
import type { CellResult } from "../verify/index.ts";
import { unknownOpcodes, unsupportedFeatures } from "./features.ts";
import type { ProvenanceReport, ReportInput, ReportRow } from "./types.ts";

const hex = (n: number) => `0x${n.toString(16).toUpperCase().padStart(2, "0")}`;

function row(c: CellResult): ReportRow {
  const r: ReportRow = {
    address: c.address,
    lotusFormula: c.lotusFormula,
    excelFormula: c.formula,
    cached: structuredClone(c.cached),
    recalculated: structuredClone(c.recalculated),
    status: c.status,
    reason: { ...c.reason },
  };
  if (c.candidateOpcodes.length > 0) r.candidateOpcodes = c.candidateOpcodes.map(hex);
  if (c.inputs) r.inputs = structuredClone(c.inputs);
  if (c.inputsOmitted !== undefined) r.inputsOmitted = c.inputsOmitted;
  return r;
}

export function buildReport(input: ReportInput): ProvenanceReport {
  const v = input.verification;
  const rows = v.cells.map(row);
  return {
    schemaVersion: 1,
    tool: { name: "lazarus-1-2-3", version: input.toolVersion },
    source: { fileName: input.fileName.split(/[\\/]/).pop()!, sha256: input.sha256, byteLength: input.byteLength, format: v.format },
    tolerance: { ...v.tolerance },
    totals: structuredClone(v.totals),
    unsupportedFeatures: unsupportedFeatures(rows),
    unknownOpcodes: unknownOpcodes(rows),
    rows,
  };
}
