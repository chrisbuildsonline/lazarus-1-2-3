import { describe, expect, it } from "vitest";
import { MAX_DEPTH, OPCODES, type BinaryOp, type Expr } from "../../../src/formula/index.ts";
import { parseA1 } from "../../../src/parser/index.ts";
import { evaluate, FUNCTIONS, VOLATILE, type CellRead, type EvalContext } from "../../../src/verify/evaluate.ts";
import { err, labelZero, num, undocumented, type Outcome, type Value } from "../../../src/verify/value.ts";

const ok = (v: Value): Outcome<Value> => ({ ok: true, v });
const rule = (r: string) => ({ ok: false, u: { code: "undocumented-semantics", rule: r } });

const at = (address: string) => {
  const p = parseA1(address);
  if (!p) throw new Error(address);
  return p;
};

// AST builders, written the way the decoder builds them.
const n = (value: number): Expr => ({ type: "number", value });
const ref = (address: string): Expr => ({ type: "ref", ref: { ...at(address), colAbs: false, rowAbs: false } });
const bin = (op: BinaryOp, left: Expr, right: Expr): Expr => ({ type: "binary", op, left, right });
const plus = (arg: Expr): Expr => ({ type: "unary", op: "plus", arg });

/** A fake sheet: addresses to cell reads; everything else is empty. */
function ctx(cells: Record<string, CellRead>): EvalContext {
  const map = new Map(Object.entries(cells).map(([a, r]) => [`${at(a).col},${at(a).row}`, r]));
  const read = (col: number, row: number): CellRead => map.get(`${col},${row}`) ?? { t: "empty" };
  return {
    read,
    rangeItems: (from, to) =>
      [...map.entries()]
        .map(([k, r]) => {
          const [col = 0, row = 0] = k.split(",").map(Number);
          return { col, row, read: r };
        })
        .filter((c) => c.col >= from.col && c.col <= to.col && c.row >= from.row && c.row <= to.row)
        .sort((a, b) => a.row - b.row || a.col - b.col),
  };
}

const sheet = ctx({
  A1: { t: "number", v: 4 },
  A2: { t: "label" },
  A3: { t: "formula", o: ok(num(9)) },
  A4: { t: "formula", o: { ok: false, u: undocumented("U04", "0 raised to the power 0") } },
  A5: { t: "number", v: Number.NaN },
  A6: { t: "number", v: Infinity },
});

describe("evaluate: operands, references and operators", () => {
  it("number and int nodes are numbers", () => {
    expect(evaluate(n(2.5), sheet)).toStrictEqual(ok(num(2.5)));
    expect(evaluate({ type: "int", value: -7 }, sheet)).toStrictEqual(ok(num(-7)));
  });

  it("a paren node is its inner value", () => {
    expect(evaluate({ type: "paren", inner: bin("add", n(1), n(2)) }, sheet)).toStrictEqual(ok(num(3)));
  });

  it("a reference to a number cell is that number, an infinity is ERR (S27)", () => {
    expect(evaluate(ref("A1"), sheet)).toStrictEqual(ok(num(4)));
    expect(evaluate(bin("mul", ref("A1"), n(2)), sheet)).toStrictEqual(ok(num(8)));
    expect(evaluate(ref("A6"), sheet)).toStrictEqual(ok(err()));
  });

  it("S01: a label is 0 in arithmetic", () => {
    expect(evaluate(bin("add", ref("A2"), n(1)), sheet)).toStrictEqual(ok(num(1)));
  });

  it("S01: a single reference to an empty cell is 0", () => {
    expect(evaluate(bin("add", ref("B9"), n(2)), sheet)).toStrictEqual(ok(num(2)));
    expect(evaluate(ref("B9"), sheet)).toStrictEqual(ok(num(0)));
  });

  it("a reference to a formula cell is its outcome", () => {
    expect(evaluate(bin("add", ref("A3"), n(1)), sheet)).toStrictEqual(ok(num(10)));
  });

  it("a reference to an unverifiable formula is depends-on-unverifiable naming the address", () => {
    const r = evaluate(bin("add", ref("A4"), n(1)), sheet);
    expect(r).toMatchObject({ ok: false, u: { code: "depends-on-unverifiable" } });
    if (!r.ok) expect(r.u.message).toContain("A4");
  });

  it("U02: a bare label as the whole result keeps the label flag", () => {
    expect(evaluate(ref("A2"), sheet)).toStrictEqual(ok(labelZero()));
  });

  it("U02: an arithmetic operator clears the label flag", () => {
    expect(evaluate(plus(ref("A2")), sheet)).toStrictEqual(ok(num(0)));
  });

  it("U12: an input cell holding NaN is unverifiable", () => {
    expect(evaluate(bin("add", ref("A5"), n(1)), sheet)).toMatchObject(rule("U12"));
  });
});

