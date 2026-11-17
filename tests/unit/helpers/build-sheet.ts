// Test-only: a parser Sheet built directly from a table of addresses, with formulas given as Lotus
// ASTs (encoded with rpn-encode.ts, absolute references) or as literal rpn bytes.
import type { BinaryOp, Expr } from "../../../src/formula/index.ts";
import { cellKey, parseA1, type Cell, type Sheet } from "../../../src/parser/index.ts";
import { encodeRpn } from "./rpn-encode.ts";

export const at = (address: string) => {
  const p = parseA1(address);
  if (!p) throw new Error(`bad address ${address}`);
  return p;
};

export const n = (value: number): Expr => ({ type: "number", value });
export const ref = (address: string): Expr => ({ type: "ref", ref: { ...at(address), colAbs: true, rowAbs: true } });
export const range = (from: string, to: string): Expr => ({
  type: "range",
  from: { ...at(from), colAbs: true, rowAbs: true },
  to: { ...at(to), colAbs: true, rowAbs: true },
});
export const call = (name: string, ...args: Expr[]): Expr => ({ type: "call", name, args });
export const bin = (op: BinaryOp, left: Expr, right: Expr): Expr => ({ type: "binary", op, left, right });

/** A number cell, a label (string), a formula with cached 0, or a formula with its cached double or raw rpn. */
export type Spec = number | string | Expr | { f: Expr; cached: number } | { rpn: readonly number[]; cached: number };

export function formulaCell(col: number, row: number, f: Expr, cached = 0): Cell {
  return { kind: "formula", col, row, cached, rpn: encodeRpn(f, { col, row }) };
}

function cell(address: string, spec: Spec): Cell {
  const { col, row } = at(address);
  if (typeof spec === "number") return { kind: "number", col, row, value: spec };
  if (typeof spec === "string") return { kind: "label", col, row, prefix: "'", text: spec };
  if ("rpn" in spec) return { kind: "formula", col, row, cached: spec.cached, rpn: Uint8Array.from(spec.rpn) };
  if ("f" in spec) return formulaCell(col, row, spec.f, spec.cached);
  return formulaCell(col, row, spec);
}

export function sheetOf(cells: readonly Cell[]): Sheet {
  return { format: "wk1", version: 0x0406, sawEof: true, declaredDimensions: null, cells: new Map(cells.map((c) => [cellKey(c.col, c.row), c])) };
}

export function buildSheet(specs: Record<string, Spec>): Sheet {
  return sheetOf(Object.entries(specs).map(([a, s]) => cell(a, s)));
}
