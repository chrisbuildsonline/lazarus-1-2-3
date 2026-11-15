import { describe, expect, it } from "vitest";
import { binary, propagate, unary } from "../../../src/verify/ops.ts";
import { empty, err, labelZero, na, num, str } from "../../../src/verify/value.ts";

const ok = (v: unknown) => ({ ok: true, v });
const ERR = ok({ t: "err" });

describe("arithmetic (S13)", () => {
  it("S13: add, subtract, multiply, divide on numbers", () => {
    expect(binary("add", num(2), num(3))).toEqual(ok(num(5)));
    expect(binary("sub", num(2), num(3))).toEqual(ok(num(-1)));
    expect(binary("mul", num(2.5), num(4))).toEqual(ok(num(10)));
    expect(binary("div", num(7), num(2))).toEqual(ok(num(3.5)));
  });

  it("S13: power: 2 ^ 10 is 1024", () => {
    expect(binary("pow", num(2), num(10))).toEqual(ok(num(1024)));
  });

  it("S13: negate and unary plus", () => {
    expect(unary("neg", num(4))).toEqual(ok(num(-4)));
    expect(unary("neg", num(-4))).toEqual(ok(num(4)));
    expect(unary("plus", num(4))).toEqual(ok(num(4)));
  });

  it("S13: 1/0, -1/0 and 0/0 are ERR", () => {
    expect(binary("div", num(1), num(0))).toEqual(ERR);
    expect(binary("div", num(-1), num(0))).toEqual(ERR);
    expect(binary("div", num(0), num(0))).toEqual(ERR);
  });

  it("S13: an overflow is ERR: 1e308 * 10", () => {
    expect(binary("mul", num(1e308), num(10))).toEqual(ERR);
    expect(binary("add", num(Number.MAX_VALUE), num(Number.MAX_VALUE))).toEqual(ERR);
  });

  it("S13: (-8) ^ 0.5 is ERR, the root of a negative number", () => {
    expect(binary("pow", num(-8), num(0.5))).toEqual(ERR);
  });

  it("U04: 0 ^ 0 is unverifiable", () => {
    expect(binary("pow", num(0), num(0))).toMatchObject({ ok: false, u: { code: "undocumented-semantics", rule: "U04" } });
  });
});

describe("comparisons and logic (S14)", () => {
  const ONE = ok(num(1));
  const ZERO = ok(num(0));

  it("S14: each of the six comparisons gives 1 when true and 0 when false", () => {
    const cases: [Parameters<typeof binary>[0], number, number, boolean][] = [
      ["eq", 2, 2, true], ["eq", 2, 3, false],
      ["ne", 2, 3, true], ["ne", 2, 2, false],
      ["lt", 2, 3, true], ["lt", 3, 2, false],
      ["gt", 3, 2, true], ["gt", 2, 3, false],
      ["le", 2, 2, true], ["le", 3, 2, false],
      ["ge", 2, 2, true], ["ge", 2, 3, false],
    ];
    for (const [op, a, b, truth] of cases) expect(binary(op, num(a), num(b)), `${a} ${op} ${b}`).toEqual(truth ? ONE : ZERO);
  });

  it("S14: comparison is exact: 0.1 + 0.2 = 0.3 is 0", () => {
    expect(binary("eq", num(0.1 + 0.2), num(0.3))).toEqual(ZERO);
  });

  it("S14: AND, OR and NOT treat any nonzero number as true and give 1 or 0", () => {
    expect(binary("and", num(2), num(-0.5))).toEqual(ONE);
    expect(binary("and", num(2), num(0))).toEqual(ZERO);
    expect(binary("or", num(0), num(7))).toEqual(ONE);
    expect(binary("or", num(0), num(0))).toEqual(ZERO);
    expect(unary("not", num(0))).toEqual(ONE);
    expect(unary("not", num(1))).toEqual(ZERO);
    expect(unary("not", num(2))).toEqual(ZERO);
  });
});

