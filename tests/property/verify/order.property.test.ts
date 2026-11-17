// Order independence and determinism (S26; requirements 5, 20, 31, 33). Random sheets reference
// random cells of a 4 x 4 grid, so cycles, self references, empties and chains all occur; cycle
// membership is checked against a plain depth-first search written here.
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Expr } from "../../../src/formula/index.ts";
import { parseWk1, type Cell, type Sheet } from "../../../src/parser/index.ts";
import { verifyBytes, verifySheet } from "../../../src/verify/index.ts";
import { bin, buildSheet, n, ref, sheetOf, type Spec } from "../../unit/helpers/build-sheet.ts";

const GRID = ["A", "B", "C", "D"].flatMap((c) => [1, 2, 3, 4].map((r) => `${c}${r}`));
const FIXTURES = ["fixtures/ksbase/KSBASE.WK1", "fixtures/functions/functions.wk1", "fixtures/mixed/mixed.wk1", "fixtures/libreoffice-wks-functions/gnome647171-1.wks"];

type CellPlan = { kind: "empty" } | { kind: "number"; v: number } | { kind: "formula"; refs: string[] };

const plan: fc.Arbitrary<CellPlan> = fc.oneof(
  fc.constant<CellPlan>({ kind: "empty" }),
  fc.integer({ min: -100, max: 100 }).map((v): CellPlan => ({ kind: "number", v })),
  fc.array(fc.constantFrom(...GRID), { minLength: 1, maxLength: 3 }).map((refs): CellPlan => ({ kind: "formula", refs })),
);
const sheetPlan = fc.array(plan, { minLength: GRID.length, maxLength: GRID.length });

function build(plans: CellPlan[]): { sheet: Sheet; refs: Map<string, string[]> } {
  const specs: Record<string, Spec> = {};
  const refs = new Map<string, string[]>();
  plans.forEach((p, i) => {
    const address = GRID[i]!;
    if (p.kind === "number") specs[address] = p.v;
    if (p.kind === "formula") {
      specs[address] = p.refs.map(ref).reduce((a: Expr, b) => bin("add", a, b), n(0));
      refs.set(address, p.refs);
    }
  });
  return { sheet: buildSheet(specs), refs };
}

/** Formula cells that can reach themselves through references to other formula cells. */
function onCycle(refs: Map<string, string[]>): Set<string> {
  const out = new Set<string>();
  for (const start of refs.keys()) {
    const seen = new Set<string>();
    const stack = [...refs.get(start)!];
    while (stack.length > 0) {
      const at = stack.pop()!;
      if (at === start) {
        out.add(start);
        break;
      }
      if (seen.has(at) || !refs.has(at)) continue;
      seen.add(at);
      stack.push(...refs.get(at)!);
    }
  }
  return out;
}

const reorder = (sheet: Sheet, order: Cell[]): Sheet => ({ ...sheetOf(order), format: sheet.format, version: sheet.version, sawEof: sheet.sawEof, declaredDimensions: sheet.declaredDimensions });

describe("order independence and determinism (S26)", () => {
  for (const path of FIXTURES) {
    it(`${path}: shuffling the insertion order of sheet.cells leaves the output deeply equal`, () => {
      const { sheet } = parseWk1(new Uint8Array(readFileSync(path)));
      const cells = [...sheet.cells.values()];
      const expected = verifySheet(sheet, path);
      fc.assert(
        fc.property(fc.shuffledSubarray(cells, { minLength: cells.length }), (order) => {
          expect(verifySheet(reorder(sheet, order), path)).toEqual(expected);
        }),
        { numRuns: 20 },
      );
    });

    it(`${path}: verifying the same bytes twice is deeply equal`, () => {
      const bytes = new Uint8Array(readFileSync(path));
      expect(verifyBytes(bytes, path)).toEqual(verifyBytes(bytes, path));
    });
  }

  it("a random sheet terminates, its totals add up, and its cycles are exactly the circular-reference cells", () => {
    fc.assert(
      fc.property(sheetPlan, (plans) => {
        const { sheet, refs } = build(plans);
        const v = verifySheet(sheet);
        const t = v.totals;
        expect(t.formulas).toBe(refs.size);
        expect(t.matched + t.mismatched + t.unverifiable).toBe(t.formulas);
        const circular = new Set(v.cells.filter((c) => c.reason.code === "circular-reference").map((c) => c.address));
        expect(circular).toEqual(onCycle(refs));
      }),
    );
  });

  it("a random sheet gives the same output for any insertion order", () => {
    const shuffled = sheetPlan.chain((plans) => {
      const { sheet } = build(plans);
      const cells = [...sheet.cells.values()];
      return fc.tuple(fc.constant(sheet), fc.shuffledSubarray(cells, { minLength: cells.length }));
    });
    fc.assert(
      fc.property(shuffled, ([sheet, order]) => {
        expect(verifySheet(sheetOf(order))).toEqual(verifySheet(sheet));
      }),
    );
  });
});
