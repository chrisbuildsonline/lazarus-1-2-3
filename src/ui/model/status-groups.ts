// The phone status list and the filters (requirements 39 to 41). Groups only reorder for display;
// the downloads keep verify order.
import type { CellResult, Status } from "../../verify/index.ts";
import { COPY } from "../copy.ts";

export type Filter = "all" | Status;
export type StatusGroup = { status: Status; count: number; expanded: boolean; rows: CellResult[] };

const GROUP_ORDER: readonly Status[] = ["mismatched", "unverifiable", "matched"];

/** Mismatched, unverifiable, matched; no empty group; matched collapsed unless expanded or filtered. */
export function groupByStatus(cells: readonly CellResult[], expanded: ReadonlySet<Status>, filter: Filter = "all"): StatusGroup[] {
  return GROUP_ORDER.filter((s) => filter === "all" || filter === s).flatMap((status) => {
    const all = cells.filter((c) => c.status === status);
    if (all.length === 0) return [];
    const open = status !== "matched" || expanded.has(status) || filter === status;
    return [{ status, count: all.length, expanded: open, rows: open ? all : [] }];
  });
}

export function statusCounts(cells: readonly CellResult[]): Record<Filter, number> {
  const counts = { all: cells.length, matched: 0, mismatched: 0, unverifiable: 0 };
  for (const c of cells) counts[c.status]++;
  return counts;
}

/** The cells a filter keeps, in verify order, and the empty-state sentence when none is left. */
export function filterRows(cells: readonly CellResult[], filter: Filter): { rows: CellResult[]; empty: string | null } {
  const rows = filter === "all" ? [...cells] : cells.filter((c) => c.status === filter);
  return { rows, empty: rows.length === 0 && filter !== "all" ? COPY.noCellsWithStatus(filter) : null };
}
