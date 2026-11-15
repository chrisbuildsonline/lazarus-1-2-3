// Financial functions: PMT, PV, FV (S21 to S23, interest 0 is U05) and NPV (S24, U09).
import { numbers } from "./ops.ts";
import { err, num, undocumented, type Operand, type Outcome, type Range, type Value } from "./value.ts";

type Fn = (args: readonly Operand[]) => Outcome<Value>;

const ok = (v: Value): Outcome<Value> => ({ ok: true, v });

/** S13: a result that is not a finite number is ERR. */
const finite = (x: number): Outcome<Value> => ok(Number.isFinite(x) ? num(x) : err());

/** First argument (principal or payment), interest, term; interest 0 is U05 (the formulas divide 0 by 0). */
const annuity =
  (name: string, f: (amount: number, interest: number, term: number) => number): Fn =>
  (args) => {
    const xs = numbers(args);
    if (!Array.isArray(xs)) return xs;
    const [amount = 0, interest = 0, term = 0] = xs;
    if (interest === 0) return { ok: false, u: undocumented("U05", `@${name} with an interest rate of 0`) };
    return finite(f(amount, interest, term));
  };

export const FINANCE: Readonly<Record<string, Fn>> = {
  PMT: annuity("PMT", (p, i, n) => (p * i) / (1 - (1 + i) ** -n)),
  PV: annuity("PV", (p, i, n) => (p * (1 - (1 + i) ** -n)) / i),
  FV: annuity("FV", (p, i, n) => (p * ((1 + i) ** n - 1)) / i),
};

/** S24: the sum of value_i / (1 + interest)^i, i from 1, over a one-row or one-column range. */
export function npv(interest: Operand, range: Range): Outcome<Value> {
  for (const c of range.cells) if (c.t === "unverifiable") return { ok: false, u: c.u };
  const u09 = (what: string): Outcome<Value> => ({ ok: false, u: undocumented("U09", what) });
  if (range.rows > 1 && range.cols > 1) return u09("@NPV over a range that is not one row or one column");
  const cells = range.cells as readonly Operand[];
  if (cells.some((c) => c.t === "empty" || (c.t === "num" && c.label))) return u09("@NPV over a range holding a label or a blank cell");
  const xs = numbers([interest, ...cells]);
  if (!Array.isArray(xs)) return xs;
  const [rate = 0, ...flows] = xs;
  let sum = 0;
  flows.forEach((x, i) => {
    sum += x / (1 + rate) ** (i + 1);
  });
  return finite(sum);
}
