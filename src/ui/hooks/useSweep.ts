// Drives the verification sweep (DESIGN.md 4.2; seance-visuals requirements 17 to 27): one
// requestAnimationFrame loop that sets the lit count only when it changes (48 times for the sample),
// and cancels its frame on unmount or when the sweep is switched off. When `enabled` is false the
// final state is shown from the first render.
import { useEffect, useMemo, useState } from "react";
import type { CellResult, Totals } from "../../verify/index.ts";
import { litAt, partialTotals, planSweep, type SweepPlan } from "../model/sweep.ts";

export type Sweep = { plan: SweepPlan; lit: number; running: boolean; partial: Totals };

export function useSweep(cells: readonly CellResult[], engine: Totals, enabled: boolean): Sweep {
  const n = cells.length;
  const plan = useMemo(() => planSweep(cells), [cells]);
  const [lit, setLit] = useState(() => (enabled ? 0 : n));

  useEffect(() => {
    if (!enabled || plan.steps === 0) {
      setLit(n);
      return;
    }
    let frame = 0;
    let shown = -1;
    const start = performance.now();
    const tick = (now: number) => {
      const next = litAt(plan, n, now - start);
      if (next !== shown) {
        shown = next;
        setLit(next);
      }
      if (next < n) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled, plan, n]);

  const shownLit = enabled ? lit : n;
  const partial = useMemo(() => partialTotals(cells, engine, shownLit), [cells, engine, shownLit]);
  return { plan, lit: shownLit, running: shownLit < n, partial };
}
