// The verification sweep schedule and its partial totals (seance-visuals task 3; requirements 17 to 22, 26).
// Presentation only: it reads the engine's cells and totals and never changes them.
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { initialScrollLeft, litAt, partialTotals, planSweep, SWEEP, sweepSegments } from "../../../../src/ui/model/sweep.ts";
import { proofSegments } from "../../../../src/ui/model/totals.ts";
import type { CellResult, Status, Totals } from "../../../../src/verify/index.ts";
import { verifyBytes } from "../../../../src/verify/index.ts";

const golden = JSON.parse(readFileSync("tests/differential/verify/golden.json", "utf8")) as Record<string, Totals>;

const cell = (i: number, status: Status): CellResult => ({
  address: `B${i + 1}`,
  col: 1,
  row: i,
  status,
  cached: { t: "num", v: i },
  recalculated: { t: "num", v: i },
  reason: status === "matched" ? { code: "exact", message: "exact" } : status === "mismatched" ? { code: "value-differs", message: "differs" } : { code: "volatile-function", message: "volatile" },
  formula: "A1",
  lotusFormula: "+A1",
  candidateOpcodes: [],
} as CellResult);

const cellsOf = (statuses: Status[]) => statuses.map((s, i) => cell(i, s));
const totalsOf = (cells: CellResult[]): Totals => {
  const t: Totals = { formulas: cells.length, matched: 0, mismatched: 0, unverifiable: 0, exact: 0, withinTolerance: 0, byReason: {} };
  for (const c of cells) {
    t[c.status]++;
    if (c.reason.code === "exact") t.exact++;
    if (c.reason.code === "within-tolerance") t.withinTolerance++;
    t.byReason[c.reason.code] = (t.byReason[c.reason.code] ?? 0) + 1;
  }
  return t;
};
const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === "object") {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

describe("planSweep", () => {
  it("clamps n x 15ms to 400 to 2500ms, with at most one step per 50ms", () => {
    expect(SWEEP).toEqual({ maxMs: 2500, frameMs: 50, minMs: 400, perCellMs: 15 });
    const plan = (n: number) => planSweep(cellsOf(Array<Status>(n).fill("matched")));
    expect([plan(0).durationMs, plan(0).steps]).toEqual([0, 0]);
    expect([plan(10).durationMs, plan(10).steps]).toEqual([400, 8]);
    // KSBASE: 160 formulas (golden.json), 160 * 15 = 2400ms, 2400 / 50 = 48 steps.
    expect(golden["fixtures/ksbase/KSBASE.WK1"]!.formulas).toBe(160);
    expect([plan(160).durationMs, plan(160).steps]).toEqual([2400, 48]);
    expect([plan(1000).durationMs, plan(1000).steps]).toEqual([2500, 50]);
    expect([plan(3).durationMs, plan(3).steps]).toEqual([400, 3]);
  });

  it("ranks every cell by its place in verify order", () => {
    const cells = verifyBytes(new Uint8Array(readFileSync("fixtures/ksbase/KSBASE.WK1"))).verification.cells;
    const plan = planSweep(cells);
    expect(plan.rank.size).toBe(160);
    cells.forEach((c, i) => expect(plan.rank.get(c.address)).toBe(i));
  });
});

describe("litAt", () => {
  it("starts at 0 and ends at n once the duration has passed", () => {
    for (const n of [1, 3, 10, 160, 1000, 5000]) {
      const plan = planSweep(cellsOf(Array<Status>(n).fill("matched")));
      expect(litAt(plan, n, 0)).toBe(0);
      expect(litAt(plan, n, plan.durationMs)).toBe(n);
      expect(litAt(plan, n, plan.durationMs * 10)).toBe(n);
    }
  });

  it("never decreases, never passes n, and rises by at most ceil(n / steps) per 50ms", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 6000 }), fc.array(fc.integer({ min: 0, max: 3000 }), { minLength: 2, maxLength: 40 }), (n, times) => {
        const plan = planSweep(cellsOf(Array<Status>(n).fill("matched")));
        const ts = [...times].sort((a, b) => a - b);
        let last = 0;
        for (const t of ts) {
          const lit = litAt(plan, n, t);
          expect(lit).toBeGreaterThanOrEqual(last);
          expect(lit).toBeLessThanOrEqual(n);
          expect(litAt(plan, n, t + SWEEP.frameMs) - lit).toBeLessThanOrEqual(Math.ceil(n / plan.steps));
          last = lit;
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe("partialTotals", () => {
  // 3 matched, 2 mismatched, 1 unverifiable, in this verify order.
  const cells = cellsOf(["matched", "mismatched", "matched", "unverifiable", "mismatched", "matched"]);
  const engine = totalsOf(cells);

  it("counts the first lit cells and keeps the engine's formula count", () => {
    expect(partialTotals(cells, engine, 0)).toMatchObject({ formulas: 6, matched: 0, mismatched: 0, unverifiable: 0 });
    expect(partialTotals(cells, engine, 2)).toMatchObject({ formulas: 6, matched: 1, mismatched: 1, unverifiable: 0 });
    expect(partialTotals(cells, engine, 4)).toMatchObject({ formulas: 6, matched: 2, mismatched: 1, unverifiable: 1 });
  });

  it("at lit = n is the engine totals field by field, even if the list disagrees with them", () => {
    expect(partialTotals(cells, engine, 6)).toEqual(engine);
    const odd: Totals = { ...engine, matched: 99, byReason: { exact: 99 } };
    expect(partialTotals(cells, odd, 6)).toEqual(odd);
    expect(partialTotals(cells, odd, 60)).toEqual(odd);
  });

  it("never mutates its inputs and never returns one of them", () => {
    const frozenCells = deepFreeze(cellsOf(["matched", "mismatched", "unverifiable"]));
    const frozenEngine = deepFreeze(totalsOf([...frozenCells]));
    for (let lit = 0; lit <= 3; lit++) {
      const got = partialTotals(frozenCells, frozenEngine, lit);
      expect(got).not.toBe(frozenEngine);
      expect(got.byReason).not.toBe(frozenEngine.byReason);
    }
  });

  it("every field is non-decreasing in lit, and the three counts add up to lit", () => {
    const status = fc.constantFrom<Status>("matched", "mismatched", "unverifiable");
    fc.assert(
      fc.property(fc.array(status, { maxLength: 80 }), (statuses) => {
        const cs = deepFreeze(cellsOf(statuses));
        const eng = deepFreeze(totalsOf([...cs]));
        let prev = partialTotals(cs, eng, 0);
        for (let lit = 1; lit <= cs.length; lit++) {
          const now = partialTotals(cs, eng, lit);
          for (const k of ["formulas", "matched", "mismatched", "unverifiable", "exact", "withinTolerance"] as const) expect(now[k]).toBeGreaterThanOrEqual(prev[k]);
          expect(now.matched + now.mismatched + now.unverifiable).toBe(lit);
          prev = now;
        }
        expect(prev).toEqual(eng);
      }),
      { numRuns: 100 },
    );
  });
});

describe("sweepSegments", () => {
  const cells = cellsOf(["matched", "mismatched", "matched", "unverifiable"]);
  const engine = totalsOf(cells);

  it("fills from empty over the engine's formula count and ends equal to proofSegments(engine)", () => {
    expect(sweepSegments(partialTotals(cells, engine, 0), engine)).toEqual([]);
    expect(sweepSegments(partialTotals(cells, engine, 2), engine)).toEqual([
      { status: "matched", fraction: 0.25 },
      { status: "mismatched", fraction: 0.25 },
    ]);
    expect(sweepSegments(partialTotals(cells, engine, 4), engine)).toEqual(proofSegments(engine));
  });
});

describe("initialScrollLeft", () => {
  it("is 0 without formulas or when the column fits, and otherwise brings its right edge into view", () => {
    expect(initialScrollLeft(null, 112, 1232)).toBe(0);
    expect(initialScrollLeft(3, 112, 1232)).toBe(0);
    expect(initialScrollLeft(14, 96, 800)).toBe(15 * 96 - 800);
  });

  it("shows the formula block up to its last column when it fits, never past the first one", () => {
    // KSBASE: formulas in N and O (13, 14); 1232px of body shows 11 columns: E to O.
    expect(initialScrollLeft(13, 112, 1232, 14)).toBe(15 * 112 - 1232);
    // A block wider than the view: its first column stays at the left edge.
    expect(initialScrollLeft(13, 112, 336, 40)).toBe(13 * 112);
  });
});
