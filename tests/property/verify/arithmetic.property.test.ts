// Arithmetic and logic invariants of the operators (design.md "Property tests"; S12 to S15,
// requirements 42 to 46). Concatenation is left out: it is always U01, before any propagation.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { BinaryOp, UnaryOp } from "../../../src/formula/index.ts";
import { ifValue } from "../../../src/verify/lookup.ts";
import { binary, unary } from "../../../src/verify/ops.ts";
import { err, na, num, type Outcome, type Value } from "../../../src/verify/value.ts";

const finite = fc.double({ noNaN: true, noDefaultInfinity: true });
const nonzero = finite.filter((x) => x !== 0);
const BINARY: Exclude<BinaryOp, "concat">[] = ["add", "sub", "mul", "div", "pow", "eq", "ne", "lt", "gt", "le", "ge", "and", "or"];
const UNARY: UnaryOp[] = ["neg", "plus", "not"];
const COMPARE: BinaryOp[] = ["eq", "ne", "lt", "gt", "le", "ge", "and", "or"];

/** The number of an ok `num` outcome, else NaN (which equals nothing). */
const numOf = (o: Outcome<Value>) => (o.ok && o.v.t === "num" ? o.v.v : NaN);
const ERR = { ok: true, v: err() };
const NA = { ok: true, v: na() };

describe("operator invariants (S12 to S15)", () => {
  it("S13: a + b equals b + a, a * b equals b * a, bit for bit", () => {
    fc.assert(
      fc.property(finite, finite, (a, b) => {
        expect(binary("add", num(a), num(b))).toEqual(binary("add", num(b), num(a)));
        expect(binary("mul", num(a), num(b))).toEqual(binary("mul", num(b), num(a)));
      }),
    );
  });

  it("S13: x + 0, x * 1, --x and +x are x; x - x is 0", () => {
    fc.assert(
      fc.property(finite, (x) => {
        expect(numOf(binary("add", num(x), num(0))) === x).toBe(true);
        expect(numOf(binary("mul", num(x), num(1))) === x).toBe(true);
        const neg = unary("neg", num(x));
        expect(neg.ok && numOf(unary("neg", (neg as { v: Value }).v)) === x).toBe(true);
        expect(numOf(unary("plus", num(x))) === x).toBe(true);
        expect(numOf(binary("sub", num(x), num(x)))).toBe(0);
      }),
    );
  });

  it("S13: division by zero is always ERR", () => {
    fc.assert(
      fc.property(finite, fc.constantFrom(0, -0), (x, zero) => {
        expect(binary("div", num(x), num(zero))).toEqual(ERR);
      }),
    );
  });

  it("S12: ERR or NA in either operand of every operator gives that error", () => {
    fc.assert(
      fc.property(fc.constantFrom(...BINARY), finite, fc.boolean(), (op, x, left) => {
        for (const [bad, want] of [[err(), ERR], [na(), NA]] as const) {
          expect(left ? binary(op, bad, num(x)) : binary(op, num(x), bad), op).toEqual(want);
        }
      }),
    );
    for (const op of UNARY) {
      expect(unary(op, err()), op).toEqual(ERR);
      expect(unary(op, na()), op).toEqual(NA);
    }
  });

  it("S12: an operand error wins over the operation's own ERR (NA / 0 is NA)", () => {
    expect(binary("div", na(), num(0))).toEqual(NA);
  });

  it("S14: comparisons and AND/OR give 0 or 1", () => {
    fc.assert(
      fc.property(fc.constantFrom(...COMPARE), finite, finite, (op, a, b) => {
        expect([0, 1], op).toContain(numOf(binary(op, num(a), num(b))));
      }),
    );
  });

  it("S14: NOT(NOT(x)) is 1 for nonzero x and 0 for 0", () => {
    const twice = (x: number) => {
      const once = unary("not", num(x));
      return once.ok ? numOf(unary("not", once.v)) : NaN;
    };
    fc.assert(
      fc.property(nonzero, (x) => {
        expect(twice(x)).toBe(1);
      }),
    );
    expect(twice(0)).toBe(0);
  });

  it("S15: IF(c, a, b) is a when c is nonzero, else b", () => {
    fc.assert(
      fc.property(finite, finite, finite, (c, a, b) => {
        const got = ifValue(num(c), () => ({ ok: true, v: num(a) }), () => ({ ok: true, v: num(b) }));
        expect(got).toEqual({ ok: true, v: num(c !== 0 ? a : b) });
      }),
    );
  });
});
