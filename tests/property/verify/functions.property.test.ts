// Function invariants (design.md "Property tests"; S03, S07 to S09, S18 to S23, requirements 48 to
// 61). Domains are bounded where a double cannot hold the identity: interest of at least 0.001 so
// 1 - (1 + i)^-n does not cancel below the tolerance, and moderate magnitudes for MOD and ROUND.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { verifySheet } from "../../../src/verify/index.ts";
import { FINANCE } from "../../../src/verify/finance.ts";
import { LISTS, type ListArg } from "../../../src/verify/lists.ts";
import { MATH } from "../../../src/verify/math.ts";
import { TOLERANCE, withinTolerance } from "../../../src/verify/tolerance.ts";
import { empty, labelZero, num, type Operand, type Outcome, type RangeCell, type Value } from "../../../src/verify/value.ts";
import { buildSheet, call, range, type Spec } from "../../unit/helpers/build-sheet.ts";
import { LAST_SERIAL, dateOf } from "../../unit/helpers/serial-table.ts";

const numOf = (o: Outcome<Value>) => (o.ok && o.v.t === "num" ? o.v.v : NaN);
const fn = (name: string, ...xs: number[]) => (MATH[name] ?? FINANCE[name])!(xs.map(num) as Operand[]);
const isTie = (o: Outcome<Value>) => !o.ok && o.u.rule === "U03";
const moderate = fc.double({ min: -1e9, max: 1e9, noNaN: true });
const places = fc.integer({ min: -6, max: 10 });

describe("ROUND (S09)", () => {
  it("S09: ROUND(ROUND(x, n), n) equals ROUND(x, n)", () => {
    fc.assert(
      fc.property(moderate, places, (x, n) => {
        const once = fn("ROUND", x, n);
        fc.pre(!isTie(once));
        expect(numOf(fn("ROUND", numOf(once), n)) === numOf(once)).toBe(true);
      }),
    );
  });

  it("S09: |ROUND(x, n) - x| is at most half a unit of the nth place, plus tolerance", () => {
    fc.assert(
      fc.property(moderate, places, (x, n) => {
        const once = fn("ROUND", x, n);
        fc.pre(!isTie(once));
        const r = numOf(once);
        const slack = Math.max(TOLERANCE.relative * Math.max(Math.abs(r), Math.abs(x)), TOLERANCE.absolute);
        expect(Math.abs(r - x)).toBeLessThanOrEqual(0.5 * 10 ** -n + slack);
      }),
    );
  });
});

describe("INT and MOD (S07, S08)", () => {
  it("S07: INT(-x) is -INT(x) and |INT(x)| <= |x|", () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), (x) => {
        expect(numOf(fn("INT", -x)) === -numOf(fn("INT", x))).toBe(true);
        expect(Math.abs(numOf(fn("INT", x)))).toBeLessThanOrEqual(Math.abs(x));
      }),
    );
  });

  it("S08: MOD(x, y) + y * INT(x / y) equals x within tolerance", () => {
    const y = fc.double({ min: -1e3, max: 1e3, noNaN: true }).filter((v) => Math.abs(v) >= 1e-3);
    fc.assert(
      fc.property(moderate, y, (x, y) => {
        const back = numOf(fn("MOD", x, y)) + y * numOf(fn("INT", x / y));
        expect(withinTolerance(back, x), `${x} ${y} ${back}`).toBe(true);
      }),
    );
  });

  it("S08: |MOD(x, y)| < |y| (integers, where x / y is exact enough to truncate right)", () => {
    const y = fc.integer({ min: -1000, max: 1000 }).filter((v) => v !== 0);
    fc.assert(
      fc.property(fc.integer({ min: -1e9, max: 1e9 }), y, (x, y) => {
        expect(Math.abs(numOf(fn("MOD", x, y)))).toBeLessThan(Math.abs(y));
      }),
    );
  });
});

