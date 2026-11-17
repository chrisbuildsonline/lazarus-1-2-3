// The engine against the independent evaluator in tests/unit/helpers/rpn-eval.ts on every
// synthetic formula (acceptance 4). The oracle reads precedents' cached values, the engine its own
// recalculated ones; the synthetic fixtures are written so the two coincide, so equality also
// checks the engine's dependency order.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { a1, cellKey, parseWk1, type Cell } from "../../../src/parser/index.ts";
import { verifySheet } from "../../../src/verify/index.ts";
import { evalRpn } from "../../unit/helpers/rpn-eval.ts";

type Entry = { path: string; format: string; origin: "real" | "synthetic" };

const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: Entry[] };
const synthetic = manifest.fixtures.filter((e) => e.origin === "synthetic" && (e.format === "wk1" || e.format === "wks"));

describe("engine against the rpn-eval oracle on synthetic formulas", () => {
  let checked = 0;

  for (const entry of synthetic) {
    it(`${entry.path}: every formula is the oracle's double and matched exactly`, () => {
      const { sheet } = parseWk1(new Uint8Array(readFileSync(entry.path)));
      const results = new Map(verifySheet(sheet, entry.path).cells.map((c) => [c.address, c]));
      const valueAt = (col: number, row: number): number => {
        const c = sheet.cells.get(cellKey(col, row));
        if (!c || c.kind === "label") throw new Error(`${entry.path}: no number at ${a1(col, row)}`);
        return c.kind === "formula" ? c.cached : c.value;
      };
      const formulas = [...sheet.cells.values()].filter((c): c is Extract<Cell, { kind: "formula" }> => c.kind === "formula");
      for (const cell of formulas) {
        const address = a1(cell.col, cell.row);
        const r = results.get(address);
        const label = `${entry.path} ${address} ${r?.formula ?? "(no text)"}`;
        const oracle = evalRpn(cell.rpn, cell.col, cell.row, valueAt);
        expect(r?.recalculated, label).toEqual({ t: "num", v: oracle });
        expect(Object.is(r?.recalculated?.t === "num" ? r.recalculated.v : NaN, oracle), label).toBe(true);
        expect(r?.status, label).toBe("matched");
        expect(r?.reason.code, label).toBe("exact");
        checked++;
      }
    });
  }

  it("checked all 27 synthetic formulas", () => {
    expect(checked).toBe(27); // formulas 6, dates 1, mixed 4, functions 16
  });
});
