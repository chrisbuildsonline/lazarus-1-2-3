// buildReport: the provenance report from a verification result and five scalars (requirement 27).
// Pure; copies every value, so later changes to the input do not reach the report. A report built
// from sheets also lists each sheet; its totals are their sum and, with more than one sheet,
// each row's address carries the sheet name.
import { sumTotals, TOLERANCE, type CellResult } from "../verify/index.ts";
import { unknownOpcodes, unsupportedFeatures } from "./features.ts";
import type { ProvenanceReport, ReportInput, ReportMacroItem, ReportRow, ReportSheet, ReportSheetInput } from "./types.ts";

const hex = (n: number) => `0x${n.toString(16).toUpperCase().padStart(2, "0")}`;

function row(c: CellResult, sheet: string | null): ReportRow {
  const r: ReportRow = {
    address: sheet === null ? c.address : `${sheet}!${c.address}`,
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

function reportSheet(s: ReportSheetInput): ReportSheet {
  const out: ReportSheet = { name: s.name, format: s.verification.format, totals: structuredClone(s.verification.totals) };
  if (s.verification.format === "dbf") {
    out.asRead = s.values;
    out.wording = `A dBase table has no formulas. ${s.values} values shown as read.`;
  }
  if (s.verification.format === "wk3") out.wording = "WK3 formulas are recalculated when they read only their own sheet. A formula that reads another sheet keeps the result the file stored.";
  if (s.fields) out.fields = [...s.fields];
  return out;
}

export function buildReport(input: ReportInput): ProvenanceReport {
  const sheets = "sheets" in input ? input.sheets : null;
  const verifications = "sheets" in input ? input.sheets.map((s) => s.verification) : [input.verification];
  const qualify = sheets !== null && sheets.length > 1;
  const rows = verifications.flatMap((v, i) => v.cells.map((c) => row(c, qualify ? sheets![i]!.name : null)));
  const format = "sheets" in input ? input.format : input.verification.format;
  return {
    schemaVersion: 1,
    tool: { name: "lazarus-1-2-3", version: input.toolVersion },
    source: { fileName: input.fileName.split(/[\\/]/).pop()!, sha256: input.sha256, byteLength: input.byteLength, format },
    tolerance: { ...(verifications[0]?.tolerance ?? TOLERANCE) },
    totals: sheets ? sumTotals(verifications.map((v) => v.totals)) : structuredClone(verifications[0]!.totals),
    ...(sheets ? { sheets: sheets.map(reportSheet) } : {}),
    unsupportedFeatures: unsupportedFeatures(rows),
    unknownOpcodes: unknownOpcodes(rows),
    rows,
    ...(input.macros && input.macros.length > 0 ? { macros: input.macros.map(macroItem) } : {}),
  };
}

const macroItem = (m: ReportMacroItem): ReportMacroItem => ({
  kind: m.kind,
  title: m.title,
  sheet: m.sheet,
  steps: m.steps.map((s) => ({ label: s.label, raw: s.raw })),
  explanation: m.explanation,
  rationale: m.rationale,
  confidence: m.confidence,
  model: m.model,
  status: m.status,
  decidedAt: m.decidedAt,
  cells: [...m.cells],
});
