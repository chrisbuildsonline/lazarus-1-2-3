import { describe, expect, it } from "vitest";
import { FINANCE, npv } from "../../../src/verify/finance.ts";
import { empty, err, labelZero, na, num, type Operand, type Outcome, type Range, type RangeCell, type Value } from "../../../src/verify/value.ts";

const call = (name: string, ...args: number[]): Outcome<Value> => FINANCE[name]!(args.map(num));
const ok = (v: Value) => ({ ok: true, v });
const numOf = (o: Outcome<Value>) => (o.ok && o.v.t === "num" ? o.v.v : NaN);
const rule = (r: string) => ({ ok: false, u: { code: "undocumented-semantics", rule: r } });
const column = (...cells: RangeCell[]): Range => ({ rows: cells.length, cols: 1, cells });

describe("PMT, PV, FV (S21 to S23, U05)", () => {
  it("S21: PMT(50000, 0.145/12, 300) is 621.0815 to four places (MAN 19-13)", () => {
    expect(numOf(call("PMT", 50000, 0.145 / 12, 300))).toBeCloseTo(621.0815, 4);
  });

  it("S23: FV(1000, 0.145, 5) is 6675.9352 to four places (MAN 19-9)", () => {
    expect(numOf(call("FV", 1000, 0.145, 5))).toBeCloseTo(6675.9352, 4);
  });

  it("S22: PV(1000, 0.145, 5) from the written formula", () => {
    // By hand: 1.145^5 = 1.968010600..., 1 / that = 0.5081275..., (1 - 0.5081275) / 0.145 = 3.392224,
    // times 1000 is 3392.22. Cross-check: 3392.224 * 1.9680106 = 6675.93, the FV above.
    expect(numOf(call("PV", 1000, 0.145, 5))).toBeCloseTo(3392.22, 1);
  });

  it("S21-S23: the functions.wk1 hand calculations: PMT(3000,1,2) 4000, PV(4000,1,2) 3000, FV(4000,1,2) 12000", () => {
    // PMT = 3000 * 1 / (1 - 2^-2) = 3000 / 0.75; PV = 4000 * (1 - 0.25) / 1; FV = 4000 * (2^2 - 1) / 1.
    expect(call("PMT", 3000, 1, 2)).toEqual(ok(num(4000)));
    expect(call("PV", 4000, 1, 2)).toEqual(ok(num(3000)));
    expect(call("FV", 4000, 1, 2)).toEqual(ok(num(12000)));
  });

  it("U05: interest 0 is unverifiable for all three", () => {
    for (const f of ["PMT", "PV", "FV"]) expect(call(f, 1000, 0, 12), f).toMatchObject(rule("U05"));
  });

  it("S13: PMT with term 0 divides by zero and is ERR", () => {
    expect(call("PMT", 1000, 0.1, 0)).toEqual(ok(err()));
  });

  it("S21-S23: the first argument is the principal or payment, then interest, then term", () => {
    // Swapping principal and term would give a different number: PMT(300, 0.145/12, 50000) is about 3.6.
    expect(numOf(call("PMT", 300, 0.145 / 12, 50000))).toBeLessThan(10);
    expect(numOf(call("PMT", 50000, 0.145 / 12, 300))).toBeGreaterThan(600);
  });

  it("S12: ERR and NA propagate", () => {
    expect(FINANCE.PMT!([err(), num(0.1), num(2)])).toEqual(ok(err()));
    expect(FINANCE.FV!([num(1), num(0.1), na()])).toEqual(ok(na()));
  });
});

describe("NPV (S24, U09)", () => {
  it("S24: NPV(0.105, four receipts of 400) is 1254.343 to three places (MAN 19-13)", () => {
    expect(numOf(npv(num(0.105), column(num(400), num(400), num(400), num(400))))).toBeCloseTo(1254.343, 3);
  });

  it("S24: the functions.wk1 case NPV(1, 150, 220) is 130", () => {
    // 150 / 2 + 220 / 4 = 75 + 55.
    expect(npv(num(1), { rows: 1, cols: 2, cells: [num(150), num(220)] })).toEqual(ok(num(130)));
  });

  it("U09: a range with a label or an empty cell is unverifiable", () => {
    expect(npv(num(0.1), column(num(1), labelZero()))).toMatchObject(rule("U09"));
    expect(npv(num(0.1), column(num(1), empty()))).toMatchObject(rule("U09"));
  });

  it("U09: a range of two rows and two columns is unverifiable", () => {
    expect(npv(num(0.1), { rows: 2, cols: 2, cells: [num(1), num(2), num(3), num(4)] })).toMatchObject(rule("U09"));
  });

  it("S12: an ERR cell or an ERR rate gives ERR", () => {
    expect(npv(num(0.1), column(num(1), err()))).toEqual(ok(err()));
    const rate: Operand = err();
    expect(npv(rate, column(num(1)))).toEqual(ok(err()));
  });

  it("an unverifiable cell in the range makes NPV unverifiable with that reason", () => {
    const u = { code: "circular-reference" as const, message: "loop" };
    expect(npv(num(0.1), column(num(1), { t: "unverifiable", u }))).toEqual({ ok: false, u });
  });
});
