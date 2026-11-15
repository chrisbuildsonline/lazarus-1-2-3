import { describe, expect, it } from "vitest";
import { MATH } from "../../../src/verify/math.ts";
import { withinTolerance } from "../../../src/verify/tolerance.ts";
import { err, labelZero, na, num, str, type Operand, type Outcome, type Value } from "../../../src/verify/value.ts";

const call = (name: string, ...args: Operand[]): Outcome<Value> => MATH[name]!(args);
const ok = (v: Value) => ({ ok: true, v });
const ERR = ok(err());
const numOf = (o: Outcome<Value>) => (o.ok && o.v.t === "num" ? o.v.v : NaN);
const rule = (r: string) => ({ ok: false, u: { code: "undocumented-semantics", rule: r } });

describe("INT, ABS, SQRT (S07, S10)", () => {
  it("S07: INT(1.258) is 1 and INT(-1.258) is -1 (MAN 19-11)", () => {
    expect(call("INT", num(1.258))).toEqual(ok(num(1)));
    expect(call("INT", num(-1.258))).toEqual(ok(num(-1)));
  });

  it("S07: INT(-0.5) is 0 (a -0 result counts as 0 under the tolerance rule)", () => {
    expect(withinTolerance(numOf(call("INT", num(-0.5))), 0)).toBe(true);
  });

  it("S10: ABS(-6.2) is 6.2", () => {
    expect(call("ABS", num(-6.2))).toEqual(ok(num(6.2)));
  });

  it("S10: SQRT(2) is 1.4142 to four places, SQRT(-1) is ERR (MAN 19-15)", () => {
    expect(numOf(call("SQRT", num(2)))).toBeCloseTo(1.4142, 4);
    expect(call("SQRT", num(-1))).toEqual(ERR);
  });

  it("S12: ERR and NA propagate through INT, ABS, SQRT", () => {
    for (const f of ["INT", "ABS", "SQRT"]) {
      expect(call(f, err()), f).toEqual(ERR);
      expect(call(f, na()), f).toEqual(ok(na()));
    }
  });

  it("S01: a label argument is 0, a string is U01", () => {
    expect(call("ABS", labelZero())).toEqual(ok(num(0)));
    expect(call("ABS", str("x"))).toMatchObject(rule("U01"));
  });
});

describe("MOD (S08)", () => {
  it("S08: MOD(15, 7) is 1, MOD(-15, 7) is -1, MOD(15, -7) is 1, MOD(5.5, 2) is 1.5", () => {
    expect(call("MOD", num(15), num(7))).toEqual(ok(num(1)));
    expect(call("MOD", num(-15), num(7))).toEqual(ok(num(-1)));
    expect(call("MOD", num(15), num(-7))).toEqual(ok(num(1)));
    expect(call("MOD", num(5.5), num(2))).toEqual(ok(num(1.5)));
  });

  it("S08: MOD(x, 0) is ERR", () => {
    expect(call("MOD", num(15), num(0))).toEqual(ERR);
    expect(call("MOD", num(0), num(0))).toEqual(ERR);
  });

  it("S08: the result is x - y * INT(x / y), as the manual writes it", () => {
    for (const [x, y] of [[7.3, 2.1], [-7.3, 2.1], [1e10 + 0.5, 3], [0.3, 0.1]] as const) {
      expect(call("MOD", num(x), num(y)), `${x}, ${y}`).toEqual(ok(num(x - y * Math.trunc(x / y))));
    }
  });
});

describe("ROUND (S09, U03)", () => {
  const TABLE: [number, number][] = [[-3, 7000], [-2, 7100], [-1, 7150], [0, 7145], [1, 7145.3], [2, 7145.26], [3, 7145.258]];
  for (const [n, expected] of TABLE) {
    it(`S09: ROUND(7145.258, ${n}) is ${expected}`, () => {
      expect(call("ROUND", num(7145.258), num(n))).toEqual(ok(num(expected)));
    });
  }

  it("S09: n is cut to an integer: 2.9 acts as 2, -2.9 as -2", () => {
    expect(call("ROUND", num(7145.258), num(2.9))).toEqual(ok(num(7145.26)));
    expect(call("ROUND", num(7145.258), num(-2.9))).toEqual(ok(num(7100)));
  });

  it("U03: n = 16 and n = -16 are unverifiable", () => {
    expect(call("ROUND", num(1.5), num(16))).toMatchObject(rule("U03"));
    expect(call("ROUND", num(1.5), num(-16))).toMatchObject(rule("U03"));
  });

  it("U03: a halfway value is unverifiable: ROUND(2.5, 0), ROUND(0.125, 2)", () => {
    expect(call("ROUND", num(2.5), num(0))).toMatchObject(rule("U03"));
    expect(call("ROUND", num(0.125), num(2))).toMatchObject(rule("U03"));
  });

  it("S12: ROUND(ERR, 2) is ERR", () => {
    expect(call("ROUND", err(), num(2))).toEqual(ERR);
  });
});

describe("constants (S11, S12)", () => {
  it("S11: PI is Math.PI, TRUE is 1, FALSE is 0", () => {
    expect(call("PI")).toEqual(ok(num(Math.PI)));
    expect(call("TRUE")).toEqual(ok(num(1)));
    expect(call("FALSE")).toEqual(ok(num(0)));
  });

  it("S12: NA is the NA value, ERR the ERR value", () => {
    expect(call("NA")).toEqual(ok(na()));
    expect(call("ERR")).toEqual(ERR);
  });
});

describe("DATE (S18 to S20, U06)", () => {
  const CASES: [number, number, number, number][] = [
    [82, 9, 27, 30221], [1, 2, 4, 401], [0, 1, 1, 1], [0, 2, 28, 59], [0, 2, 29, 60], [0, 3, 1, 61], [1, 1, 1, 367],
    [89, 1, 1, 32509], [99, 12, 31, 36525], [100, 1, 1, 36526], [100, 2, 29, 36585], [199, 12, 31, 73050],
  ];
  for (const [y, m, d, serial] of CASES) {
    it(`S18-S20: DATE(${y},${m},${d}) is ${serial}`, () => {
      expect(call("DATE", num(y), num(m), num(d))).toEqual(ok(num(serial)));
    });
  }

  it("S18: DATE(83,14,8), DATE(83,4,31), DATE(0,2,30) and DATE(1,2,29) are ERR", () => {
    for (const [y, m, d] of [[83, 14, 8], [83, 4, 31], [0, 2, 30], [1, 2, 29]] as const) {
      expect(call("DATE", num(y), num(m), num(d)), `${y},${m},${d}`).toEqual(ERR);
    }
  });

  it("U06: year 200, year -1 and a fractional argument are unverifiable", () => {
    expect(call("DATE", num(200), num(1), num(1))).toMatchObject(rule("U06"));
    expect(call("DATE", num(-1), num(1), num(1))).toMatchObject(rule("U06"));
    expect(call("DATE", num(82), num(9.5), num(27))).toMatchObject(rule("U06"));
    expect(call("DATE", num(82), num(9), num(27.5))).toMatchObject(rule("U06"));
  });

  it("S12: an ERR argument gives ERR", () => {
    expect(call("DATE", num(82), err(), num(1))).toEqual(ERR);
  });
});
