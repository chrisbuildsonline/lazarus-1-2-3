// Selection functions: IF (S15), CHOOSE (S16, U07), VLOOKUP and HLOOKUP (S17, U07). IF and
// CHOOSE take their branches as functions, so only the chosen one is evaluated and only its errors
// count (S12); the evaluator passes `() => evaluate(arg, ctx)`. The chosen value passes through
// unchanged, label flag included, so a label result still becomes U02.
import { numbers } from "./ops.ts";
import { err, num, undocumented, type Operand, type Outcome, type Range, type RangeCell, type Value } from "./value.ts";

export type Branch = () => Outcome<Value>;

const ok = (v: Value): Outcome<Value> => ({ ok: true, v });
const u07 = (what: string): Outcome<Value> => ({ ok: false, u: undocumented("U07", what) });

/** S15: a nonzero condition takes the second argument, zero the third. */
export function ifValue(condition: Operand, then: Branch, otherwise: Branch): Outcome<Value> {
  const c = numbers([condition]);
  if (!Array.isArray(c)) return c;
  return c[0] !== 0 ? then() : otherwise();
}

/** S16: the option at INT(x), counted from 0; ERR below 0 or past the last; U07 for -1 < x < 0. */
export function choose(x: Operand, options: readonly Branch[]): Outcome<Value> {
  const xs = numbers([x]);
  if (!Array.isArray(xs)) return xs;
  const at = xs[0]!;
  if (at > -1 && at < 0) return u07(`@CHOOSE with an index of ${at}, between -1 and 0`);
  const option = at < 0 ? undefined : options[Math.trunc(at)];
  return option ? option() : ok(err());
}

/** The value a lookup returns from a cell: an empty cell is 0 (S01), a failed formula passes its reason on. */
const result = (c: RangeCell | undefined): Outcome<Value> => {
  if (c === undefined || c.t === "empty") return ok(num(0));
  if (c.t === "unverifiable") return { ok: false, u: c.u };
  return ok(c);
};

/**
 * S17 over `count` keys: the last key not above x (keys ascending), then the cell `offset` places
 * along, counted from 0, within `span` places. ERR when the first key is above x or the offset is
 * outside the range; U07 for a string selector, a fractional offset, a key that is not a number or
 * keys out of order.
 */
function lookup(name: string, x: Operand, offset: Operand, count: number, span: number, key: (i: number) => RangeCell | undefined, cell: (i: number, k: number) => RangeCell | undefined): Outcome<Value> {
  if (x.t === "str") return u07(`@${name} with a text selector`);
  const xs = numbers([x, offset]);
  if (!Array.isArray(xs)) return xs;
  const [selector = 0, k = 0] = xs;
  if (!Number.isInteger(k)) return u07(`@${name} with a fractional offset ${k}`);
  if (k < 0 || k >= span) return ok(err());
  let found = -1;
  for (let i = 0; i < count; i++) {
    const c = key(i);
    if (c?.t === "unverifiable") return { ok: false, u: c.u };
    if (c?.t !== "num" || c.label) return u07(`@${name} with a key that is not a number`);
    const prev = i > 0 ? key(i - 1) : undefined;
    if (prev?.t === "num" && c.v < prev.v) return u07(`@${name} with keys that are not in ascending order`);
    if (c.v <= selector) found = i;
  }
  return found < 0 ? ok(err()) : result(cell(found, k));
}

const at = (r: Range, row: number, col: number) => r.cells[row * r.cols + col];

/** Keys down the first column; the offset counts columns. */
export const vlookup = (x: Operand, table: Range, offset: Operand): Outcome<Value> =>
  lookup("VLOOKUP", x, offset, table.rows, table.cols, (i) => at(table, i, 0), (i, k) => at(table, i, k));

/** Keys along the first row; the offset counts rows. */
export const hlookup = (x: Operand, table: Range, offset: Operand): Outcome<Value> =>
  lookup("HLOOKUP", x, offset, table.cols, table.rows, (i) => at(table, 0, i), (i, k) => at(table, k, i));
