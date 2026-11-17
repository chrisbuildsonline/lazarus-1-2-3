// The verification engine's entry points (requirement 1): recalculate every formula of a parsed
// WK1/WKS sheet and compare it with the value the file stored.
import { parseWk1, type Diagnostic, type Sheet } from "../parser/index.ts";
import { classifySheet } from "./classify.ts";
import { sheetVerification, type SheetVerification } from "./report.ts";

export type { CellResult, InputRow, Status } from "./classify.ts";
export type { SheetVerification, Totals } from "./report.ts";
export { TOLERANCE, type Tolerance } from "./tolerance.ts";
export type { Reason, ReasonCode, Value } from "./value.ts";

export type VerifyBytesResult = { diagnostics: Diagnostic[]; verification: SheetVerification };

export function verifySheet(sheet: Sheet, name = ""): SheetVerification {
  return sheetVerification(name, sheet.format, classifySheet(sheet));
}

export function verifyBytes(bytes: Uint8Array, name = ""): VerifyBytesResult {
  const { sheet, diagnostics } = parseWk1(bytes);
  return { diagnostics, verification: verifySheet(sheet, name) };
}
