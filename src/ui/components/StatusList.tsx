// The phone status list (DESIGN.md 4.2, requirements 40 and 41): formula cells grouped Mismatched,
// Unverifiable, Matched, each in verify order; Matched starts collapsed behind a button.
import type { CellResult, Status } from "../../verify/index.ts";
import { COPY } from "../copy.ts";
import { formatNumber, formatValue } from "../model/format-value.ts";
import { filterRows, groupByStatus, type Filter } from "../model/status-groups.ts";
import { StatusPill } from "./StatusPill.tsx";

export type StatusListProps = {
  cells: readonly CellResult[];
  expanded: ReadonlySet<Status>;
  filter: Filter;
  /** The drawer's cell address. */
  selected: string | null;
  onToggle: (status: Status) => void;
  onOpen: (address: string) => void;
};

function Row({ r, selected, onOpen }: { r: CellResult; selected: boolean; onOpen: (address: string) => void }) {
  const formula = r.lotusFormula ?? COPY.formulaUnreadable;
  const value = formatValue(r.cached, "cached");
  return (
    <li>
      <button
        type="button"
        className={selected ? "status-row is-selected" : "status-row"}
        aria-label={`${r.address}, ${formula}, ${value}, ${COPY.status[r.status]}`}
        data-address={r.address}
        onClick={() => onOpen(r.address)}
      >
        {/* Spaces between the parts so the visible text reads as the label does (axe label-content-name-mismatch). */}
        <span className="status-row__main">
          <span className="status-row__addr">{r.address}</span>{" "}
          <span className="status-row__formula">{formula}</span>
        </span>{" "}
        <span className="status-row__side">
          <span className={r.cached === null ? "status-row__value is-missing" : "status-row__value"}>{value}</span>{" "}
          <StatusPill status={r.status} />
        </span>
      </button>
    </li>
  );
}

export function StatusList({ cells, expanded, filter, selected, onToggle, onOpen }: StatusListProps) {
  const groups = groupByStatus(cells, expanded, filter);
  const { empty } = filterRows(cells, filter);
  return (
    <div className="status-list" aria-label={COPY.statusListLabel} role="region">
      {groups.map((g) => (
        <section key={g.status} className="status-group" data-status={g.status}>
          {g.status === "matched" && filter !== "matched" ? (
            <button type="button" className="status-group__head status-group__toggle" aria-expanded={g.expanded} onClick={() => onToggle(g.status)}>
              {COPY.status[g.status]} <span className="status-group__count">{formatNumber(g.count)}</span>
              <span className="visually-hidden">{" · "}</span>
              <span className="status-group__action">{g.expanded ? COPY.hide : COPY.showAll}</span>
            </button>
          ) : (
            <h2 className="status-group__head">
              {COPY.status[g.status]} <span className="status-group__count">{formatNumber(g.count)}</span>
            </h2>
          )}
          {g.rows.length > 0 && (
            <ul className="status-group__rows">
              {g.rows.map((r) => (
                <Row key={r.address} r={r} selected={selected === r.address} onOpen={onOpen} />
              ))}
            </ul>
          )}
        </section>
      ))}
      {empty && <p className="status-list__empty">{empty}</p>}
    </div>
  );
}
