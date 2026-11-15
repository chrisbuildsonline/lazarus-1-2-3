import { describe, expect, it } from "vitest";
import { LISTS, type ListArg } from "../../../src/verify/lists.ts";
import { empty, err, labelZero, na, num, str, type Outcome, type RangeCell, type Value } from "../../../src/verify/value.ts";

const one = (cell: RangeCell): ListArg => ({ range: false, cell });
const range = (...cells: RangeCell[]): ListArg => ({ range: true, cells });
const call = (name: string, ...args: ListArg[]): Outcome<Value> => LISTS[name]!(args);
const ok = (v: Value) => ({ ok: true, v });
const numOf = (o: Outcome<Value>) => (o.ok && o.v.t === "num" ? o.v.v : NaN);
const rule = (r: string) => ({ ok: false, u: { code: "undocumented-semantics", rule: r } });
const unv = { code: "circular-reference" as const, message: "loop" };
const ns = (...xs: number[]) => xs.map((x) => one(num(x)));

describe("SUM (S01, S02, U11)", () => {
  it("S02: adds numbers", () => {
    expect(call("SUM", ...ns(1, 2.5, 3))).toEqual(ok(num(6.5)));
    expect(call("SUM", range(num(1), num(2)), one(num(4)))).toEqual(ok(num(7)));
  });

  it("S01: a label counts 0; empty range cells are ignored", () => {
    expect(call("SUM", range(num(5), labelZero(), empty(), num(2)))).toEqual(ok(num(7)));
    expect(call("SUM", one(labelZero()), one(num(3)))).toEqual(ok(num(3)));
  });

  it("S12: an ERR item gives ERR, an NA item NA; U08 for both", () => {
    expect(call("SUM", range(num(1), err()))).toEqual(ok(err()));
    expect(call("SUM", one(na()), one(num(1)))).toEqual(ok(na()));
    expect(call("SUM", one(err()), range(na()))).toMatchObject(rule("U08"));
  });

  it("S01: a single reference to an empty cell adds 0", () => {
    expect(call("SUM", one(empty()), one(num(2)))).toEqual(ok(num(2)));
  });

  it("U11: zero arguments is unverifiable, for every list function", () => {
    for (const f of ["SUM", "AVG", "COUNT", "MIN", "MAX", "STD"]) expect(call(f), f).toMatchObject(rule("U11"));
  });

  it("U01: a string item is unverifiable", () => {
    expect(call("SUM", one(str("x")))).toMatchObject(rule("U01"));
  });

  it("an unverifiable item makes the sum unverifiable with that reason", () => {
    expect(call("SUM", range(num(1), { t: "unverifiable", u: unv }))).toEqual({ ok: false, u: unv });
  });
});

describe("COUNT (S04)", () => {
  it("S04: COUNT(0), COUNT(ERR), COUNT(NA) are 1 (MAN 19-6)", () => {
    expect(call("COUNT", one(num(0)))).toEqual(ok(num(1)));
    expect(call("COUNT", one(err()))).toEqual(ok(num(1)));
    expect(call("COUNT", one(na()))).toEqual(ok(num(1)));
  });

  it("S04: one reference to an empty cell is 1", () => {
    expect(call("COUNT", one(empty()))).toEqual(ok(num(1)));
  });

  it("S04: a range of four cells with one blank is 3; labels and ERR cells in it count", () => {
    expect(call("COUNT", range(num(1), num(2), empty(), num(4)))).toEqual(ok(num(3)));
    expect(call("COUNT", range(labelZero(), err(), empty(), str("Odd")))).toEqual(ok(num(3)));
  });

  it("S04: nothing propagates, not even an unverifiable formula cell", () => {
    expect(call("COUNT", one(err()), range(na(), { t: "unverifiable", u: unv }), one({ t: "unverifiable", u: unv }))).toEqual(ok(num(4)));
  });
});

describe("AVG (S03)", () => {
  it("S03: AVG(2, 7, 4, 22) is 8.75", () => {
    expect(call("AVG", ...ns(2, 7, 4, 22))).toEqual(ok(num(8.75)));
  });

  it("S03: the R23 pair: 175 over a range with a blank is 43.75, the same cells listed give 35", () => {
    // Four numbers summing to 175 and one blank: 175 / 4 in a range, 175 / 5 when listed.
    expect(call("AVG", range(num(20), num(30), num(50), empty(), num(75)))).toEqual(ok(num(43.75)));
    expect(call("AVG", one(num(20)), one(num(30)), one(num(50)), one(empty()), one(num(75)))).toEqual(ok(num(35)));
  });

  it("S01: labels raise the count and add 0", () => {
    expect(call("AVG", range(num(6), labelZero()))).toEqual(ok(num(3)));
  });

  it("S03: nothing to average is ERR", () => {
    expect(call("AVG", range(empty(), empty()))).toEqual(ok(err()));
  });

  it("S12: ERR items propagate", () => {
    expect(call("AVG", range(num(1), err()))).toEqual(ok(err()));
  });
});

describe("MIN and MAX (S05)", () => {
  // MAN 19-12: H1 = 56, H2 = 14, H3 empty, H4 = -20.
  const H = [num(56), num(14), empty(), num(-20)] as const;

  it("S05: MAX(H1..H4) is 56, MIN(H1..H4) is -20, MIN(H1..H3) is 14", () => {
    expect(call("MAX", range(...H))).toEqual(ok(num(56)));
    expect(call("MIN", range(...H))).toEqual(ok(num(-20)));
    expect(call("MIN", range(H[0], H[1], H[2]))).toEqual(ok(num(14)));
  });

  it("S05: a label counts 0", () => {
    expect(call("MIN", range(num(5), labelZero()))).toEqual(ok(num(0)));
  });

  it("S05: no entries is ERR", () => {
    expect(call("MAX", range(empty()))).toEqual(ok(err()));
    expect(call("MIN", range())).toEqual(ok(err()));
  });

  it("S12: ERR items propagate", () => {
    expect(call("MAX", range(num(1), na()))).toEqual(ok(na()));
  });
});

describe("STD (S06)", () => {
  it("S06: STD of 45.60, 33.01, 41.00, 49.57 shows as 6.159076 (MAN 19-15)", () => {
    // By hand: mean 42.295; squared deviations 10.923025, 86.211225, 1.677025, 52.925625 sum to
    // 151.7369; / 4 = 37.934225; root 6.15907664. The manual prints the first six decimals
    // (6.159076), cut rather than rounded, so the test checks the digits it printed.
    const x = numOf(call("STD", range(num(45.6), num(33.01), num(41), num(49.57))));
    expect(x.toFixed(8).slice(0, 8)).toBe("6.159076");
    expect(x).toBeCloseTo(6.15907664, 7);
  });

  it("S06: STD(10, 11.5) is 0.75 exactly, the population deviation (gnome647171-1.wks C2)", () => {
    // Mean 10.75, deviations +-0.75, mean square 0.5625, root 0.75.
    expect(call("STD", ...ns(10, 11.5))).toEqual(ok(num(0.75)));
  });

  it("S06: a single item is 0; no items is ERR", () => {
    expect(call("STD", ...ns(42))).toEqual(ok(num(0)));
    expect(call("STD", range(empty()))).toEqual(ok(err()));
  });

  it("S01: labels count 0", () => {
    // Items 0 and 2: mean 1, deviation 1.
    expect(call("STD", range(labelZero(), num(2)))).toEqual(ok(num(1)));
  });

  it("S12: ERR items propagate", () => {
    expect(call("STD", range(num(1), err()))).toEqual(ok(err()));
  });
});
