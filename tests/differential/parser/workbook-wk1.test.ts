// Every real and synthetic wk1/wks fixture gives the same sheet, diagnostics and stats through
// parseWorkbook as through parseWk1, and the verification totals of the real ones still equal
// tests/differential/verify/golden.json (read only, never regenerated here).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWk1, parseWorkbook } from "../../../src/parser/index.ts";
import { verifySheet } from "../../../src/verify/index.ts";

type Entry = { path: string; format: string; origin: "real" | "synthetic" };
type Golden = Record<string, { formulas: number; matched: number; mismatched: number; unverifiable: number; exact: number; withinTolerance: number; byReason: Record<string, number> }>;

const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: Entry[] };
const entries = manifest.fixtures.filter((e) => e.format === "wk1" || e.format === "wks");
const golden = JSON.parse(readFileSync("tests/differential/verify/golden.json", "utf8")) as Golden;

describe("parseWorkbook equals parseWk1 on every wk1 and wks fixture", () => {
  it("has wk1/wks entries", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  for (const entry of entries) {
    it(`${entry.origin}: ${entry.path}`, () => {
      const bytes = new Uint8Array(readFileSync(entry.path));
      const old = parseWk1(bytes);
      const now = parseWorkbook(bytes);
      expect(now.kind).toBe("wk1");
      expect(now.workbook.sheets.length).toBe(1);
      expect(now.workbook.sheets[0]!.sheet).toEqual(old.sheet);
      expect(now.diagnostics).toEqual(old.diagnostics);
      expect(now.stats).toEqual(old.stats);
      const g = golden[entry.path];
      if (g) {
        const t = verifySheet(now.workbook.sheets[0]!.sheet, entry.path).totals;
        expect({ formulas: t.formulas, matched: t.matched, mismatched: t.mismatched, unverifiable: t.unverifiable, exact: t.exact, withinTolerance: t.withinTolerance, byReason: t.byReason }).toEqual({
          formulas: g.formulas,
          matched: g.matched,
          mismatched: g.mismatched,
          unverifiable: g.unverifiable,
          exact: g.exact,
          withinTolerance: g.withinTolerance,
          byReason: g.byReason,
        });
      }
    });
  }

  it("covers every golden fixture", () => {
    for (const path of Object.keys(golden)) expect(entries.map((e) => e.path)).toContain(path);
  });
});
