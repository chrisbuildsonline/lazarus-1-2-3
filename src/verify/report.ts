// Totals and the SheetVerification for one sheet (requirements 12, 20, 29).
import type { Wk1Format } from "../parser/index.ts";
import type { CellResult } from "./classify.ts";
import { TOLERANCE, type Tolerance } from "./tolerance.ts";
import type { ReasonCode } from "./value.ts";

export type Totals = {
  formulas: number;
  matched: number;
  mismatched: number;
  unverifiable: number;
  exact: number;
  withinTolerance: number;
  byReason: Partial<Record<ReasonCode, number>>;
};

export type SheetVerification = { name: string; format: Wk1Format; tolerance: Tolerance; cells: CellResult[]; totals: Totals };

export function totals(cells: readonly CellResult[]): Totals {
  const t: Totals = { formulas: cells.length, matched: 0, mismatched: 0, unverifiable: 0, exact: 0, withinTolerance: 0, byReason: {} };
  for (const c of cells) {
    t[c.status]++;
    if (c.reason.code === "exact") t.exact++;
    if (c.reason.code === "within-tolerance") t.withinTolerance++;
    t.byReason[c.reason.code] = (t.byReason[c.reason.code] ?? 0) + 1;
  }
  return t;
}

export function sheetVerification(name: string, format: Wk1Format, cells: CellResult[]): SheetVerification {
  return { name, format, tolerance: { ...TOLERANCE }, cells, totals: totals(cells) };
}
