import { describe, expect, it } from "vitest";
import { choose, hlookup, ifValue, vlookup } from "../../../src/verify/lookup.ts";
import { empty, err, labelZero, na, num, str, type Operand, type Outcome, type Range, type RangeCell, type Value } from "../../../src/verify/value.ts";

const ok = (v: Value): Outcome<Value> => ({ ok: true, v });
const rule = (r: string) => ({ ok: false, u: { code: "undocumented-semantics", rule: r } });
const lazy = (...vs: Value[]) => vs.map((v) => () => ok(v));
const boom = () => {
  throw new Error("an unchosen argument was evaluated");
};

describe("CHOOSE (S16, U07)", () => {
  const abc = lazy(num(10), num(20), num(30));

  it("S16: index 0, 1, 1.3 and 2.95 pick the first, second, second and third value (MAN 19-5)", () => {
    expect(choose(num(0), abc)).toEqual(ok(num(10)));
    expect(choose(num(1), abc)).toEqual(ok(num(20)));
    expect(choose(num(1.3), abc)).toEqual(ok(num(20)));
    expect(choose(num(2.95), abc)).toEqual(ok(num(30)));
  });

  it("S16: -1 and n + 1 give ERR", () => {
    expect(choose(num(-1), abc)).toEqual(ok(err()));
    expect(choose(num(3), abc)).toEqual(ok(err()));
  });

  it("U07: an index between -1 and 0 is unverifiable", () => {
    expect(choose(num(-0.5), abc)).toMatchObject(rule("U07"));
  });

  it("S16: only the chosen argument is evaluated, so an ERR elsewhere does not propagate", () => {
    expect(choose(num(1), [boom, () => ok(num(20)), () => ok(err())])).toEqual(ok(num(20)));
  });

  it("S12: an ERR index gives ERR; U01: a string index is unverifiable", () => {
    expect(choose(err(), abc)).toEqual(ok(err()));
    expect(choose(str("1"), abc)).toMatchObject(rule("U01"));
  });
});

// S17, MAN 19-9: keys 6000..6200 in row 0, the status row 2 holds 373, 381, 389, 397, 405.
const KEYS = [6000, 6050, 6100, 6150, 6200];
const ROW1 = [300, 310, 320, 330, 340];
const ROW2 = [373, 381, 389, 397, 405];
const wide = (keys: RangeCell[] = KEYS.map(num)): Range => ({ rows: 3, cols: 5, cells: [...keys, ...ROW1.map(num), ...ROW2.map(num)] });
const tall = (): Range => ({ rows: 5, cols: 3, cells: KEYS.flatMap((k, i) => [num(k), num(ROW1[i]!), num(ROW2[i]!)]) });

describe("HLOOKUP and VLOOKUP (S17, U07)", () => {
  it("S17: HLOOKUP(6089, table, 2) is 381", () => {
    expect(hlookup(num(6089), wide(), num(2))).toEqual(ok(num(381)));
  });

  it("S17: VLOOKUP on the transposed table agrees", () => {
    expect(vlookup(num(6089), tall(), num(2))).toEqual(ok(num(381)));
    expect(vlookup(num(6100), tall(), num(1))).toEqual(ok(num(320)));
  });

  it("S17: a selector below the first key is ERR; above the last key gives the last", () => {
    expect(hlookup(num(5999), wide(), num(2))).toEqual(ok(err()));
    expect(hlookup(num(99999), wide(), num(2))).toEqual(ok(num(405)));
    expect(vlookup(num(5999), tall(), num(2))).toEqual(ok(err()));
  });

  it("S17: an offset beyond the range or below 0 is ERR", () => {
    expect(hlookup(num(6089), wide(), num(3))).toEqual(ok(err()));
    expect(hlookup(num(6089), wide(), num(-1))).toEqual(ok(err()));
    expect(vlookup(num(6089), tall(), num(5))).toEqual(ok(err()));
  });

  it("U07: unsorted keys, a fractional offset, a label key and a string selector are unverifiable", () => {
    expect(hlookup(num(6089), wide([6000, 6100, 6050, 6150, 6200].map(num)), num(2))).toMatchObject(rule("U07"));
    expect(hlookup(num(6089), wide(), num(1.5))).toMatchObject(rule("U07"));
    expect(hlookup(num(6089), wide([num(6000), labelZero(), num(6100), num(6150), num(6200)]), num(2))).toMatchObject(rule("U07"));
    expect(hlookup(num(6089), wide([num(6000), empty(), num(6100), num(6150), num(6200)]), num(2))).toMatchObject(rule("U07"));
    expect(vlookup(str("x"), tall(), num(1))).toMatchObject(rule("U07"));
  });

  it("S12: an ERR selector or offset gives ERR", () => {
    expect(hlookup(err(), wide(), num(2))).toEqual(ok(err()));
    expect(vlookup(num(6089), tall(), na())).toEqual(ok(na()));
  });
});

describe("IF (S15)", () => {
  const cond = (c: Operand, a: Value, b: Value) => ifValue(c, () => ok(a), () => ok(b));

  it("S15: a nonzero condition gives the second argument, zero the third", () => {
    expect(cond(num(1), num(5), num(7))).toEqual(ok(num(5)));
    expect(cond(num(-0.5), num(5), num(7))).toEqual(ok(num(5)));
    expect(cond(num(0), num(5), num(7))).toEqual(ok(num(7)));
  });

  it("S15: only the chosen branch counts: IF(1, 5, 1/0) is 5 and IF(0, 1/0, 7) is 7", () => {
    expect(ifValue(num(1), () => ok(num(5)), boom)).toEqual(ok(num(5)));
    expect(ifValue(num(0), boom, () => ok(num(7)))).toEqual(ok(num(7)));
    expect(ifValue(num(1), () => ok(num(5)), () => ok(err()))).toEqual(ok(num(5)));
  });

  it("S12: an ERR condition gives ERR", () => {
    expect(cond(err(), num(1), num(2))).toEqual(ok(err()));
  });

  it("U01: a string condition is unverifiable", () => {
    expect(cond(str("yes"), num(1), num(2))).toMatchObject(rule("U01"));
  });
});
