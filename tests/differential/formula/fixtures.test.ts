// Every formula in every wk1/wks fixture, translated. Outcome on the first run (decoded ok /
// flagged unverifiable, per fixture):
//   fixtures/ksbase/KSBASE.WK1                            160 / 0
//   fixtures/lotus123-wks/testLotus123.wks                 10 / 0  (reserved-bits-set warnings)
//   fixtures/libreoffice-wks-functions/gnome647171-1.wks    4 / 0
//   fixtures/formulas/formulas.wk1                          6 / 0
//   fixtures/mixed/mixed.wk1                                4 / 0
//   fixtures/dates/dates.wk1                                1 / 0
//   basic-values, labels, 92stlde.wk1                       no formulas
// 185 formulas, 185 ok, 0 unverifiable. No real formula raised unconfirmed-opcode: every opcode
// the real files use (0x00 to 0x06, 0x09, 0x0B, 0x0E, 0x14, 0x2F, 0x33, 0x3B, 0x50, 0x52, 0x58)
// was already confirmed in src/formula/opcodes.ts, so no status changed.
// Finding: testLotus123.wks writes relative columns as 0x80FE (-2) and 0x80FF (-1), bit 15 set
// and bits 8 to 14 clear, where KSBASE.WK1 sign-extends (0xBFFB = -5). The decoder reads the
// low 8 bits as signed either way, so the cells resolve to A and B as the cached values confirm
// (C2 = 1 * 10). The file is right, the warning is the spec's reserved-bit rule doing its job;
// it stays a warning and the status stays ok. Pinned below.
// Finding: gnome647171-1.wks C2 is @STD (0x58), not in requirement 17. Its cached 0.75 is the
// population deviation of 10 and 11.5, so it maps to STDEVP (src/formula/excel-ast.ts).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { a1, parseWk1, type Cell } from "../../../src/parser/index.ts";
import { translateFormula, type FormulaTranslation } from "../../../src/formula/index.ts";
import { parseExcel } from "../../unit/helpers/excel-parse.ts";

type Entry = { path: string; format: string; origin: "real" | "synthetic"; counts: { formulas: number } };

const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: Entry[] };
const entries = manifest.fixtures.filter((e) => e.format === "wk1" || e.format === "wks");

