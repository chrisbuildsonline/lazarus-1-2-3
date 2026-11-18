// Verification of a whole workbook: one SheetVerification per sheet. WK1, WKS and unreadable
// input go through the same path as verifySheet, so their result is unchanged.
import { parseWorkbook, type Diagnostic, type Workbook } from "../parser/index.ts";
import { classifySheet } from "./classify.ts";
import { sheetVerification, type SheetVerification } from "./report.ts";

export type VerifyWorkbookResult = { diagnostics: Diagnostic[]; verifications: SheetVerification[] };

export function verifyWorkbook(workbook: Workbook, name = ""): SheetVerification[] {
  return workbook.sheets.map((s) => sheetVerification(name, s.sheet.format, classifySheet(s.sheet)));
}

export function verifyWorkbookBytes(bytes: Uint8Array, name = ""): VerifyWorkbookResult {
  const { workbook, diagnostics } = parseWorkbook(bytes);
  return { diagnostics, verifications: verifyWorkbook(workbook, name) };
}
