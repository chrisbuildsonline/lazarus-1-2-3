// List functions over arguments that are single cells or ranges (S01 to S06, U11). A listed
// argument is always one item (an empty cell or a label is 0); a range gives its non-empty cells,
// labels as 0, in row-major order. Items are used in argument order, so the sum order is fixed.
import { propagate } from "./ops.ts";
import { err, num, undocumented, type Outcome, type RangeCell, type Value } from "./value.ts";

export type ListArg = { range: false; cell: RangeCell } | { range: true; cells: readonly RangeCell[] };

type Fn = (args: readonly ListArg[]) => Outcome<Value>;

const ok = (v: Value): Outcome<Value> => ({ ok: true, v });

/** S13: a result that is not a finite number is ERR. */
const finite = (x: number): Outcome<Value> => ok(Number.isFinite(x) ? num(x) : err());

/** The items as numbers, or why there are none: an unverifiable cell, a string (U01), ERR/NA (S12). */
function items(args: readonly ListArg[]): number[] | Outcome<Value> {
  const values: Value[] = [];
  for (const arg of args) {
    for (const c of arg.range ? arg.cells : [arg.cell]) {
      if (c.t === "unverifiable") return { ok: false, u: c.u };
      if (c.t === "str") return { ok: false, u: undocumented("U01", "text in a list of numbers") };
      if (c.t === "empty") {
        if (!arg.range) values.push(num(0));
      } else values.push(c);
    }
  }
  return propagate(values) ?? values.map((v) => (v.t === "num" ? v.v : 0));
}

/** U11 for no arguments, then f over the items. */
const list =
  (f: (xs: number[]) => Outcome<Value>): Fn =>
  (args) => {
    if (args.length === 0) return { ok: false, u: undocumented("U11", "a list function with no arguments") };
    const xs = items(args);
    return Array.isArray(xs) ? f(xs) : xs;
  };

const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);

/** S04: 1 per listed argument whatever it holds, and the non-empty cells of each range. No propagation. */
const count: Fn = (args) => {
  if (args.length === 0) return { ok: false, u: undocumented("U11", "a list function with no arguments") };
  return ok(num(args.reduce((n, a) => n + (a.range ? a.cells.filter((c) => c.t !== "empty").length : 1), 0)));
};

export const LISTS: Readonly<Record<string, Fn>> = {
  SUM: list((xs) => finite(sum(xs))),
  COUNT: count,
  AVG: list((xs) => (xs.length === 0 ? ok(err()) : finite(sum(xs) / xs.length))),
  MIN: list((xs) => (xs.length === 0 ? ok(err()) : ok(num(Math.min(...xs))))),
  MAX: list((xs) => (xs.length === 0 ? ok(err()) : ok(num(Math.max(...xs))))),
  STD: list((xs) => {
    if (xs.length === 0) return ok(err());
    const mean = sum(xs) / xs.length;
    return finite(Math.sqrt(sum(xs.map((x) => (x - mean) ** 2)) / xs.length));
  }),
};
