// The 8px proof bar: one segment per non-zero status, matched, mismatched, unverifiable (requirement 29).
// The figures are also visible as text; the bar is never their only carrier.
import type { Totals } from "../../verify/index.ts";
import { describeTotals, proofSegments } from "../model/totals.ts";

export function ProofBar({ totals, describedBy }: { totals: Totals; describedBy?: string }) {
  return (
    <div className="proof" role="img" aria-label={describeTotals(totals)} aria-describedby={describedBy}>
      {proofSegments(totals).map((s) => (
        <span key={s.status} className={`proof__seg proof__seg--${s.status}`} style={{ flexGrow: s.fraction }} />
      ))}
    </div>
  );
}
