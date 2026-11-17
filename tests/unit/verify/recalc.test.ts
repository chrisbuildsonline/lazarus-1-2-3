import { describe, expect, it } from "vitest";
import { cellKey, type Cell } from "../../../src/parser/index.ts";
import { recalcSheet } from "../../../src/verify/recalc.ts";
import { num, type Outcome, type Value } from "../../../src/verify/value.ts";
import { at, bin, buildSheet, call, formulaCell, n, range, ref, sheetOf } from "../helpers/build-sheet.ts";

const ok = (v: Value): Outcome<Value> => ({ ok: true, v });
const outcomeAt = (m: ReturnType<typeof recalcSheet>, address: string) => m.get(cellKey(at(address).col, at(address).row))?.outcome;

describe("recalcSheet (S26)", () => {
  it("S26: values flow along a chain, whatever the insertion order", () => {
    // A1 = 2, A2 = A1 * 3 = 6, A3 = A2 + 1 = 7.
    const sheet = buildSheet({ A3: bin("add", ref("A2"), n(1)), A2: bin("mul", ref("A1"), n(3)), A1: 2 });
    const m = recalcSheet(sheet);
    expect(outcomeAt(m, "A2")).toStrictEqual(ok(num(6)));
    expect(outcomeAt(m, "A3")).toStrictEqual(ok(num(7)));
    expect(m.has(cellKey(0, 0))).toBe(false);
  });

  it("S26: a cycle gives circular-reference to every member, naming the cells", () => {
    const m = recalcSheet(buildSheet({ A1: ref("B1"), B1: bin("add", ref("A1"), n(1)) }));
    for (const a of ["A1", "B1"]) {
      const o = outcomeAt(m, a);
      expect(o).toMatchObject({ ok: false, u: { code: "circular-reference", rule: "S26" } });
      if (o && !o.ok) expect(o.u.message).toContain("A1, B1");
    }
  });

  it("S26: a cycle message names the first 8 cells and a count", () => {
    const specs: Record<string, ReturnType<typeof ref>> = {};
    for (let i = 1; i <= 10; i++) specs[`A${i}`] = ref(`A${(i % 10) + 1}`);
    const o = outcomeAt(recalcSheet(buildSheet(specs)), "A5");
    expect(o).toMatchObject({ ok: false, u: { code: "circular-reference" } });
    if (o && !o.ok) expect(o.u.message).toContain("A1, A2, A3, A4, A5, A6, A7, A8 and 2 more");
  });

  it("a cell downstream of a cycle is depends-on-unverifiable naming the precedent", () => {
    const o = outcomeAt(recalcSheet(buildSheet({ A1: ref("A1"), C1: bin("add", ref("A1"), n(1)) })), "C1");
    expect(o).toMatchObject({ ok: false, u: { code: "depends-on-unverifiable" } });
    if (o && !o.ok) expect(o.u.message).toContain("A1");
  });

  it("S04: COUNT over a range that holds an unverifiable formula still works", () => {
    const m = recalcSheet(buildSheet({ A1: ref("A1"), B1: 5, D1: call("COUNT", range("A1", "C1")) }));
    expect(outcomeAt(m, "D1")).toStrictEqual(ok(num(2)));
  });

  it("S15: an IF that avoids the unverifiable branch still works", () => {
    const m = recalcSheet(buildSheet({ A1: ref("A1"), E1: call("IF", n(1), n(5), ref("A1")) }));
    expect(outcomeAt(m, "E1")).toStrictEqual(ok(num(5)));
  });

  it("U02: a dependent of a bare label result is depends-on-unverifiable", () => {
    const m = recalcSheet(buildSheet({ A1: "text", B1: ref("A1"), C1: bin("add", ref("B1"), n(1)) }));
    expect(outcomeAt(m, "C1")).toMatchObject({ ok: false, u: { code: "depends-on-unverifiable" } });
  });

  it("does not mutate the input sheet", () => {
    const sheet = buildSheet({ A1: 2, A2: bin("mul", ref("A1"), n(3)), B1: ref("B1"), C1: "x" });
    const before = structuredClone(sheet);
    recalcSheet(sheet);
    expect(sheet).toEqual(before);
  });
});

describe("long chains and cycles (requirements 6, 32)", () => {
  it("orders and evaluates a chain of 100 000 formulas without a stack overflow", () => {
    // Cell i sits at column floor(i / 8192), row i % 8192; cell 0 (A1) holds 1, cell i = cell (i - 1) + 1.
    const place = (i: number) => ({ col: Math.floor(i / 8192), row: i % 8192 });
    const cells: Cell[] = [{ kind: "number", col: 0, row: 0, value: 1 }];
    for (let i = 1; i <= 100_000; i++) {
      const p = place(i - 1);
      const r = { type: "ref" as const, ref: { ...p, colAbs: true, rowAbs: true } };
      cells.push(formulaCell(place(i).col, place(i).row, bin("add", r, n(1))));
    }
    const m = recalcSheet(sheetOf(cells.reverse()));
    const last = place(100_000);
    expect(m.size).toBe(100_000);
    expect(m.get(cellKey(last.col, last.row))?.outcome).toStrictEqual(ok(num(100_001)));
  }, 60_000);

  it("S26: a cycle of 50 000 cells is circular-reference for every member", () => {
    const place = (i: number) => ({ col: Math.floor(i / 8192), row: i % 8192 });
    const cells: Cell[] = [];
    for (let i = 0; i < 50_000; i++) {
      const next = place((i + 1) % 50_000);
      cells.push(formulaCell(place(i).col, place(i).row, { type: "ref", ref: { ...next, colAbs: true, rowAbs: true } }));
    }
    const m = recalcSheet(sheetOf(cells));
    expect([...m.values()].every((c) => !c.outcome.ok && c.outcome.u.code === "circular-reference")).toBe(true);
    const o = m.get(0)?.outcome;
    if (o && !o.ok) expect(o.u.message).toContain("and 49992 more");
  }, 60_000);
});
