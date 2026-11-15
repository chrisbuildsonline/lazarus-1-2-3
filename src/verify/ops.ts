// Operators over values: arithmetic (S13), comparison and logic (S14), ERR and NA propagation
// (S12), operand conversion (S01). 0 ^ 0 (U04), ERR with NA (U08) and text or label
// comparisons (U01) stay unverifiable. Results never carry the label flag.
import type { BinaryOp, UnaryOp } from "../formula/index.ts";
import { err, na, num, undocumented, type Operand, type Outcome, type Value } from "./value.ts";

const ok = (v: Value): Outcome<Value> => ({ ok: true, v });
const truth = (b: boolean): Outcome<Value> => ok(num(b ? 1 : 0));

/** S13: any result that is not a finite number is ERR. */
const finite = (x: number): Outcome<Value> => ok(Number.isFinite(x) ? num(x) : err());

function apply(op: Exclude<BinaryOp, "concat">, a: number, b: number): Outcome<Value> {
  switch (op) {
    case "add":
      return finite(a + b);
    case "sub":
      return finite(a - b);
    case "mul":
      return finite(a * b);
    case "div":
      return finite(a / b);
    case "pow":
      if (a === 0 && b === 0) return { ok: false, u: undocumented("U04", "0 raised to the power 0") };
      return finite(a ** b);
    // S14: exact IEEE comparison; a true statement is 1, a false one 0; nonzero is true.
    case "eq":
      return truth(a === b);
    case "ne":
      return truth(a !== b);
    case "lt":
      return truth(a < b);
    case "gt":
      return truth(a > b);
    case "le":
      return truth(a <= b);
    case "ge":
      return truth(a >= b);
    case "and":
      return truth(a !== 0 && b !== 0);
    case "or":
      return truth(a !== 0 || b !== 0);
  }
}

/**
 * S12: the first ERR or NA among the values, as the result; U08 when both kinds are present; null
 * when there is neither. Every operator and function calls it on the operands it uses, first.
 */
export function propagate(values: readonly Operand[]): Outcome<Value> | null {
  const hasErr = values.some((v) => v.t === "err");
  const hasNa = values.some((v) => v.t === "na");
  if (hasErr && hasNa) return { ok: false, u: undocumented("U08", "a calculation with both ERR and NA among its inputs") };
  if (hasErr) return ok(err());
  if (hasNa) return ok(na());
  return null;
}

const COMPARISONS: ReadonlySet<BinaryOp> = new Set(["eq", "ne", "lt", "gt", "le", "ge"]);

const u01 = (what: string): Outcome<Value> => ({ ok: false, u: undocumented("U01", what) });

/**
 * The number an operand stands for, or the U01 outcome: a string anywhere (U01), a label or an
 * empty cell in a comparison (U01, since Release 2 compares label text). Elsewhere a label or an
 * empty cell is 0 (S01).
 */
function operandNumber(v: Operand, comparison: boolean): number | Outcome<Value> {
  if (v.t === "str") return u01("text used in a calculation");
  if (comparison && v.t === "empty") return u01("a comparison with an empty cell");
  if (comparison && v.t === "num" && v.label) return u01("a comparison with a label");
  return v.t === "num" ? v.v : 0;
}

/**
 * The arguments of a number function as numbers: ERR/NA first (S12, U08), then a string is U01,
 * and a label or an empty cell is 0 (S01).
 */
export function numbers(args: readonly Operand[]): number[] | Outcome<Value> {
  const stop = propagate(args);
  if (stop) return stop;
  const out: number[] = [];
  for (const a of args) {
    const x = operandNumber(a, false);
    if (typeof x !== "number") return x;
    out.push(x);
  }
  return out;
}

export function binary(op: BinaryOp, a: Operand, b: Operand): Outcome<Value> {
  if (op === "concat") return u01("joining text with &");
  const stop = propagate([a, b]);
  if (stop) return stop;
  const x = operandNumber(a, COMPARISONS.has(op));
  if (typeof x !== "number") return x;
  const y = operandNumber(b, COMPARISONS.has(op));
  if (typeof y !== "number") return y;
  return apply(op, x, y);
}

export function unary(op: UnaryOp, a: Operand): Outcome<Value> {
  const stop = propagate([a]);
  if (stop) return stop;
  const x = operandNumber(a, false);
  if (typeof x !== "number") return x;
  return op === "not" ? truth(x === 0) : finite(op === "neg" ? -x : x);
}
