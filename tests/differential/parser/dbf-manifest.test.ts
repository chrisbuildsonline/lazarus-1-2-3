// parseDbf against every dbf entry of fixtures/manifest.json and the independent walker
// tests/unit/helpers/dbf-scan.ts. The manifest counts are positions over all declared records
// (what scanDbf computes), so they are rebuilt here from the parser's table.fields. The titles say
// "synthetic" (written by scripts/lib/dbf-writer.ts) or "real" (ne_110m_land.dbf, Natural Earth).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cellKey, parseDbf, type Cell } from "../../../src/parser/index.ts";
import { scanDbf } from "../../unit/helpers/dbf-scan.ts";
import type { Counts } from "../../unit/helpers/wk1-scan.ts";

type Entry = {
  path: string;
  format: string;
  origin: "real" | "synthetic";
  counts: Counts;
  expectedValues: { cell: string; kind: string; cached: number | string }[];
};

const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: Entry[] };
const entries = manifest.fixtures.filter((e) => e.format === "dbf");

describe("parseDbf against fixtures/manifest.json", () => {
  it("has at least one dbf entry", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  for (const entry of entries) {
    describe(`${entry.origin}: ${entry.path}`, () => {
      const bytes = new Uint8Array(readFileSync(entry.path));
      const { workbook, diagnostics, stats, table } = parseDbf(bytes);
      const cells = workbook.sheets[0]!.sheet.cells;
      const scan = scanDbf(bytes);
      console.info(
        `${entry.path} (${entry.origin}): ${stats.records} records, ${stats.deletedRecords} deleted, ${stats.fields} fields, ${stats.cells} cells ` +
          `(${stats.labels} labels, ${stats.numbers} numbers, ${stats.otherTyped} other), ${stats.blankCells} blank, ${stats.unreadableCells} unreadable; ` +
          `diagnostics: ${diagnostics.map((d) => d.code).join(", ") || "none"}`,
      );

      /** Map a 1-based record number (counting deleted records) to its sheet row, or null if deleted. */
      const rowOf = (record: number) => (scan.deleted.includes(record) ? null : record - scan.deleted.filter((d) => d < record).length);
      const colOf = (name: string) => table.fields.findIndex((f) => f.name === name);

      it("has no error diagnostic", () => {
        expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      });

      it("positions rebuilt from table.fields equal the manifest counts", () => {
        const n = table.declaredRecords;
        const of = (types: string) => table.fields.filter((f) => types.includes(f.type)).length;
        expect({ cells: n * table.fields.length, formulas: 0, labels: n * of("C"), numbers: n * of("NF") }).toEqual(entry.counts);
        expect(scan.counts).toEqual(entry.counts);
      });

      it("keeps the count invariant", () => {
        expect(stats.cells + stats.blankCells + stats.unreadableCells).toBe((stats.records - stats.deletedRecords) * stats.fields);
        expect(stats.cells).toBe(stats.labels + stats.numbers + stats.otherTyped);
        expect(stats.deletedRecords).toBe(scan.deleted.length);
      });

      it("every expected value matches", () => {
        for (const want of entry.expectedValues) {
          const [record, name] = want.cell.split(":") as [string, string];
          const row = rowOf(Number(record));
          expect(row, want.cell).not.toBeNull();
          const cell = cells.get(cellKey(colOf(name), row!)) as Cell;
          expect(cell, want.cell).toBeDefined();
          if (want.kind === "number") expect(cell, want.cell).toMatchObject({ kind: "number", value: want.cached });
          else expect(cell, want.cell).toMatchObject({ kind: "label", text: want.cached });
        }
      });

      it("cells equal the independent walker for every live record", () => {
        for (const c of scan.cells) {
          const [record, name] = c.cell.split(":") as [string, string];
          const row = rowOf(Number(record));
          if (row === null) continue;
          const cell = cells.get(cellKey(colOf(name), row));
          if (c.value === null || (c.kind === "other" && c.value === "")) {
            expect(cell, c.cell).toBeUndefined();
          } else if (c.kind === "number") {
            expect(cell, c.cell).toEqual({ kind: "number", col: colOf(name), row, value: c.value });
          } else {
            expect(cell, c.cell).toMatchObject({ kind: "label", text: c.value });
          }
        }
        // Header row plus one cell per non-blank position, nothing else.
        const live = scan.cells.filter((c) => rowOf(Number(c.cell.split(":")[0])) !== null);
        const valued = live.filter((c) => !(c.value === null || (c.kind === "other" && c.value === "")));
        expect(cells.size).toBe(table.fields.length + valued.length);
      });

      if (entry.path === "fixtures/natural-earth-land/ne_110m_land.dbf") {
        it("is 127 records, 3 fields, 381 cells, 127 labels, 254 numbers, nothing deleted, blank or unreadable", () => {
          expect({
            records: stats.records,
            fields: stats.fields,
            cells: stats.cells,
            labels: stats.labels,
            numbers: stats.numbers,
            deleted: stats.deletedRecords,
            blank: stats.blankCells,
            unreadable: stats.unreadableCells,
          }).toEqual({ records: 127, fields: 3, cells: 381, labels: 127, numbers: 254, deleted: 0, blank: 0, unreadable: 0 });
        });
      }
    });
  }
});
