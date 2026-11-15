// The test-only Excel re-parser. Expected trees are written by hand from Excel's grammar:
// unary minus and plus bind tightest, then ^, * /, + -, &, comparisons; all binary operators
// associate to the left.
import { describe, expect, it } from "vitest";
import type { Expr } from "../../../src/formula/ast.ts";
import { parseExcel } from "../helpers/excel-parse.ts";

const n = (value: number): Expr => ({ type: "number", value });
const ref = (col: number, row: number, colAbs = false, rowAbs = false): Expr => ({ type: "ref", ref: { col, row, colAbs, rowAbs } });
type Op = Extract<Expr, { type: "binary" }>["op"];
const bin = (op: Op, left: Expr, right: Expr): Expr => ({ type: "binary", op, left, right });
const ok = (text: string) => {
  const r = parseExcel(text);
  if (!r.ok) throw new Error(`${text}: ${r.error}`);
  return r.ast;
};

describe("parseExcel", () => {
  it("reads numbers, all as number nodes", () => {
    expect(ok("2")).toEqual(n(2));
    expect(ok("0.1")).toEqual(n(0.1));
    expect(ok("1E+100")).toEqual(n(1e100));
    expect(ok("1.5E-7")).toEqual(n(1.5e-7));
  });

  it("reads strings with doubled quotes", () => {
    expect(ok('""')).toEqual({ type: "string", value: "" });
    expect(ok('"say ""hi"""')).toEqual({ type: "string", value: 'say "hi"' });
  });

  it("reads refs with $ per axis and ranges", () => {
    expect(ok("A1")).toEqual(ref(0, 0));
    expect(ok("$A$1")).toEqual(ref(0, 0, true, true));
    expect(ok("$B3")).toEqual(ref(1, 2, true, false));
    expect(ok("AA$10")).toEqual(ref(26, 9, false, true));
    expect(ok("IV8192")).toEqual(ref(255, 8191));
    expect(ok("$A$1:B2")).toEqual({ type: "range", from: { col: 0, row: 0, colAbs: true, rowAbs: true }, to: { col: 1, row: 1, colAbs: false, rowAbs: false } });
  });

  it("applies precedence and left association", () => {
    expect(ok("1+2*3")).toEqual(bin("add", n(1), bin("mul", n(2), n(3))));
    expect(ok("1-2-3")).toEqual(bin("sub", bin("sub", n(1), n(2)), n(3)));
    expect(ok("2^3^2")).toEqual(bin("pow", bin("pow", n(2), n(3)), n(2)));
    expect(ok("A1&B1=C1")).toEqual(bin("eq", bin("concat", ref(0, 0), ref(1, 0)), ref(2, 0)));
    expect(ok("1<>2")).toEqual(bin("ne", n(1), n(2)));
    expect(ok("1<=2")).toEqual(bin("le", n(1), n(2)));
    expect(ok("1>=2")).toEqual(bin("ge", n(1), n(2)));
    expect(ok("1<2")).toEqual(bin("lt", n(1), n(2)));
    expect(ok("1>2")).toEqual(bin("gt", n(1), n(2)));
    expect(ok("1/2")).toEqual(bin("div", n(1), n(2)));
  });

  it("binds unary minus tighter than ^", () => {
    expect(ok("-2^2")).toEqual(bin("pow", { type: "unary", op: "neg", arg: n(2) }, n(2)));
    expect(ok("-(2^2)")).toEqual({ type: "unary", op: "neg", arg: { type: "paren", inner: bin("pow", n(2), n(2)) } });
    expect(ok("2--+1")).toEqual(bin("sub", n(2), { type: "unary", op: "neg", arg: { type: "unary", op: "plus", arg: n(1) } }));
  });

  it("returns paren nodes for parentheses", () => {
    expect(ok("(1+2)*3")).toEqual(bin("mul", { type: "paren", inner: bin("add", n(1), n(2)) }, n(3)));
  });

  it("reads nested calls and zero-argument calls", () => {
    expect(ok("TRUE()")).toEqual({ type: "call", name: "TRUE", args: [] });
    expect(ok('IF(A1=1,SUM(A1:B1,2),"x")')).toEqual({
      type: "call",
      name: "IF",
      args: [
        bin("eq", ref(0, 0), n(1)),
        { type: "call", name: "SUM", args: [{ type: "range", from: { col: 0, row: 0, colAbs: false, rowAbs: false }, to: { col: 1, row: 0, colAbs: false, rowAbs: false } }, n(2)] },
        { type: "string", value: "x" },
      ],
    });
  });

  it("rejects malformed text with an error result", () => {
    for (const bad of ["", "1+", "(1", "1)", '"abc', "A1:", "SUM(1,", "SUM(1,)", "1 + 2", "=1", "A0", "1..2", "*2", "IW1", "A8193"]) {
      const r = parseExcel(bad);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.error.length, bad).toBeGreaterThan(0);
    }
  });
});
