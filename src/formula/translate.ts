// translateFormula: rpn bytes to the Lotus AST and Excel text, with one status for the cell.
import type { Expr, Origin } from "./ast.ts";
import { decodeRpn } from "./decode.ts";
import { diag, type FormulaDiagnostic } from "./diagnostics.ts";
import { toExcelAst } from "./excel-ast.ts";
import { printExcel } from "./print-excel.ts";

export type FormulaTranslation = {
  status: "ok" | "unverifiable";
  /** The Lotus AST. Kept when the only errors are no-excel-equivalent (requirement 29). */
  ast: Expr | null;
  excel: string | null;
  diagnostics: FormulaDiagnostic[];
  unknown: { opcode: number; offset: number } | null;
};

const MAX_TEXT = 8192;

/** Any error, or a volatile function whose value cannot be checked against the cache. */
export function isUnverifiable(diagnostics: readonly FormulaDiagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error" || d.code === "volatile-function");
}

export function translateFormula(rpn: Uint8Array, origin: Origin): FormulaTranslation {
  const decoded = decodeRpn(rpn, origin);
  const diagnostics = [...decoded.diagnostics];
  let excel: string | null = null;
  if (decoded.ast) {
    const x = toExcelAst(decoded.ast, rpn.length);
    diagnostics.push(...x.diagnostics);
    if (x.ast) {
      const p = printExcel(x.ast, rpn.length);
      diagnostics.push(...p.diagnostics);
      excel = p.text;
      if (excel !== null && excel.length > MAX_TEXT) {
        diagnostics.push(diag("excel-limit", "error", rpn.length, `formula text has ${excel.length} characters; Excel allows ${MAX_TEXT}`));
      }
    }
  }
  const errors = diagnostics.filter((d) => d.severity === "error");
  return {
    status: isUnverifiable(diagnostics) ? "unverifiable" : "ok",
    ast: errors.every((d) => d.code === "no-excel-equivalent") ? decoded.ast : null,
    excel: errors.length ? null : excel,
    diagnostics,
    unknown: decoded.unknown,
  };
}
