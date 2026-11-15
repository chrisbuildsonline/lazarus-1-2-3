// printExcel: Excel text for an Excel AST. Expected strings are written by hand from Excel's
// formula grammar, not copied from the printer.
import { describe, expect, it } from "vitest";
import type { Expr } from "../../../src/formula/ast.ts";
import { printExcel } from "../../../src/formula/print-excel.ts";

const num = (value: number): Expr => ({ type: "number", value });
const text = (e: Expr) => printExcel(e).text;

describe("literals", () => {
  it("prints numbers as the shortest text that reads back, with an upper-case E", () => {
    expect(text(num(0.1))).toBe("0.1");
    expect(text(num(2))).toBe("2");
    expect(text(num(1e100))).toBe("1E+100");
    expect(text(num(1.5e-7))).toBe("1.5E-7");
  });

  it("prints a negative constant with its sign and -0 as 0", () => {
    expect(text(num(-2.5))).toBe("-2.5");
    expect(text(num(-0))).toBe("0");
  });

  it("prints ints in decimal", () => {
    expect(text({ type: "int", value: 32767 })).toBe("32767");
    expect(text({ type: "int", value: -32768 })).toBe("-32768");
  });

  it("quotes strings and doubles each quote", () => {
    expect(text({ type: "string", value: "" })).toBe('""');
    expect(text({ type: "string", value: 'say "hi"' })).toBe('"say ""hi"""');
  });

  it("adds constant-precision for a constant with more than 15 significant digits", () => {
    // 0.1 + 0.2 is the double 0.30000000000000004: 17 significant digits.
    const r = printExcel(num(0.1 + 0.2));
    expect(r.text).toBe("0.30000000000000004");
    expect(r.diagnostics).toMatchObject([{ code: "constant-precision", severity: "info" }]);
  });

  it("does not flag 15 significant digits or trailing zeros of a large integer", () => {
    expect(printExcel(num(123456789012345)).diagnostics).toEqual([]);
    expect(printExcel(num(1e20)).diagnostics).toEqual([]);
    expect(printExcel(num(0.000123456789012345)).diagnostics).toEqual([]);
  });
});

const r = (col: number, row: number, colAbs = false, rowAbs = false) => ({ col, row, colAbs, rowAbs });

describe("references", () => {
  it("prints A1 text with $ per axis", () => {
    expect(text({ type: "ref", ref: r(0, 0) })).toBe("A1");
    expect(text({ type: "ref", ref: r(0, 0, true, true) })).toBe("$A$1");
    expect(text({ type: "ref", ref: r(0, 0, true, false) })).toBe("$A1");
    expect(text({ type: "ref", ref: r(0, 0, false, true) })).toBe("A$1");
  });

  it("prints the last cell of the grid as IV8192 and column 26 as AA", () => {
    expect(text({ type: "ref", ref: r(255, 8191) })).toBe("IV8192");
    expect(text({ type: "ref", ref: r(26, 9) })).toBe("AA10");
  });

  it("prints ranges corner to corner, each with its own flags", () => {
    expect(text({ type: "range", from: r(0, 0), to: r(1, 1) })).toBe("A1:B2");
    expect(text({ type: "range", from: r(0, 0, true, true), to: r(1, 1) })).toBe("$A$1:B2");
  });
});

const A: Expr = { type: "ref", ref: r(0, 0) };
const B: Expr = { type: "ref", ref: r(1, 0) };
const C: Expr = { type: "ref", ref: r(2, 0) };
const two: Expr = { type: "int", value: 2 };
type Op = Extract<Expr, { type: "binary" }>["op"];
const bin = (op: Op, left: Expr, right: Expr): Expr => ({ type: "binary", op, left, right });
const neg = (arg: Expr): Expr => ({ type: "unary", op: "neg", arg });

describe("precedence", () => {
  it("keeps Lotus -(2^2) as -(2^2): Excel reads -2^2 as (-2)^2", () => {
    expect(text(neg(bin("pow", two, two)))).toBe("-(2^2)");
  });

  it("prints (-2)^2 as -2^2", () => {
    expect(text(bin("pow", neg(two), two))).toBe("-2^2");
  });

  it("parenthesises a right child of equal precedence, not a left one", () => {
    expect(text(bin("sub", A, bin("sub", B, C)))).toBe("A1-(B1-C1)");
    expect(text(bin("sub", bin("sub", A, B), C))).toBe("A1-B1-C1");
    expect(text(bin("pow", A, bin("pow", B, C)))).toBe("A1^(B1^C1)");
    expect(text(bin("pow", bin("pow", A, B), C))).toBe("A1^B1^C1");
  });

  it("puts & above the comparisons", () => {
    expect(text(bin("eq", bin("concat", A, B), C))).toBe("A1&B1=C1");
    expect(text(bin("concat", bin("eq", A, B), C))).toBe("(A1=B1)&C1");
  });

  it("prints every operator symbol", () => {
    const ops: [Op, string][] = [
      ["add", "+"], ["sub", "-"], ["mul", "*"], ["div", "/"], ["pow", "^"], ["concat", "&"],
      ["eq", "="], ["ne", "<>"], ["lt", "<"], ["gt", ">"], ["le", "<="], ["ge", ">="],
    ];
    for (const [op, sym] of ops) expect(text(bin(op, A, B))).toBe(`A1${sym}B1`);
    expect(text({ type: "unary", op: "plus", arg: A })).toBe("+A1");
    expect(text(bin("mul", bin("add", A, B), C))).toBe("(A1+B1)*C1");
  });

  it("prints a paren node once, even where the structure needs parentheses", () => {
    expect(text(bin("mul", { type: "paren", inner: bin("add", A, B) }, C))).toBe("(A1+B1)*C1");
    expect(text({ type: "paren", inner: A })).toBe("(A1)");
  });
});

const chain = (n: number): Expr => {
  let e: Expr = two;
  for (let i = 0; i < n; i++) e = neg(e);
  return e;
};

describe("calls and depth", () => {
  it("prints calls as NAME(a,b) with no spaces, and NAME() with no arguments", () => {
    expect(text({ type: "call", name: "SUM", args: [A, { type: "range", from: r(0, 0), to: r(1, 1) }] })).toBe("SUM(A1,A1:B2)");
    expect(text({ type: "call", name: "TRUE", args: [] })).toBe("TRUE()");
    expect(text({ type: "call", name: "IF", args: [bin("eq", A, B), bin("add", A, B), { type: "string", value: "x" }] })).toBe('IF(A1=B1,A1+B1,"x")');
  });

  it("binds a call like an operand", () => {
    expect(text(bin("pow", { type: "call", name: "PI", args: [] }, two))).toBe("PI()^2");
    expect(text(neg({ type: "call", name: "PMT", args: [A, B, C] }))).toBe("-PMT(A1,B1,C1)");
  });

  it("prints 256 levels and stops at 257 with nesting-too-deep, without overflowing", () => {
    expect(text(chain(256))).toBe(`${"-".repeat(256)}2`);
    for (const n of [257, 100_000]) {
      const p = printExcel(chain(n));
      expect(p.text).toBeNull();
      expect(p.diagnostics).toMatchObject([{ code: "nesting-too-deep", severity: "error" }]);
    }
  });

  it("refuses the Lotus-only and, or and not nodes", () => {
    for (const e of [bin("and", A, B), bin("or", A, B), { type: "unary", op: "not", arg: A } as Expr]) {
      const p = printExcel(bin("add", A, e));
      expect(p.text).toBeNull();
      expect(p.diagnostics).toMatchObject([{ code: "no-excel-equivalent", severity: "error" }]);
    }
  });
});
