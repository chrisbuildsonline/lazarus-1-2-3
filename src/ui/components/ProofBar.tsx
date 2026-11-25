// The 8px proof bar: one segment per non-zero status, matched, mismatched, unverifiable (requirement 29).
// The figures are also visible as text; the bar is never their only carrier.
import type { Totals } from "../../verify/index.ts";
import { sweepSegments } from "../model/sweep.ts";
import { describeTotals, proofSegments } from "../model/totals.ts";

/** `shown` is set during the sweep: the bar fills with it while its label keeps the engine's totals. */
export function ProofBar({ totals, describedBy, shown }: { totals: Totals; describedBy?: string; shown?: Totals }) {
  const segments = shown ? sweepSegments(shown, totals) : proofSegments(totals);
  return (
    <div className="proof" role="img" aria-label={describeTotals(totals)} aria-describedby={describedBy}>
      {segments.map((s) => (
        <span key={s.status} className={`proof__seg proof__seg--${s.status}`} style={{ flexGrow: s.fraction }} />
      ))}
    </div>
  );
}
