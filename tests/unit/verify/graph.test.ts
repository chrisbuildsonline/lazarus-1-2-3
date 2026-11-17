import { describe, expect, it } from "vitest";
import type { Expr } from "../../../src/formula/index.ts";
import { cellKey, parseA1 } from "../../../src/parser/index.ts";
import { buildGraph, enumerateRange, filterRange, naturalOrder, precedents, type Precedents } from "../../../src/verify/graph.ts";

const at = (address: string) => {
  const p = parseA1(address);
  if (!p) throw new Error(address);
  return p;
};
const n = (value: number): Expr => ({ type: "number", value });
const ref = (address: string): Expr => ({ type: "ref", ref: { ...at(address), colAbs: false, rowAbs: true } });
const range = (from: string, to: string): Expr => ({
  type: "range",
  from: { ...at(from), colAbs: true, rowAbs: false },
  to: { ...at(to), colAbs: false, rowAbs: false },
});
const call = (name: string, ...args: Expr[]): Expr => ({ type: "call", name, args });
const add = (left: Expr, right: Expr): Expr => ({ type: "binary", op: "add", left, right });

describe("precedents (requirement 30)", () => {
  it("lists references and ranges, refs in row-major order", () => {
    expect(precedents(add(ref("B2"), call("SUM", range("A1", "C3"), ref("A1"))))).toEqual({
      refs: [at("A1"), at("B2")],
      ranges: [{ from: at("A1"), to: at("C3") }],
    });
  });

  it("takes references from both branches of IF, untaken or not", () => {
    expect(precedents(call("IF", ref("A1"), ref("B1"), { type: "paren", inner: ref("C1") })).refs).toEqual([at("A1"), at("B1"), at("C1")]);
  });

  it("takes references from every CHOOSE argument", () => {
    expect(precedents(call("CHOOSE", n(0), ref("A2"), { type: "unary", op: "neg", arg: ref("A1") })).refs).toEqual([at("A1"), at("A2")]);
  });

  it("removes duplicates", () => {
    const p = precedents(add(add(ref("A1"), ref("A1")), call("SUM", range("A1", "B2"), range("B2", "A1"))));
    expect(p.refs).toEqual([at("A1")]);
    expect(p.ranges).toEqual([{ from: at("A1"), to: at("B2") }]);
  });

  it("normalises corners to min and max", () => {
    expect(precedents(call("SUM", range("B1", "A3"))).ranges).toEqual([{ from: at("A1"), to: at("B3") }]);
  });

  it("an AST with no references has none", () => {
    expect(precedents(add(n(1), n(2)))).toEqual({ refs: [], ranges: [] });
  });

  it("orders by cellKey, row first", () => {
    const keys = precedents(add(ref("B1"), ref("A2"))).refs.map((r) => cellKey(r.col, r.row));
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
  });
});

const key = (address: string) => cellKey(at(address).col, at(address).row);
const deps = (...es: Expr[]): Precedents => precedents(call("SUM", ...es));

/** Counts membership tests, the graph builder's cell reads. */
class CountingMap<V> extends Map<number, V> {
  reads = 0;
  override has(k: number): boolean {
    this.reads++;
    return super.has(k);
  }
}

describe("graph build (requirement 32)", () => {
  it("has edges only to formula cells", () => {
    // A1 is a value cell (no entry); A2 and A3 are formulas.
    const g = buildGraph(new Map([
      [key("A2"), deps(n(1))],
      [key("A3"), deps(ref("A1"), ref("A2"))],
    ]));
    expect(g.get(key("A3"))).toEqual([key("A2")]);
    expect(g.get(key("A2"))).toEqual([]);
  });

  it("a range reaches the two formula cells in it, not its value cells", () => {
    const formulas = new Map([
      [key("A5"), deps(n(1))],
      [key("A50"), deps(n(2))],
      [key("B10"), deps(range("A1", "A100"), ref("A50"))],
    ]);
    expect(buildGraph(formulas).get(key("B10"))).toEqual([key("A5"), key("A50")]);
  });

  it("a range over the full grid on a 20-cell sheet reads few cells", () => {
    const formulas = new CountingMap<Precedents>();
    for (let i = 0; i < 20; i++) formulas.set(cellKey(i % 4, i), deps(n(i)));
    formulas.set(cellKey(0, 0), deps(range("A1", "IV8192")));
    const g = buildGraph(formulas);
    expect(g.get(cellKey(0, 0))).toEqual([...formulas.keys()].sort((a, b) => a - b));
    expect(formulas.reads).toBeLessThan(100);
  });

  it("enumeration and filtering give the same edges", () => {
    const keys = ["A1", "C1", "B2", "D2", "A3", "C4", "IV8192"].map(key).sort((a, b) => a - b);
    const set = new Set(keys);
    const rects = [
      { from: at("A1"), to: at("D4") },
      { from: at("B1"), to: at("C3") },
      { from: at("C4"), to: at("C4") },
      { from: at("E1"), to: at("F9") },
      { from: at("A2"), to: at("IV8192") },
    ];
    for (const r of rects) {
      const viaEnumeration = enumerateRange(r, (k) => set.has(k));
      expect(viaEnumeration, JSON.stringify(r)).toEqual(filterRange(r, keys));
    }
    expect(filterRange(rects[0]!, keys)).toEqual(["A1", "C1", "B2", "D2", "A3", "C4"].map(key));
  });
});

