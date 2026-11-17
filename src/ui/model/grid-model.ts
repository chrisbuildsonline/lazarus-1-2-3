// What the grid shows for each cell of a raised file (requirements 33 to 35). The used range comes
// from the cells, not the declared dimensions; a formula cell's status comes from its CellResult.
import { a1, cellKey } from "../../parser/index.ts";
import type { CellResult, Status } from "../../verify/index.ts";
import type { RaisedFile } from "../../workers/verify-protocol.ts";
import { COPY } from "../copy.ts";
import { formatNumber, formatValue } from "./format-value.ts";

export type DisplayCell = {
  kind: "empty" | "number" | "label" | "formula";
  text: string;
  align: "left" | "right" | "center";
  /** Formula cells only. */
  status: Status | null;
  /** Formula cells only: the file stored no value (a cached NaN). */
  noStoredValue?: true;
};

export type GridModel = {
  /** Used range as 1-based counts. */
  rows: number;
  cols: number;
  at(col: number, row: number): DisplayCell;
  /** Ascending 0-based rows holding a formula cell of that status. */
  rowsWithStatus(s: Status): number[];
  /** Verify order. */
  formulaCells: CellResult[];
};

const EMPTY: DisplayCell = Object.freeze({ kind: "empty", text: "", align: "left", status: null });

const LABEL_ALIGN: Record<string, DisplayCell["align"]> = { '"': "right", "^": "center" };

export function columnLetters(col: number): string {
  return a1(col, 0).slice(0, -1);
}

export function buildGridModel(file: RaisedFile): GridModel {
  const results = new Map(file.verification.cells.map((r) => [cellKey(r.col, r.row), r]));
  const display = new Map<number, DisplayCell>();
  let rows = 0;
  let cols = 0;
  for (const c of file.sheet.cells) {
    rows = Math.max(rows, c.row + 1);
    cols = Math.max(cols, c.col + 1);
    const key = cellKey(c.col, c.row);
    if (c.kind === "label") display.set(key, { kind: "label", text: c.text, align: LABEL_ALIGN[c.prefix] ?? "left", status: null });
    else if (c.kind !== "formula") display.set(key, { kind: "number", text: formatNumber(c.value), align: "right", status: null });
    else {
      const r = results.get(key);
      const cell: DisplayCell = r
        ? { kind: "formula", text: formatValue(r.cached, "cached"), align: "right", status: r.status }
        : { kind: "formula", text: formatNumber(c.cached), align: "right", status: null };
      if (r && r.cached === null) cell.noStoredValue = true;
      display.set(key, cell);
    }
  }
  return {
    rows,
    cols,
    at: (col, row) => display.get(cellKey(col, row)) ?? EMPTY,
    rowsWithStatus: (s) => [...new Set(file.verification.cells.filter((r) => r.status === s).map((r) => r.row))].sort((a, b) => a - b),
    formulaCells: file.verification.cells,
  };
}

/** "B3, 18,330, Mismatched", "A1, OBSERV", "D9, empty", "B2, no stored value, Unverifiable". */
export function cellLabel(address: string, c: DisplayCell): string {
  if (c.kind === "empty") return `${address}, ${COPY.emptyCell}`;
  if (c.status === null) return `${address}, ${c.text}`;
  return `${address}, ${c.noStoredValue ? COPY.noStoredValue : c.text}, ${COPY.status[c.status]}`;
}
