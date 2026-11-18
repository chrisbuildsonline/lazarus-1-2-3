// verifyBytes on every wk1/wks fixture of the manifest, enumerated at run time (acceptance 1, 3).
// The split per fixture is printed; the real files' exact numbers are pinned in golden.test.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { a1, parseWk1 } from "../../../src/parser/index.ts";
import { verifyBytes } from "../../../src/verify/index.ts";

type Entry = { path: string; format: string; origin: "real" | "synthetic"; counts: { formulas: number } };

const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: Entry[] };
const entries = manifest.fixtures.filter((e) => e.format === "wk1" || e.format === "wks");

describe("verifyBytes on every wk1/wks fixture", () => {
  it("the manifest has wk1/wks formulas to verify", () => {
    expect(entries.reduce((s, e) => s + e.counts.formulas, 0)).toBeGreaterThan(0);
  });

  for (const entry of entries) {
    describe(entry.path, () => {
      const bytes = new Uint8Array(readFileSync(entry.path));
      const { verification: v } = verifyBytes(bytes, entry.path);
      const t = v.totals;
      console.info(`${entry.path} (${entry.origin}): ${t.formulas} formulas, ${t.matched} matched (${t.exact} exact, ${t.withinTolerance} within tolerance), ${t.mismatched} mismatched, ${t.unverifiable} unverifiable`);

      it("matched + mismatched + unverifiable equals the manifest formula count", () => {
        expect(t.matched + t.mismatched + t.unverifiable).toBe(entry.counts.formulas);
        expect(t.formulas).toBe(entry.counts.formulas);
      });

      it("lists each formula cell exactly once", () => {
        const { sheet } = parseWk1(bytes);
        const formulaCells = [...sheet.cells.values()].filter((c) => c.kind === "formula").map((c) => a1(c.col, c.row));
        const listed = v.cells.map((c) => c.address);
        expect(new Set(listed).size).toBe(listed.length);
        expect([...listed].sort()).toEqual([...formulaCells].sort());
      });

      it("byReason adds up to the cells", () => {
        const counted: Record<string, number> = {};
        for (const c of v.cells) counted[c.reason.code] = (counted[c.reason.code] ?? 0) + 1;
        expect(t.byReason).toEqual(counted);
        expect(Object.values(t.byReason).reduce((s, n) => s + n, 0)).toBe(t.formulas);
      });

      // macros.wk1 A10 holds an unknown token on purpose; tests/unit/fixtures/macros.test.ts checks it.
      if (entry.origin === "synthetic" && entry.path !== "fixtures/macros/macros.wk1") {
        it("every synthetic cell is matched", () => {
          for (const c of v.cells) expect(c.status, `${c.address} ${c.formula} ${c.reason.message}`).toBe("matched");
        });
      }
    });
  }
});
