// Number functions whose arguments are all evaluated: INT, ABS, SQRT (S07, S10), MOD (S08),
// ROUND (S09, U03), the constants PI, TRUE, FALSE, NA, ERR (S11, S12) and DATE (S18 to S20, U06).
// Keyed by the Lotus name from OPCODES; each takes the evaluated arguments in written order.
import { dateSerial } from "./dates.ts";
import { roundDecimal } from "./decimal.ts";
import { numbers } from "./ops.ts";
import { err, na, num, undocumented, type Operand, type Outcome, type Value } from "./value.ts";

type Fn = (args: readonly Operand[]) => Outcome<Value>;

const ok = (v: Value): Outcome<Value> => ({ ok: true, v });
const unverifiable = (rule: string, what: string): Outcome<Value> => ({ ok: false, u: undocumented(rule, what) });

/** S13: a result that is not a finite number is ERR. */
const finite = (x: number): Outcome<Value> => ok(Number.isFinite(x) ? num(x) : err());

/** A function of the arguments as numbers, after ERR/NA propagation and conversion. */
const numeric =
  (f: (xs: number[]) => Outcome<Value>): Fn =>
  (args) => {
    const xs = numbers(args);
    return Array.isArray(xs) ? f(xs) : xs;
  };

const at = (xs: number[], i: number) => xs[i] ?? 0;

function round(x: number, n: number): Outcome<Value> {
  const places = Math.trunc(n);
  if (places < -15 || places > 15) return unverifiable("U03", `@ROUND with ${places} places, outside -15 to 15`);
  const r = roundDecimal(x, places);
  return "tie" in r ? unverifiable("U03", `@ROUND of ${x}, exactly halfway at ${places} places`) : ok(num(r.value));
}

function date(year: number, month: number, day: number): Outcome<Value> {
  if (![year, month, day].every(Number.isInteger)) return unverifiable("U06", "@DATE with a fractional argument");
  if (year < 0 || year > 199) return unverifiable("U06", `@DATE with year ${year}, outside 0 to 199`);
  const serial = dateSerial(year, month, day);
  return ok(serial === null ? err() : num(serial));
}

export const MATH: Readonly<Record<string, Fn>> = {
  INT: numeric((xs) => finite(Math.trunc(at(xs, 0)))),
  ABS: numeric((xs) => finite(Math.abs(at(xs, 0)))),
  SQRT: numeric((xs) => finite(Math.sqrt(at(xs, 0)))),
  MOD: numeric(([x = 0, y = 0]) => (y === 0 ? ok(err()) : finite(x - y * Math.trunc(x / y)))),
  ROUND: numeric(([x = 0, n = 0]) => round(x, n)),
  DATE: numeric(([y = 0, m = 0, d = 0]) => date(y, m, d)),
  PI: () => ok(num(Math.PI)),
  TRUE: () => ok(num(1)),
  FALSE: () => ok(num(0)),
  NA: () => ok(na()),
  ERR: () => ok(err()),
};
