// The engine against the independent oracle (tests/unit/helpers/rpn-eval.ts) on random formulas
// with integer inputs over the opcodes the oracle supports: add, multiply, SUM, ABS, INT, ROUND,
// and IF with a literal condition (acceptance 4). Each formula is written to a WK1 file with the
// oracle's value as the cached double, then verified from the bytes. ROUND halfway cases are U03
// in the engine (the oracle rounds them up), so those cells are checked for U03 and not compared.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { writeWk1, type CellSpec } from "../../../scripts/lib/wk1-writer.ts";
import type { Expr } from "../../../src/formula/index.ts";
import { verifyBytes } from "../../../src/verify/index.ts";
import { call, ref } from "../../unit/helpers/build-sheet.ts";
import { evalRpn } from "../../unit/helpers/rpn-eval.ts";
import { encodeRpn } from "../../unit/helpers/rpn-encode.ts";

const INPUTS = ["A1", "B1", "C1", "D1"];
const int = (value: number): Expr => ({ type: "int", value });
const small = fc.integer({ min: -20, max: 20 });

const { expr } = fc.letrec<{ expr: Expr; leaf: Expr }>((tie) => ({
  leaf: fc.oneof(small.map(int), fc.constantFrom(...INPUTS).map(ref)),
  expr: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    tie("leaf"),
    fc.tuple(tie("expr"), tie("expr")).map(([l, r]): Expr => ({ type: "binary", op: "add", left: l, right: r })),
    fc.tuple(tie("expr"), tie("expr")).map(([l, r]): Expr => ({ type: "binary", op: "mul", left: l, right: r })),
    fc.array(tie("expr"), { minLength: 1, maxLength: 3 }).map((args) => call("SUM", ...args)),
    tie("expr").map((a) => call("ABS", a)),
    tie("expr").map((a) => call("INT", a)),
    fc.tuple(tie("expr"), fc.integer({ min: -3, max: 3 })).map(([a, n]) => call("ROUND", a, int(n))),
    fc.tuple(fc.constantFrom(0, 1, -2, 7), tie("expr"), tie("expr")).map(([c, a, b]) => call("IF", int(c), a, b)),
  ),
}));

describe("engine against the rpn-eval oracle on random integer formulas", () => {
  it("agrees exactly", () => {
    fc.assert(
      fc.property(fc.array(small, { minLength: 4, maxLength: 4 }), expr, (inputs, f) => {
        const rpn = encodeRpn(f, { col: 0, row: 2 });
        const valueAt = (col: number, row: number) => (row === 0 ? inputs[col]! : NaN);
        const oracle = evalRpn(rpn, 0, 2, valueAt);
        const cells: CellSpec[] = [...inputs.map((value, col): CellSpec => ({ kind: "integer", col, row: 0, value })), { kind: "formula", col: 0, row: 2, cached: oracle, rpn: [...rpn] }];
        const [cell] = verifyBytes(writeWk1(0x0406, cells)).verification.cells;
        if (cell?.reason.rule === "U03") return;
        // === on purpose: -0 and 0 are one value (requirement 27). Math.round(-0.1) in the oracle
        // gives -0 where the engine's ROUND(-1, -1) gives 0 (hand check: -0.1 rounds to 0).
        expect(cell?.recalculated?.t, `${cell?.formula}`).toBe("num");
        expect((cell?.recalculated as { v: number }).v === oracle, `${cell?.formula}: engine ${JSON.stringify(cell?.recalculated)}, oracle ${oracle}`).toBe(true);
        expect(cell?.reason.code, `${cell?.formula}`).toBe("exact");
      }),
      { numRuns: 300 },
    );
  });
});
