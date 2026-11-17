// classify: compare the recalculated outcome with the cached value (design.md "Classification"),
// and build one CellResult per formula cell. Decoding happens in recalc.ts, before evaluation.
import { printLotus, translateFormula, type Expr } from "../formula/index.ts";
import { a1, cellKey, cellsInRowMajorOrder, type Cell, type Sheet } from "../parser/index.ts";
import { filterRange, precedents } from "./graph.ts";
import { recalcSheet } from "./recalc.ts";
import { withinTolerance } from "./tolerance.ts";
import { cachedNotANumber, labelResult, matchedReason, mismatchedReason, stringResult, valueFromDouble, type Outcome, type Reason, type Value } from "./value.ts";

export type Status = "matched" | "mismatched" | "unverifiable";

export type InputRow = { address: string; kind: "number" | "label" | "empty" | "formula"; value: Value | null; cached: Value | null };

export type CellResult = {
  address: string;
  col: number;
  row: number;
  status: Status;
  /** null only for a cached NaN. */
  cached: Value | null;
  /** null when the engine could not compute one. */
  recalculated: Value | null;
  reason: Reason;
  /** Excel text, for display; null when the translation fails. */
  formula: string | null;
  /** Lotus @ text of the decoded formula, for the report; null when decoding fails. */
  lotusFormula: string | null;
  candidateOpcodes: number[];
  /** Mismatched only: the first 20 direct precedents. */
  inputs?: InputRow[];
  inputsOmitted?: number;
};

const MAX_INPUTS = 20;

/** One result per formula cell, in row-major order (requirement 13). */
export function classifySheet(sheet: Sheet): CellResult[] {
  const outcomes = recalcSheet(sheet);
  const all = cellsInRowMajorOrder(sheet);
  const allKeys = all.map((c) => cellKey(c.col, c.row));

  /** Requirement 35: each direct precedent (references, and the cells a range holds) with both values. */
  const inputs = (ast: Expr): InputRow[] => {
    const p = precedents(ast);
    const keys = new Set(p.refs.map((r) => cellKey(r.col, r.row)));
    for (const r of p.ranges) for (const k of filterRange(r, allKeys)) keys.add(k);
    return [...keys]
      .sort((a, b) => a - b)
      .map((k): InputRow => {
        const c = sheet.cells.get(k);
        const address = a1(k % 65536, Math.floor(k / 65536));
        if (!c) return { address, kind: "empty", value: null, cached: null };
        if (c.kind === "label") return { address, kind: "label", value: null, cached: null };
        if (c.kind !== "formula") return { address, kind: "number", value: valueFromDouble(c.value), cached: valueFromDouble(c.value) };
        const o = outcomes.get(k)!.outcome;
        return { address, kind: "formula", value: o.ok ? o.v : null, cached: valueFromDouble(c.cached) };
      });
  };

  return all.flatMap((cell: Cell): CellResult[] => {
    if (cell.kind !== "formula") return [];
    const { outcome, ast, candidateOpcodes } = outcomes.get(cellKey(cell.col, cell.row))!;
    const cached = valueFromDouble(cell.cached);
    const { status, reason } = classify(cached, outcome);
    const formula = translateFormula(cell.rpn, { col: cell.col, row: cell.row }).excel;
    const recalculated = outcome.ok ? outcome.v : null;
    const result: CellResult = { address: a1(cell.col, cell.row), col: cell.col, row: cell.row, status, cached, recalculated, reason, formula, lotusFormula: ast ? printLotus(ast) : null, candidateOpcodes };
    if (status === "mismatched" && ast) {
      const rows = inputs(ast);
      result.inputs = rows.slice(0, MAX_INPUTS);
      if (rows.length > MAX_INPUTS) result.inputsOmitted = rows.length - MAX_INPUTS;
    }
    return [result];
  });
}

export function classify(cached: Value | null, outcome: Outcome<Value>): { status: Status; reason: Reason } {
  const unverifiable = (reason: Reason) => ({ status: "unverifiable" as const, reason });
  if (!outcome.ok) return unverifiable(outcome.u);
  const r = outcome.v;
  if (r.t === "str") return unverifiable(stringResult());
  if (r.t === "num" && r.label) return unverifiable(labelResult());
  if (cached === null) return unverifiable(cachedNotANumber());
  if (r.t === "num" && cached.t === "num" && withinTolerance(cached.v, r.v)) return { status: "matched", reason: matchedReason(cached.v, r.v) };
  if ((r.t === "err" || r.t === "na") && cached.t === r.t) return { status: "matched", reason: { code: "exact", message: `The recalculated value is ${r.t.toUpperCase()}, as stored.` } };
  return { status: "mismatched", reason: mismatchedReason(cached, r) };
}