// Expected Excel text, read by a human: synthetic cells from the comments in
// scripts/lib/fixture-specs.ts, real cells from the bytes in evidence.md (relative words resolved
// against the cell by hand). Never copied from the translator's output.
const GOLDEN: Record<string, Record<string, string>> = {
  "fixtures/formulas/formulas.wk1": { A2: "A1+B1", B2: "A1*C1", C2: "SUM(A1:C1)", A3: "(A1+B1)*2", B3: "0.5*B1", C3: "SUM(A2:C2)+A3" },
  "fixtures/mixed/mixed.wk1": { D2: "B2*C2", D3: "B3*C3", B4: "SUM(B2:B3)", D4: "SUM(D2:D3)" },
  "fixtures/dates/dates.wk1": { A8: "A6+1" },
  // A2 02 00 80 ff bf 01 80 ff bf 50 01: A1..B1, @SUM. B2 the same range from B2, @COUNT (0x52).
  // C2 refs col -2 and -1, row -1 = A1, B1, @STD (0x58) with count 2. A5 per decode-functions.test.ts.
  "fixtures/libreoffice-wks-functions/gnome647171-1.wks": {
    A2: "SUM(A1:B1)",
    B2: "COUNTA(A1:B1)",
    C2: "STDEVP(A1,B1)",
    A5: 'IF(MOD(A4,2)=1,"Odd","Even")',
  },
  // Every C cell is fe 80 00 80 (col -2) times ff 80 00 80 (col -1), same row.
  "fixtures/lotus123-wks/testLotus123.wks": Object.fromEntries([2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((r) => [`C${r}`, `A${r}*B${r}`])),
  // N cells: col -11 row 0 = col -11 row +1 (C), AND the same for col -10 (D).
  // O cells: col -1 (N) = 1, then 0.5 times (col -5 row 0 + col -5 row +1, J) in parentheses, else 0x33.
  // N7 holds no formula (evidence.md lists O7 alone): 78 N cells and 82 O cells, 160 in all.
  "fixtures/ksbase/KSBASE.WK1": Object.fromEntries([
    ...range(3, 81).filter((r) => r !== 7).map((r) => [`N${r}`, `AND(C${r}=C${r + 1},D${r}=D${r + 1})`]),
    ...range(3, 84).map((r) => [`O${r}`, `IF(N${r}=1,0.5*(J${r}+J${r + 1}),FALSE())`]),
  ]),
};

/** Warnings and errors recorded per real file (see the header); anything else fails. */
const REAL_WARNINGS: Record<string, string[]> = {
  "fixtures/ksbase/KSBASE.WK1": [],
  "fixtures/lotus123-wks/testLotus123.wks": ["warning:reserved-bits-set"],
  "fixtures/libreoffice-wks-functions/gnome647171-1.wks": [],
  "fixtures/census-delaware-1992/92stlde.wk1": [],
};

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

describe("translateFormula on every wk1/wks fixture formula", () => {
  it("has wk1/wks entries with formulas", () => {
    expect(entries.some((e) => e.counts.formulas > 0)).toBe(true);
  });

  for (const entry of entries) {
    describe(entry.path, () => {
      const { sheet } = parseWk1(new Uint8Array(readFileSync(entry.path)));
      const results = [...sheet.cells.values()]
        .filter((c): c is Extract<Cell, { kind: "formula" }> => c.kind === "formula")
        .map((c) => ({ cell: a1(c.col, c.row), t: translateFormula(c.rpn, { col: c.col, row: c.row }) }));
      const ok = results.filter((r) => r.t.status === "ok");
      const bad = results.filter((r) => r.t.status === "unverifiable");
      const codes = (t: FormulaTranslation) => t.diagnostics.map((d) => `${d.severity}:${d.code}`);
      const seen = [...new Set(results.flatMap((r) => codes(r.t)))];
      console.info(`${entry.path} (${entry.origin}): ${results.length} formulas, ${ok.length} ok, ${bad.length} unverifiable; diagnostics: ${seen.join(", ") || "none"}`);

      it("decodes or flags every formula, summing to the manifest count", () => {
        expect(ok.length + bad.length).toBe(entry.counts.formulas);
      });

      it("flags each unverifiable formula with an error naming the opcode and offset", () => {
        for (const { cell, t } of bad) {
          const errors = t.diagnostics.filter((d) => d.severity === "error");
          expect(errors.length, cell).toBeGreaterThan(0);
          for (const d of errors.filter((d) => ["unknown-opcode", "stack-underflow", "truncated-stream"].includes(d.code))) {
            expect(d.message, cell).toContain("0x");
            expect(d.message, cell).toContain(`offset ${d.offset}`);
          }
        }
      });

      it("prints text for each ok formula that the independent parser reads back", () => {
        for (const { cell, t } of ok) {
          expect(t.excel, cell).toBeTruthy();
          const back = parseExcel(t.excel!);
          expect(back.ok, `${cell} ${t.excel} ${back.ok ? "" : back.error}`).toBe(true);
        }
      });

      // A real file added later has no record yet: its diagnostics are printed above for a human.
      const recorded = REAL_WARNINGS[entry.path];
      if (recorded) {
        it("raises only the recorded warnings", () => {
          expect(seen.filter((c) => !c.startsWith("info:"))).toEqual(recorded);
        });
      }

      const golden = GOLDEN[entry.path];
      if (golden) {
        it("matches the golden text exactly", () => {
          const got = Object.fromEntries(results.filter((r) => r.cell in golden).map((r) => [r.cell, r.t.excel]));
          expect(got).toEqual(golden);
          for (const r of results.filter((r) => r.cell in golden)) expect(r.t.status, r.cell).toBe("ok");
        });
      }
    });
  }
});