describe("SUM and AVG (S01 to S03)", () => {
  const grid = ["A1", "B1", "C1", "A2", "B2", "C2", "A3", "B3", "C3"];

  it("S02: SUM over a range is the left fold of its cells in row-major order", () => {
    const cell = fc.option(fc.double({ min: -1e17, max: 1e17, noNaN: true }), { nil: undefined });
    fc.assert(
      fc.property(fc.array(cell, { minLength: 9, maxLength: 9 }), (values) => {
        const specs: Record<string, Spec> = { E5: call("SUM", range("C3", "A1")) };
        grid.forEach((address, i) => {
          if (values[i] !== undefined) specs[address] = values[i]!;
        });
        const fold = values.reduce<number>((s, v) => (v === undefined ? s : s + v), 0);
        const result = verifySheet(buildSheet(specs)).cells.find((c) => c.address === "E5")!;
        expect(result.recalculated).toEqual({ t: "num", v: fold });
      }),
    );
  });

  it("S03: AVG equals SUM divided by COUNT", () => {
    const item: fc.Arbitrary<RangeCell> = fc.oneof(fc.double({ min: -1e6, max: 1e6, noNaN: true }).map(num), fc.constant(empty()), fc.constant(labelZero()));
    const arg: fc.Arbitrary<ListArg> = fc.oneof(
      item.map((cell): ListArg => ({ range: false, cell })),
      fc.array(item, { maxLength: 6 }).map((cells): ListArg => ({ range: true, cells })),
    );
    fc.assert(
      fc.property(fc.array(arg, { minLength: 1, maxLength: 5 }), (args) => {
        const count = numOf(LISTS.COUNT!(args));
        const avg = LISTS.AVG!(args);
        if (count === 0) expect(avg).toEqual({ ok: true, v: { t: "err" } });
        else expect(numOf(avg)).toBe(numOf(LISTS.SUM!(args)) / count);
      }),
    );
  });
});

describe("PMT, PV and FV (S21 to S23)", () => {
  const principal = fc.double({ min: 1, max: 1e6, noNaN: true });
  const interest = fc.double({ min: 0.001, max: 0.5, noNaN: true });
  const term = fc.integer({ min: 1, max: 360 });

  it("S21, S22: PV(PMT(p, i, n), i, n) equals p within tolerance", () => {
    fc.assert(
      fc.property(principal, interest, term, (p, i, n) => {
        const back = numOf(fn("PV", numOf(fn("PMT", p, i, n)), i, n));
        expect(withinTolerance(back, p), `${p} ${i} ${n} ${back}`).toBe(true);
      }),
    );
  });

  it("S22, S23: FV equals PV * (1 + i)^n within tolerance", () => {
    fc.assert(
      fc.property(principal, interest, term, (pmt, i, n) => {
        const fv = numOf(fn("FV", pmt, i, n));
        const grown = numOf(fn("PV", pmt, i, n)) * (1 + i) ** n;
        expect(withinTolerance(fv, grown), `${pmt} ${i} ${n} ${fv} ${grown}`).toBe(true);
      }),
    );
  });
});

describe("DATE (S18 to S20)", () => {
  const serial = fc.integer({ min: 1, max: LAST_SERIAL });

  it("S19, S20: DATE agrees with the day-by-day table on every serial drawn", () => {
    fc.assert(
      fc.property(serial, (s) => {
        const { y, m, d } = dateOf(s)!;
        expect(numOf(fn("DATE", y - 1900, m, d)), `${y}-${m}-${d}`).toBe(s);
      }),
    );
  });

  it("S18: DATE(y, m, d + 1) - DATE(y, m, d) is 1 inside a month", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: LAST_SERIAL - 1 }), (s) => {
        const { y, m, d } = dateOf(s)!;
        fc.pre(dateOf(s + 1)!.m === m);
        expect(numOf(fn("DATE", y - 1900, m, d + 1)) - numOf(fn("DATE", y - 1900, m, d)), `${y}-${m}-${d}`).toBe(1);
      }),
    );
  });
});