// Task 1 (docs/verify-evidence.md) found every KSBASE.WK1 comparison operand to be a NUMBER or
// INTEGER cell, so the U01 label-comparison rule affects 0 of its 160 formulas.
describe("operand conversion (S01, U01)", () => {
  const U01 = { ok: false, u: { code: "undocumented-semantics", rule: "U01" } };
  const COMPARISONS = ["eq", "ne", "lt", "gt", "le", "ge"] as const;

  for (const op of ["add", "sub", "mul", "div", "pow"] as const) {
    it(`U01: a string operand of ${op} is unverifiable`, () => {
      expect(binary(op, str("a"), num(1))).toMatchObject(U01);
      expect(binary(op, num(1), str("a"))).toMatchObject(U01);
    });

    it(`S01: a label operand of ${op} reads as 0, and the result carries no label flag`, () => {
      expect(binary(op, num(2), labelZero())).toEqual(binary(op, num(2), num(0)));
      expect(binary("add", labelZero(), num(3))).toEqual(ok(num(3)));
    });

    it(`S01: an empty operand of ${op} reads as 0`, () => {
      expect(binary(op, num(2), empty())).toEqual(binary(op, num(2), num(0)));
    });
  }

  it("U01: a string operand of negate, plus or NOT is unverifiable", () => {
    expect(unary("neg", str("a"))).toMatchObject(U01);
    expect(unary("plus", str("a"))).toMatchObject(U01);
    expect(unary("not", str("a"))).toMatchObject(U01);
  });

  it("S01: negating a label gives 0 with no label flag", () => {
    expect(unary("neg", labelZero())).toEqual(ok(num(-0)));
    expect(unary("plus", labelZero())).toEqual(ok(num(0)));
  });

  it("U01: string concatenation is unverifiable, even of two numbers", () => {
    expect(binary("concat", str("a"), str("b"))).toMatchObject(U01);
    expect(binary("concat", num(1), num(2))).toMatchObject(U01);
  });

  for (const op of COMPARISONS) {
    it(`U01: a label, an empty cell or a string in ${op} is unverifiable`, () => {
      expect(binary(op, labelZero(), num(0))).toMatchObject(U01);
      expect(binary(op, num(0), labelZero())).toMatchObject(U01);
      expect(binary(op, empty(), num(0))).toMatchObject(U01);
      expect(binary(op, num(0), empty())).toMatchObject(U01);
      expect(binary(op, str("x"), str("x"))).toMatchObject(U01);
    });
  }

  it("S01: AND, OR and NOT read a label or an empty cell as 0", () => {
    expect(binary("and", labelZero(), num(1))).toEqual(ok(num(0)));
    expect(binary("or", empty(), num(1))).toEqual(ok(num(1)));
    expect(unary("not", empty())).toEqual(ok(num(1)));
  });
});

const ARITHMETIC = ["add", "sub", "mul", "div", "pow"] as const;
const U08 = { ok: false, u: { code: "undocumented-semantics", rule: "U08" } };

describe("ERR and NA propagation (S12, U08)", () => {
  for (const op of ARITHMETIC) {
    it(`S12: ERR or NA in either operand of ${op} gives that error`, () => {
      expect(binary(op, err(), num(2))).toEqual(ok(err()));
      expect(binary(op, num(2), err())).toEqual(ok(err()));
      expect(binary(op, na(), num(2))).toEqual(ok(na()));
      expect(binary(op, num(2), na())).toEqual(ok(na()));
    });

    it(`U08: ERR with NA in ${op} is unverifiable`, () => {
      expect(binary(op, err(), na())).toMatchObject(U08);
      expect(binary(op, na(), err())).toMatchObject(U08);
    });
  }

  it("S12: negate and plus pass ERR and NA through", () => {
    expect(unary("neg", err())).toEqual(ok(err()));
    expect(unary("plus", na())).toEqual(ok(na()));
  });

  it("S12: an operand error wins over the operation's own ERR: NA / 0 is NA", () => {
    expect(binary("div", na(), num(0))).toEqual(ok(na()));
    expect(binary("pow", na(), num(0))).toEqual(ok(na()));
  });

  it("S12: an operand error wins over U04: 0 ^ ERR is ERR", () => {
    expect(binary("pow", num(0), err())).toEqual(ok(err()));
  });

  it("S12: comparisons and logic propagate ERR and NA, U08 for both", () => {
    expect(binary("eq", err(), num(1))).toEqual(ok(err()));
    expect(binary("lt", num(1), na())).toEqual(ok(na()));
    expect(binary("and", err(), num(0))).toEqual(ok(err()));
    expect(binary("or", num(1), na())).toEqual(ok(na()));
    expect(unary("not", err())).toEqual(ok(err()));
    expect(binary("ge", err(), na())).toMatchObject(U08);
  });

  it("propagate: null when no value is an error, else the error, U08 for both kinds", () => {
    expect(propagate([num(1), num(2)])).toBeNull();
    expect(propagate([])).toBeNull();
    expect(propagate([num(1), err(), err()])).toEqual(ok(err()));
    expect(propagate([na(), num(1)])).toEqual(ok(na()));
    expect(propagate([err(), num(1), na()])).toMatchObject(U08);
  });
});
