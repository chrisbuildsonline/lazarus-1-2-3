// parseWk3 against every wk3 entry of fixtures/manifest.json and the independent walker
// tests/unit/helpers/wk3-scan.ts. The titles say "synthetic" or "real": a synthetic file is
// written by scripts/lib/wk3-writer.ts from the same layout table, so its agreement is
// self-consistency; the real file (PEYTREND.WK3, CC0) is the one outside check (requirement 64).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { a1, parseWk3, type Cell } from "../../../src/parser/index.ts";
import type { Counts } from "../../unit/helpers/wk1-scan.ts";
import { scanWk3, type Wk3Cell } from "../../unit/helpers/wk3-scan.ts";

type Entry = {
  path: string;
  format: string;
  origin: "real" | "synthetic";
  counts: Counts;
  sheets: { name: string; counts: Counts }[];
  expectedValues: { cell: string; kind: string; cached: number | string }[];
};

const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: Entry[] };
const entries = manifest.fixtures.filter((e) => e.format === "wk3");

const asScan = (sheet: string, c: Cell): Wk3Cell => ({
  cell: `${sheet}!${a1(c.col, c.row)}`,
  kind: c.kind,
  value: c.kind === "label" ? c.text : c.kind === "formula" ? c.cached : c.value,
});

const countsOf = (cells: Iterable<Cell>): Counts => {
  const list = [...cells];
  return {
    cells: list.length,
    formulas: list.filter((c) => c.kind === "formula").length,
    labels: list.filter((c) => c.kind === "label").length,
    numbers: list.filter((c) => c.kind === "number" || c.kind === "integer").length,
  };
};

describe("parseWk3 against fixtures/manifest.json", () => {
  it("has at least one wk3 entry", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  for (const entry of entries) {
    describe(`${entry.origin}: ${entry.path}`, () => {
      const bytes = new Uint8Array(readFileSync(entry.path));
      const { workbook, diagnostics, stats } = parseWk3(bytes);
      console.info(
        `${entry.path} (${entry.origin}): ${stats.records} records, ${stats.sheets} sheets, ${stats.cells} cells, ${stats.skippedRecords} skipped, ` +
          `${stats.roundedNumbers} rounded; diagnostics: ${diagnostics.map((d) => d.code).join(", ") || "none"}`,
      );

      it("has no error diagnostic and reads to EOF", () => {
        expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
        expect(workbook.sheets.every((s) => s.sheet.sawEof)).toBe(true);
      });

      it("stats equal the manifest counts", () => {
        expect({ cells: stats.cells, formulas: stats.formulas, labels: stats.labels, numbers: stats.numbers }).toEqual(entry.counts);
      });

      it("sheet names and per-sheet counts equal the manifest", () => {
        expect(workbook.sheets.map((s) => ({ name: s.name, counts: countsOf(s.sheet.cells.values()) }))).toEqual(entry.sheets);
      });

      it("every expected value matches", () => {
        const all = new Map<string, Cell>(workbook.sheets.flatMap((s) => [...s.sheet.cells.values()].map((c) => [`${s.name}!${a1(c.col, c.row)}`, c] as const)));
        for (const want of entry.expectedValues) {
          const got = all.get(want.cell);
          expect(got, want.cell).toBeDefined();
          const scan = asScan(want.cell.split("!")[0]!, got!);
          expect({ kind: scan.kind, cached: scan.value }, want.cell).toEqual({ kind: want.kind, cached: want.cached });
        }
      });

      it("cells equal the independent walker", () => {
        const scan = scanWk3(bytes);
        const mine = workbook.sheets.flatMap((s) => [...s.sheet.cells.values()].map((c) => asScan(s.name, c)));
        const order = (a: Wk3Cell, b: Wk3Cell) => (a.cell < b.cell ? -1 : a.cell > b.cell ? 1 : 0);
        expect(mine.sort(order)).toEqual([...scan.cells].sort(order));
        expect(scan.sheets).toEqual(entry.sheets);
      });
    });
  }
});
