import { describe, expect, it } from "vitest";
import type { CellResult } from "../../../src/verify/classify.ts";
import { totals } from "../../../src/verify/report.ts";
import type { ReasonCode } from "../../../src/verify/value.ts";

const cell = (status: CellResult["status"], code: ReasonCode, i: number): CellResult => ({
  address: `A${i + 1}`,
  col: 0,
  row: i,
  status,
  cached: null,
  recalculated: null,
  reason: { code, message: "m" },
  formula: null,
  lotusFormula: null,
  candidateOpcodes: [],
});

describe("totals (requirement 20)", () => {
  const cells = [
    cell("matched", "exact", 0),
    cell("matched", "exact", 1),
    cell("matched", "within-tolerance", 2),
    cell("mismatched", "value-differs", 3),
    cell("unverifiable", "circular-reference", 4),
    cell("unverifiable", "circular-reference", 5),
    cell("unverifiable", "undocumented-semantics", 6),
  ];
  const t = totals(cells);

  it("the three counts add up to formulas", () => {
    expect(t).toMatchObject({ formulas: 7, matched: 3, mismatched: 1, unverifiable: 3 });
    expect(t.matched + t.mismatched + t.unverifiable).toBe(t.formulas);
  });

  it("exact plus withinTolerance equals matched", () => {
    expect(t).toMatchObject({ exact: 2, withinTolerance: 1 });
    expect(t.exact + t.withinTolerance).toBe(t.matched);
  });

  it("byReason counts match the list, with no zero entries", () => {
    expect(t.byReason).toEqual({ exact: 2, "within-tolerance": 1, "value-differs": 1, "circular-reference": 2, "undocumented-semantics": 1 });
  });

  it("an empty list gives zero totals", () => {
    expect(totals([])).toEqual({ formulas: 0, matched: 0, mismatched: 0, unverifiable: 0, exact: 0, withinTolerance: 0, byReason: {} });
  });
});
