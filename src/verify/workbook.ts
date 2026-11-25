// Verification of a whole workbook: one SheetVerification per sheet.
// - WK1, WKS and unreadable input: the classifier, exactly as verifySheet.
// - WK3: the same classifier, which decodes the RPN with the WK3 token table (opcodes-wk3.ts). A
//   formula that reads another sheet is unverifiable (wk3-formula-not-decoded) with its stored result.
// - DBF: no formulas, so no results.
import { parseWorkbook, type Diagnostic, type Sheet, type Workbook } from "../parser/index.ts";
import { classifySheet, type CellResult } from "./classify.ts";
import { sheetVerification, type SheetVerification } from "./report.ts";

export type VerifyWorkbookResult = { diagnostics: Diagnostic[]; verifications: SheetVerification[] };
export type VerifyWorkbookDeps = { classify?: (sheet: Sheet) => CellResult[] };

export function verifyWorkbook(workbook: Workbook, name = "", deps: VerifyWorkbookDeps = {}): SheetVerification[] {
  const classify = deps.classify ?? classifySheet;
  return workbook.sheets.map(({ sheet }) => {
    if (sheet.format === "dbf") return sheetVerification(name, "dbf", []);
    return sheetVerification(name, sheet.format, classify(sheet));
  });
}

export function verifyWorkbookBytes(bytes: Uint8Array, name = ""): VerifyWorkbookResult {
  const { workbook, diagnostics } = parseWorkbook(bytes);
  return { diagnostics, verifications: verifyWorkbook(workbook, name) };
}
