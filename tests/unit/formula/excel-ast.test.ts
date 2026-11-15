// toExcelAst: the Lotus AST to the Excel AST (requirements 24 to 31). Expected trees are
// written by hand from the requirements.
import { describe, expect, it } from "vitest";
import type { Expr } from "../../../src/formula/ast.ts";
import { toExcelAst } from "../../../src/formula/excel-ast.ts";
import { printExcel } from "../../../src/formula/print-excel.ts";

const ref = (col: number, row = 0): Expr => ({ type: "ref", ref: { col, row, colAbs: false, rowAbs: false } });
const A = ref(0);
const B = ref(1);
const C = ref(2);
const call = (name: string, ...args: Expr[]): Expr => ({ type: "call", name, args });

describe("renames", () => {
  it("renames AVG to AVERAGE, COUNT to COUNTA, INT to TRUNC", () => {
    expect(toExcelAst(call("AVG", A, B)).ast).toEqual(call("AVERAGE", A, B));
    expect(toExcelAst(call("COUNT", A)).ast).toEqual(call("COUNTA", A));
    expect(toExcelAst(call("INT", A)).ast).toEqual(call("TRUNC", A));
  });

  it("keeps the other names and argument order", () => {
    for (const [name, n] of [["SUM", 2], ["MIN", 2], ["MAX", 3], ["ABS", 1], ["SQRT", 1], ["IF", 3], ["ROUND", 2], ["DATE", 3], ["NPV", 2], ["MOD", 2]] as const) {
      const args = [A, B, C].slice(0, n);
      expect(toExcelAst(call(name, ...args)).ast, name).toEqual(call(name, ...args));
    }
  });

  it("renames STD to STDEVP: gnome647171-1.wks C2 caches 0.75 for @STD(10, 11.5), the population deviation", () => {
    // Population: mean 10.75, deviations 0.75 each, sqrt((0.5625 + 0.5625) / 2) = 0.75.
    // The sample deviation would be sqrt(1.125 / 1) = 1.06.
    expect(toExcelAst(call("STD", A, B)).ast).toEqual(call("STDEVP", A, B));
  });

  it("maps arguments inside operators and nested calls", () => {
    expect(toExcelAst({ type: "binary", op: "add", left: call("AVG", A), right: { type: "paren", inner: call("INT", B) } }).ast).toEqual({
      type: "binary",
      op: "add",
      left: call("AVERAGE", A),
      right: { type: "paren", inner: call("TRUNC", B) },
    });
  });
});

const neg = (arg: Expr): Expr => ({ type: "unary", op: "neg", arg });
const excelText = (e: Expr) => {
  const x = toExcelAst(e).ast;
  return x && printExcel(x).text;
};

describe("financial functions", () => {
  it("@PMT(principal, rate, term) becomes -PMT(rate, term, principal)", () => {
    expect(toExcelAst(call("PMT", A, B, C)).ast).toEqual(neg(call("PMT", B, C, A)));
    expect(excelText(call("PMT", A, B, C))).toBe("-PMT(B1,C1,A1)");
  });

  it("@PV(payment, rate, term) becomes -PV(rate, term, payment)", () => {
    expect(toExcelAst(call("PV", A, B, C)).ast).toEqual(neg(call("PV", B, C, A)));
    expect(excelText(call("PV", A, B, C))).toBe("-PV(B1,C1,A1)");
  });

  it("@FV(payment, rate, term) becomes -FV(rate, term, payment)", () => {
    expect(toExcelAst(call("FV", A, B, C)).ast).toEqual(neg(call("FV", B, C, A)));
    expect(excelText(call("FV", A, B, C))).toBe("-FV(B1,C1,A1)");
  });

  it("keeps the sign flip bound to the call inside an expression", () => {
    // Excel applies unary minus before ^, so (-PMT())^2 needs no parentheses; - binds looser than *.
    const two: Expr = { type: "int", value: 2 };
    expect(excelText({ type: "binary", op: "pow", left: call("PMT", A, B, C), right: two })).toBe("-PMT(B1,C1,A1)^2");
    expect(excelText({ type: "binary", op: "sub", left: two, right: call("PV", A, B, C) })).toBe("2--PV(B1,C1,A1)");
  });
});

const int = (value: number): Expr => ({ type: "int", value });
const plus1 = (e: Expr): Expr => ({ type: "binary", op: "add", left: e, right: int(1) });
const range: Expr = { type: "range", from: { col: 0, row: 0, colAbs: false, rowAbs: false }, to: { col: 1, row: 2, colAbs: false, rowAbs: false } };

describe("zero-based offsets", () => {
  it("@CHOOSE(i, a, b) becomes CHOOSE(i+1, a, b) without folding a constant index", () => {
    expect(toExcelAst(call("CHOOSE", A, B, C)).ast).toEqual(call("CHOOSE", plus1(A), B, C));
    expect(toExcelAst(call("CHOOSE", int(0), B, C)).ast).toEqual(call("CHOOSE", plus1(int(0)), B, C));
    expect(excelText(call("CHOOSE", int(0), B, C))).toBe("CHOOSE(0+1,B1,C1)");
  });

  it("@VLOOKUP and @HLOOKUP add 1 to the offset and a sorted-match TRUE()", () => {
    for (const name of ["VLOOKUP", "HLOOKUP"]) {
      expect(toExcelAst(call(name, A, range, int(1))).ast).toEqual(call(name, A, range, plus1(int(1)), call("TRUE")));
      expect(excelText(call(name, A, range, C))).toBe(`${name}(A1,A1:B3,C1+1,TRUE())`);
    }
  });
});

