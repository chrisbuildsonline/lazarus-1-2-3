// The provenance report model (design "Report model"). Values reuse the verify Value type.
import type { InputRow, Reason, ReasonCode, SheetVerification, Status, Tolerance, Totals, Value } from "../verify/index.ts";

export type ReportSheetInput = {
  name: string;
  verification: SheetVerification;
  /** Cells read on the sheet, for the DBF as-read line. */
  values: number;
  /** DBF only: the field names. */
  fields?: string[];
};

export type ReportInput = {
  /** May include a path; buildReport keeps the base name. */
  fileName: string;
  /** 64 lowercase hex. */
  sha256: string;
  byteLength: number;
  toolVersion: string;
} & ({ verification: SheetVerification } | { format: SheetVerification["format"]; sheets: ReportSheetInput[] });

export type ReportSheet = {
  name: string;
  format: SheetVerification["format"];
  totals: Totals;
  /** DBF only: values shown as read. */
  asRead?: number;
  fields?: string[];
  /** A plain line on what was and was not checked, for WK3 and DBF. */
  wording?: string;
};

export type ReportRow = {
  address: string;
  lotusFormula: string | null;
  excelFormula: string | null;
  cached: Value | null;
  recalculated: Value | null;
  status: Status;
  reason: Reason;
  /** "0x08" form, only when non-empty. */
  candidateOpcodes?: string[];
  inputs?: InputRow[];
  inputsOmitted?: number;
};

export type UnknownOpcodeEntry = { opcode: string | null; count: number; addresses: string[] };
export type UnsupportedFeatureEntry = { code: ReasonCode; rule: string | null; name: string | null; count: number; addresses: string[] };

export type ProvenanceReport = {
  schemaVersion: 1;
  tool: { name: "lazarus-1-2-3"; version: string };
  source: { fileName: string; sha256: string; byteLength: number; format: SheetVerification["format"] };
  tolerance: Tolerance;
  totals: Totals;
  /** Only for a report built from sheets; totals is their sum. */
  sheets?: ReportSheet[];
  unsupportedFeatures: UnsupportedFeatureEntry[];
  unknownOpcodes: UnknownOpcodeEntry[];
  rows: ReportRow[];
};
