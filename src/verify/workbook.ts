// Verification of a whole workbook: one SheetVerification per sheet.
// - WK1, WKS and unreadable input: the WK1 classifier, exactly as verifySheet.
// - WK3: the RPN is never decoded with the WK1 table (it would give wrong answers), so every
//   formula is unverifiable with its stored result; a WK3 cell is never matched.
// - DBF: no formulas, so no results.
import { a1, parseWorkbook, type Diagnostic, type Sheet, type Workbook } from "../parser/index.ts";
import { classifySheet, type CellResult } from "./classify.ts";
import { sheetVerification, type SheetVerification } from "./report.ts";
import { valueFromDouble, wk3FormulaNotDecoded } from "./value.ts";

export type VerifyWorkbookResult = { diagnostics: Diagnostic[]; verifications: SheetVerification[] };
export type VerifyWorkbookDeps = { classify?: (sheet: Sheet) => CellResult[] };

function wk3Results(sheet: Sheet): CellResult[] {
  const out: CellResult[] = [];
  for (const c of sheet.cells.values()) {
    if (c.kind !== "formula") continue;
    out.push({ address: a1(c.col, c.row), col: c.col, row: c.row, status: "unverifiable", cached: valueFromDouble(c.cached), recalculated: null, reason: wk3FormulaNotDecoded(), formula: null, lotusFormula: null, candidateOpcodes: [] });
  }
  return out.sort((a, b) => a.row - b.row || a.col - b.col);
}

export function verifyWorkbook(workbook: Workbook, name = "", deps: VerifyWorkbookDeps = {}): SheetVerification[] {
  const classify = deps.classify ?? classifySheet;
  return workbook.sheets.map(({ sheet }) => {
    if (sheet.format === "wk3") return sheetVerification(name, "wk3", wk3Results(sheet));
    if (sheet.format === "dbf") return sheetVerification(name, "dbf", []);
    return sheetVerification(name, sheet.format, classify(sheet));
  });
}

export function verifyWorkbookBytes(bytes: Uint8Array, name = ""): VerifyWorkbookResult {
  const { workbook, diagnostics } = parseWorkbook(bytes);
  return { diagnostics, verifications: verifyWorkbook(workbook, name) };
}
