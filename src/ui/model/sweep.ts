// The verification sweep (DESIGN.md 4.2; seance-visuals requirements 17 to 22, 26): formula cells light
// up one by one in verify order while the totals count up. Presentation only. Nothing here changes a
// CellResult or a Totals; the last step hands back the engine's totals field by field.
import type { CellResult, Totals } from "../../verify/index.ts";
import { proofSegments } from "./totals.ts";

export const SWEEP = { maxMs: 2500, frameMs: 50, minMs: 400, perCellMs: 15 } as const;

export type SweepPlan = {
  /** clamp(n * perCellMs, minMs, maxMs); 0 for no cells. */
  durationMs: number;
  /** min(n, floor(durationMs / frameMs)); 0 for no cells. */
  steps: number;
  /** Address to index in verify order. */
  rank: ReadonlyMap<string, number>;
};

export function planSweep(cells: readonly CellResult[]): SweepPlan {
  const n = cells.length;
  const durationMs = n === 0 ? 0 : Math.min(SWEEP.maxMs, Math.max(SWEEP.minMs, n * SWEEP.perCellMs));
  const steps = Math.min(n, Math.floor(durationMs / SWEEP.frameMs));
  return { durationMs, steps, rank: new Map(cells.map((c, i) => [c.address, i])) };
}

/** Cells lit at t ms after the start: steps spread evenly over the duration (never closer than frameMs). */
export function litAt(plan: SweepPlan, n: number, t: number): number {
  if (plan.steps === 0 || t >= plan.durationMs) return n;
  const k = Math.min(plan.steps, Math.floor(t / (plan.durationMs / plan.steps)));
  return Math.ceil((n * k) / plan.steps);
}

/** Totals of the first `lit` cells, over the engine's formula count. From lit = n on, a copy of the engine totals. */
export function partialTotals(cells: readonly CellResult[], engine: Totals, lit: number): Totals {
  if (lit >= cells.length) return { ...engine, byReason: { ...engine.byReason } };
  const t: Totals = { formulas: engine.formulas, matched: 0, mismatched: 0, unverifiable: 0, exact: 0, withinTolerance: 0, byReason: {} };
  for (let i = 0; i < lit; i++) {
    const c = cells[i]!;
    t[c.status]++;
    if (c.reason.code === "exact") t.exact++;
    else if (c.reason.code === "within-tolerance") t.withinTolerance++;
    t.byReason[c.reason.code] = (t.byReason[c.reason.code] ?? 0) + 1;
  }
  return t;
}

/** Proof bar segments over the engine's formula count, so the bar fills from empty. */
export function sweepSegments(partial: Totals, engine: Totals) {
  return proofSegments({ ...partial, formulas: engine.formulas });
}

/**
 * scrollLeft that opens the grid on the proof: 0 when the formula block fits, else the least value
 * that shows its last column, but never past its first column.
 */
export function initialScrollLeft(firstFormulaCol: number | null, colWidth: number, bodyWidth: number, lastFormulaCol = firstFormulaCol): number {
  if (firstFormulaCol === null || lastFormulaCol === null) return 0;
  const toShowLast = (lastFormulaCol + 1) * colWidth - bodyWidth;
  return Math.max(0, Math.min(firstFormulaCol * colWidth, toShowLast));
}