/** True when no Lotus-only operator node is left anywhere in the tree. */
function lotusFree(e: Expr): boolean {
  switch (e.type) {
    case "unary":
      return e.op !== "not" && lotusFree(e.arg);
    case "binary":
      return e.op !== "and" && e.op !== "or" && lotusFree(e.left) && lotusFree(e.right);
    case "paren":
      return lotusFree(e.inner);
    case "call":
      return e.args.every(lotusFree);
    default:
      return true;
  }
}

const and = (left: Expr, right: Expr): Expr => ({ type: "binary", op: "and", left, right });
const or = (left: Expr, right: Expr): Expr => ({ type: "binary", op: "or", left, right });
const not = (arg: Expr): Expr => ({ type: "unary", op: "not", arg });
const errors = (e: Expr) => toExcelAst(e).diagnostics.filter((d) => d.severity === "error");

describe("operators, constants and refusals", () => {
  it("turns AND, OR and NOT operators into calls, leaving none in the tree", () => {
    expect(toExcelAst(and(A, B)).ast).toEqual(call("AND", A, B));
    expect(toExcelAst(or(A, B)).ast).toEqual(call("OR", A, B));
    expect(toExcelAst(not(A)).ast).toEqual(call("NOT", A));
    const nested = not(or(and(A, B), { type: "paren", inner: not(C) }));
    const out = toExcelAst(nested).ast!;
    expect(out).toEqual(call("NOT", call("OR", call("AND", A, B), { type: "paren", inner: call("NOT", C) })));
    expect(lotusFree(nested)).toBe(false);
    expect(lotusFree(out)).toBe(true);
    expect(printExcel(out).text).toBe("NOT(OR(AND(A1,B1),(NOT(C1))))");
  });

  it("makes NA, TRUE, FALSE, PI, NOW and RAND zero-argument calls", () => {
    for (const name of ["NA", "TRUE", "FALSE", "PI", "NOW", "RAND"]) {
      expect(toExcelAst(call(name)).ast).toEqual(call(name));
      expect(excelText(call(name))).toBe(`${name}()`);
    }
  });

  it("refuses ERR with no-excel-equivalent and no tree", () => {
    const r = toExcelAst({ type: "binary", op: "add", left: A, right: call("ERR") });
    expect(r.ast).toBeNull();
    expect(r.diagnostics).toMatchObject([{ code: "no-excel-equivalent", severity: "error" }]);
    expect(r.diagnostics[0]!.message).toContain("ERR");
  });

  it("refuses a call with the wrong argument count without reading past its arguments", () => {
    for (const e of [call("PMT", A, B), call("VLOOKUP", A, B), call("IF", A), call("ABS"), call("CHOOSE"), call("SUM"), call("PI", A)]) {
      const r = toExcelAst(e);
      expect(r.ast, JSON.stringify(e)).toBeNull();
      expect(errors(e), JSON.stringify(e)).toMatchObject([{ code: "no-excel-equivalent" }]);
    }
  });

  it("refuses a function the table does not know", () => {
    expect(errors(call("LN", A))).toMatchObject([{ code: "no-excel-equivalent" }]);
  });

  it("keeps a single error when the same refusal appears twice", () => {
    expect(errors({ type: "binary", op: "add", left: call("ERR"), right: call("ERR") })).toHaveLength(1);
  });

  it("stops a hand-built tree deeper than 256 with nesting-too-deep instead of overflowing", () => {
    let deep: Expr = A;
    for (let i = 0; i < 100_000; i++) deep = neg(deep);
    const r = toExcelAst(deep);
    expect(r.ast).toBeNull();
    expect(r.diagnostics).toMatchObject([{ code: "nesting-too-deep", severity: "error" }]);
  });
});

const notes = (e: Expr) => toExcelAst(e).diagnostics.filter((d) => d.code === "semantics-note");

describe("semantics notes", () => {
  const always: [string, Expr[]][] = [
    ["INT", [A]], ["COUNT", [A]], ["MOD", [A, B]], ["PMT", [A, B, C]], ["PV", [A, B, C]], ["FV", [A, B, C]],
    ["CHOOSE", [A, B]], ["VLOOKUP", [A, range, C]], ["HLOOKUP", [A, range, C]],
  ];
  for (const [name, args] of always) {
    it(`notes ${name}, naming it, as info`, () => {
      const n = notes(call(name, ...args));
      expect(n).toMatchObject([{ severity: "info" }]);
      expect(n[0]!.message).toContain(name);
    });
  }

  for (const name of ["SUM", "AVG", "MIN", "MAX", "STD"]) {
    it(`notes ${name} only when an argument is a range`, () => {
      expect(notes(call(name, A, B))).toEqual([]);
      const n = notes(call(name, A, range));
      expect(n).toMatchObject([{ severity: "info" }]);
      expect(n[0]!.message).toContain(name);
    });
  }

  it("adds no note for IF, ROUND, ABS, SQRT, DATE, NPV or an operator", () => {
    for (const e of [call("IF", A, B, C), call("ROUND", A, B), call("ABS", A), call("SQRT", A), call("DATE", A, B, C), call("NPV", A, range), and(A, B)]) {
      expect(toExcelAst(e).diagnostics, JSON.stringify(e)).toEqual([]);
    }
  });

  it("gives the notes the offset it is told: the end of the rpn", () => {
    expect(toExcelAst(call("INT", A), 7).diagnostics).toMatchObject([{ offset: 7 }]);
  });
});
