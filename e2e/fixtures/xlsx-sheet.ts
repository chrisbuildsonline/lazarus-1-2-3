// A hand-built sheet and verification result for the browser bundle check (e2e/xlsx-browser.spec.ts).
// Shared by the in-page entry and the spec, so both sides compare against the same literal cells.
import { a1, cellKey, type Cell, type Sheet } from "../../src/parser/index.ts";
import { TOLERANCE, type CellResult, type SheetVerification } from "../../src/verify/index.ts";

export const CELLS: Cell[] = [
  { kind: "number", col: 0, row: 0, value: 0.1 },
  { kind: "integer", col: 1, row: 0, value: -42 },
  { kind: "label", col: 0, row: 1, prefix: "^", text: "Total <b>&</b>" },
  // A3 = A1 + B1 in Lotus; cached 0.1 + -42 = -41.9 (the double the file would store).
  { kind: "formula", col: 0, row: 2, cached: 0.1 + -42, rpn: new Uint8Array([0x03]) },
  // B3 = @SUM(A1..B1), cached the same sum.
  { kind: "formula", col: 1, row: 2, cached: 0.1 + -42, rpn: new Uint8Array([0x03]) },
];

export const FORMULAS: Record<string, { excel: string; lotus: string }> = {
  A3: { excel: "A1+B1", lotus: "+A1+B1" },
  B3: { excel: "SUM(A1:B1)", lotus: "@SUM(A1..B1)" },
};

export function handBuilt(): { sheet: Sheet; verification: SheetVerification } {
  const sheet: Sheet = { format: "wk1", version: null, sawEof: true, declaredDimensions: null, cells: new Map(CELLS.map((c) => [cellKey(c.col, c.row), c])) };
  const cells: CellResult[] = CELLS.flatMap((c) => {
    if (c.kind !== "formula") return [];
    const address = a1(c.col, c.row);
    const f = FORMULAS[address]!;
    return [{ address, col: c.col, row: c.row, status: "matched", cached: { t: "num", v: c.cached }, recalculated: { t: "num", v: c.cached }, reason: { code: "exact", message: "exact" }, formula: f.excel, lotusFormula: f.lotus, candidateOpcodes: [] }];
  });
  const n = cells.length;
  return { sheet, verification: { name: "", format: "wk1", tolerance: TOLERANCE, cells, totals: { formulas: n, matched: n, mismatched: 0, unverifiable: 0, exact: n, withinTolerance: 0, byReason: { exact: n } } } };
}
