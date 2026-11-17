// Verified headline, the three counts with their pills, the proof bar and the honest-limits line
// (requirements 27 to 30). Counts are SheetVerification.totals as they are.
import { useId } from "react";
import type { Status, Totals } from "../../verify/index.ts";
import { COPY } from "../copy.ts";
import { formatNumber } from "../model/format-value.ts";
import { headline, STATUS_ORDER } from "../model/totals.ts";
import { ProofBar } from "./ProofBar.tsx";
import { StatusPill } from "./StatusPill.tsx";

function CountTile({ status, count }: { status: Status; count: number }) {
  return (
    <div className={`tile tile--${status}`}>
      <span className="tile__label">{COPY.status[status]}</span>
      <span className="tile__value">{formatNumber(count)}</span>
      <StatusPill status={status} />
    </div>
  );
}

export function TotalsSurface({ totals }: { totals: Totals }) {
  const countsId = useId();
  return (
    <section className="surface totals" aria-label={COPY.totals}>
      <div className="totals__tiles" id={countsId}>
        <div className="tile tile--headline">
          <span className="tile__label">{COPY.verified}</span>
          {/* "No formulas" is words, not a number: one step smaller so the tiles stay on one line. */}
          <span className={totals.formulas === 0 ? "tile__value tile__value--display tile__value--words" : "tile__value tile__value--display"}>{headline(totals)}</span>
        </div>
        {STATUS_ORDER.map((s) => (
          <CountTile key={s} status={s} count={totals[s]} />
        ))}
      </div>
      <ProofBar totals={totals} describedBy={countsId} />
      {totals.unverifiable > 0 && <p className="totals__note">{COPY.honestLimits}</p>}
    </section>
  );
}