const call = (name: string, ...args: Expr[]): Expr => ({ type: "call", name, args });

describe("evaluate: calls and static checks", () => {
  it("S15: IF evaluates only the chosen branch", () => {
    expect(evaluate(call("IF", n(1), n(5), bin("div", n(1), n(0))), sheet)).toStrictEqual(ok(num(5)));
    expect(evaluate(call("IF", n(0), bin("div", n(1), n(0)), n(7)), sheet)).toStrictEqual(ok(num(7)));
  });

  it("S16: CHOOSE evaluates only the chosen argument", () => {
    expect(evaluate(call("CHOOSE", n(1), call("ERR"), n(20), call("NA")), sheet)).toStrictEqual(ok(num(20)));
  });

  it("number, list and finance functions take their evaluated arguments", () => {
    expect(evaluate(call("ABS", n(-6.2)), sheet)).toStrictEqual(ok(num(6.2)));
    expect(evaluate(call("SUM", n(1), ref("A1"), ref("A2"), ref("B9")), sheet)).toStrictEqual(ok(num(5)));
    expect(evaluate(call("COUNT", ref("A4"), ref("B9")), sheet)).toStrictEqual(ok(num(2)));
    expect(evaluate(call("PMT", n(3000), n(1), n(2)), sheet)).toStrictEqual(ok(num(4000)));
  });

  it("S25: NOW or RAND anywhere is volatile-function, also inside an untaken IF branch", () => {
    expect(evaluate(bin("add", call("NOW"), n(1)), sheet)).toMatchObject({ ok: false, u: { code: "volatile-function", rule: "S25" } });
    expect(evaluate(call("IF", n(1), n(5), call("RAND")), sheet)).toMatchObject({ ok: false, u: { code: "volatile-function", rule: "S25" } });
  });

  it("an unknown function name is unsupported-function naming it", () => {
    const r = evaluate(call("IF", n(1), n(5), call("FOO", n(1))), sheet);
    expect(r).toMatchObject({ ok: false, u: { code: "unsupported-function" } });
    if (!r.ok) expect(r.u.message).toContain("@FOO");
  });

  const opcodeNames = OPCODES.flatMap((e) => (e.kind === "function" ? [e.name] : []));

  it("every function name in OPCODES has an engine implementation or is volatile", () => {
    for (const name of opcodeNames) expect(FUNCTIONS.has(name) || VOLATILE.has(name), name).toBe(true);
  });

  it("every function in the engine's table is in OPCODES", () => {
    for (const name of [...FUNCTIONS, ...VOLATILE]) expect(opcodeNames, name).toContain(name);
  });
});

const range = (from: string, to: string): Expr => ({
  type: "range",
  from: { ...at(from), colAbs: false, rowAbs: false },
  to: { ...at(to), colAbs: false, rowAbs: false },
});