/** A graph from edge lists by address: each formula to the formulas it reads. */
const graphOf = (edges: Record<string, string[]>) =>
  new Map(Object.entries(edges).map(([a, to]) => [key(a), to.map(key).sort((x, y) => x - y)]));

/** A fixed shuffle (seeded linear congruential generator), so the 20 orders are the same every run. */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const flat = (g: Map<number, number[]>) => naturalOrder(g).flatMap((c) => c.members);

function expectNaturalOrder(g: Map<number, number[]>) {
  const order = flat(g);
  expect([...order].sort((a, b) => a - b)).toEqual([...g.keys()].sort((a, b) => a - b));
  const position = new Map(order.map((k, i) => [k, i]));
  for (const [k, edges] of g) for (const p of edges) expect(position.get(p)!, `${k} after ${p}`).toBeLessThan(position.get(k)!);
}

describe("natural order (S26)", () => {
  const chain = graphOf({ A4: ["A3"], A1: [], A3: ["A2"], A2: ["A1"] });
  const diamond = graphOf({ D1: ["B1", "C1"], B1: ["A1"], C1: ["A1"], A1: [] });
  const fanIn = graphOf({ Z9: ["A1", "B2", "C3", "D4", "E5", "F6"], A1: [], B2: [], C3: ["A1"], D4: [], E5: ["D4"], F6: [] });

  it("S26: every formula comes after its precedents on a chain, a diamond and a wide fan-in", () => {
    for (const g of [chain, diamond, fanIn]) expectNaturalOrder(g);
  });

  it("S26: no component is a cycle in an acyclic graph", () => {
    for (const g of [chain, diamond, fanIn]) expect(naturalOrder(g).every((c) => !c.cycle && c.members.length === 1)).toBe(true);
  });

  it("S26: the order is the same for 20 shuffles of the insertion order", () => {
    for (const g of [chain, diamond, fanIn]) {
      const expected = naturalOrder(g);
      for (let seed = 1; seed <= 20; seed++) {
        const again = new Map(shuffled([...g.entries()], seed));
        expect(naturalOrder(again), `seed ${seed}`).toEqual(expected);
      }
    }
  });
});

describe("cycles (S26, requirement 33)", () => {
  const cycles = (g: Map<number, number[]>) => naturalOrder(g).filter((c) => c.cycle).map((c) => c.members);

  it("S26: a cell that refers to itself is a cycle", () => {
    expect(cycles(graphOf({ A1: ["A1"], B1: ["A1"] }))).toEqual([[key("A1")]]);
  });

  it("S26: two cells that refer to each other are one cycle", () => {
    expect(cycles(graphOf({ A1: ["B1"], B1: ["A1"] }))).toEqual([[key("A1"), key("B1")]]);
  });

  it("S26: a three-cell cycle with a fourth cell downstream", () => {
    const g = graphOf({ A1: ["A2"], A2: ["A3"], A3: ["A1"], B1: ["A3"] });
    const order = naturalOrder(g);
    expect(order).toEqual([
      { members: ["A1", "A2", "A3"].map(key), cycle: true },
      { members: [key("B1")], cycle: false },
    ]);
  });

  it("S26: a cycle through the untaken branch of IF is still a cycle (requirement 30)", () => {
    const formulas = new Map([
      [key("A1"), precedents(call("IF", n(1), n(5), ref("B1")))],
      [key("B1"), precedents(add(ref("A1"), n(1)))],
    ]);
    expect(cycles(buildGraph(formulas))).toEqual([[key("A1"), key("B1")]]);
  });
});