describe("evaluate: ranges (U10)", () => {
  // Row-major A1, B1, A2, B2 sums to 1: (1e16 + 1) rounds to 1e16, minus 1e16 is 0, plus 1.
  // Column-major A1, A2, B1, B2 would give 2.
  const grid = ctx({
    A1: { t: "number", v: 1e16 },
    B1: { t: "number", v: 1 },
    A2: { t: "number", v: -1e16 },
    B2: { t: "number", v: 1 },
    D1: { t: "number", v: 400 },
    D2: { t: "number", v: 400 },
    E1: { t: "number", v: 1 },
    F1: { t: "number", v: 10 },
    E2: { t: "number", v: 2 },
    F2: { t: "number", v: 20 },
  });

  it("U10: a range is allowed in the six list functions", () => {
    expect(evaluate(call("SUM", range("A1", "B2")), grid)).toStrictEqual(ok(num(1)));
    expect(evaluate(call("COUNT", range("A1", "C3")), grid)).toStrictEqual(ok(num(4)));
    expect(evaluate(call("AVG", range("D1", "D3")), grid)).toStrictEqual(ok(num(400)));
    expect(evaluate(call("MIN", range("A1", "B2")), grid)).toStrictEqual(ok(num(-1e16)));
    expect(evaluate(call("MAX", range("A1", "B2")), grid)).toStrictEqual(ok(num(1e16)));
    expect(evaluate(call("STD", range("D1", "D2")), grid)).toStrictEqual(ok(num(0)));
  });

  it("U10: a range is allowed as the second argument of NPV, VLOOKUP and HLOOKUP", () => {
    // NPV(1, 400, 400) = 400 / 2 + 400 / 4 = 300.
    expect(evaluate(call("NPV", n(1), range("D1", "D2")), grid)).toStrictEqual(ok(num(300)));
    expect(evaluate(call("VLOOKUP", n(2), range("E1", "F2"), n(1)), grid)).toStrictEqual(ok(num(20)));
    expect(evaluate(call("HLOOKUP", n(10), range("E1", "F2"), n(1)), grid)).toStrictEqual(ok(num(20)));
  });

  it("U10: a range anywhere else is unverifiable", () => {
    expect(evaluate(bin("add", range("A1", "B2"), n(1)), grid)).toMatchObject(rule("U10"));
    expect(evaluate(call("IF", range("A1", "B2"), n(1), n(2)), grid)).toMatchObject(rule("U10"));
    expect(evaluate(call("ABS", range("A1", "B2")), grid)).toMatchObject(rule("U10"));
    expect(evaluate(call("NPV", range("D1", "D2"), range("D1", "D2")), grid)).toMatchObject(rule("U10"));
  });

  it("reversed corners give the same items, in row-major order", () => {
    expect(evaluate(call("SUM", range("B2", "A1")), grid)).toStrictEqual(ok(num(1)));
    expect(evaluate(call("SUM", range("B1", "A2")), grid)).toStrictEqual(ok(num(1)));
    expect(evaluate(call("VLOOKUP", n(2), range("F2", "E1"), n(1)), grid)).toStrictEqual(ok(num(20)));
    expect(evaluate(call("HLOOKUP", n(10), range("F1", "E2"), n(1)), grid)).toStrictEqual(ok(num(20)));
  });

  it("a list range over a sparse sheet reads only the cells that exist", () => {
    let reads = 0;
    const corners: unknown[] = [];
    const counting: EvalContext = {
      read: (col, row) => {
        reads++;
        return grid.read(col, row);
      },
      rangeItems: (from, to) => {
        corners.push({ from, to });
        return grid.rangeItems(from, to);
      },
    };
    expect(evaluate(call("COUNT", range("IV8192", "A1")), counting)).toStrictEqual(ok(num(10)));
    expect(reads).toBe(0);
    expect(corners).toEqual([{ from: { col: 0, row: 0 }, to: { col: 255, row: 8191 } }]);
  });
});

describe("evaluate: depth guard and string results", () => {
  const nest = (depth: number): Expr => {
    let e: Expr = n(1);
    for (let i = 0; i < depth; i++) e = { type: "unary", op: "neg", arg: e };
    return e;
  };

  it("an AST of MAX_DEPTH levels evaluates", () => {
    expect(evaluate(nest(MAX_DEPTH), sheet)).toStrictEqual(ok(num(1)));
  });

  it("a hand-built AST deeper than MAX_DEPTH is decode-error, not a stack overflow", () => {
    expect(evaluate(nest(MAX_DEPTH + 1), sheet)).toMatchObject({ ok: false, u: { code: "decode-error" } });
    expect(evaluate(nest(200_000), sheet)).toMatchObject({ ok: false, u: { code: "decode-error" } });
  });

  it("a string constant as the whole result is a string value (string-result after classify)", () => {
    expect(evaluate({ type: "string", value: "Odd" }, sheet)).toStrictEqual(ok({ t: "str", v: "Odd" }));
  });
});
