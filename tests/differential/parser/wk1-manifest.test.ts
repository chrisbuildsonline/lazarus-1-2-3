// Skipped records in the real fixtures, recorded on the first run of this test (opcode: count).
// All are below 0x0100: no Quattro Pro extension records in this corpus. No fixture raised
// unknown-version, trailing-bytes or any warning; the BOF words are 0x0406 (.wk1) and 0x0404 (.wks).
//   fixtures/census-delaware-1992/92stlde.wk1 (30 of 390 records):
//     0x0002 1, 0x0003 1, 0x0004 1, 0x0005 1, 0x0007 1, 0x0008 4, 0x0018 1, 0x0019 1, 0x001a 1,
//     0x001b 1, 0x001c 1, 0x001d 1, 0x0020 1, 0x0023 1, 0x0024 1, 0x0025 1, 0x0026 1, 0x0027 1,
//     0x0028 1, 0x0029 1, 0x002a 1, 0x002f 1, 0x0030 1, 0x0066 1, 0x0067 1, 0x0069 1, 0x0096 1
//   fixtures/ksbase/KSBASE.WK1 (34 of 1287 records):
//     0x0002 1, 0x0003 1, 0x0004 1, 0x0005 1, 0x0007 1, 0x0008 9, 0x000b 9, 0x0024 1, 0x0025 1,
//     0x0026 1, 0x0028 1, 0x0029 1, 0x002a 1, 0x002d 1, 0x002f 1, 0x0030 1, 0x0031 1, 0x0064 1
//   fixtures/libreoffice-wks-functions/gnome647171-1.wks (10 of 20 records):
//     0x0002 1, 0x0003 1, 0x0004 1, 0x0005 1, 0x0007 1, 0x0024 1, 0x0025 1, 0x0026 1, 0x0031 1, 0x0033 1
//   fixtures/lotus123-wks/testLotus123.wks (22 of 58 records):
//     0x0002 1, 0x0003 1, 0x0004 1, 0x0005 1, 0x0007 1, 0x0018 1, 0x0019 1, 0x001a 1, 0x001b 1,
//     0x001c 1, 0x001d 1, 0x0020 1, 0x0023 1, 0x0024 1, 0x0025 1, 0x0026 1, 0x0027 1, 0x0028 1,
//     0x0029 1, 0x002a 1, 0x002f 1, 0x0030 1
// The synthetic fixtures (scripts/gen-fixtures.ts) skip nothing.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cellsInRowMajorOrder, getCell, parseA1, parseWk1, a1, type Cell } from "../../../src/parser/index.ts";
import { scanWk1, type Counts, type Wk1Cell } from "../../unit/helpers/wk1-scan.ts";

type Entry = {
  path: string;
  format: "wk1" | "wks" | "dbf";
  origin: "real" | "synthetic";
  counts: Counts;
  expectedValues: { cell: string; kind: string; cached: number | string }[];
};

const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: Entry[] };
const entries = manifest.fixtures.filter((e) => e.format === "wk1" || e.format === "wks");

/** The parser's cell in the walker's shape, so the two can be compared directly. */
function asScanCell(c: Cell): Wk1Cell {
  const cell = a1(c.col, c.row);
  if (c.kind === "label") return { cell, kind: "label", value: c.text, prefix: c.prefix };
  return { cell, kind: c.kind, value: c.kind === "formula" ? c.cached : c.value };
}

const hex = (n: number) => `0x${n.toString(16).padStart(4, "0")}`;

const ones = (...opcodes: number[]) => Object.fromEntries(opcodes.map((op) => [op, 1]));

/** Recorded skipped opcodes per real file (see the comment at the top). */
const REAL_SKIPPED: Record<string, Record<number, number>> = {
  "fixtures/census-delaware-1992/92stlde.wk1": {
    ...ones(0x02, 0x03, 0x04, 0x05, 0x07, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x20, 0x23, 0x24, 0x25, 0x26, 0x27),
    ...ones(0x28, 0x29, 0x2a, 0x2f, 0x30, 0x66, 0x67, 0x69, 0x96),
    0x08: 4,
  },
  "fixtures/ksbase/KSBASE.WK1": {
    ...ones(0x02, 0x03, 0x04, 0x05, 0x07, 0x24, 0x25, 0x26, 0x28, 0x29, 0x2a, 0x2d, 0x2f, 0x30, 0x31, 0x64),
    0x08: 9,
    0x0b: 9,
  },
  "fixtures/libreoffice-wks-functions/gnome647171-1.wks": ones(0x02, 0x03, 0x04, 0x05, 0x07, 0x24, 0x25, 0x26, 0x31, 0x33),
  "fixtures/lotus123-wks/testLotus123.wks": ones(
    ...[0x02, 0x03, 0x04, 0x05, 0x07, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x20, 0x23, 0x24, 0x25, 0x26, 0x27],
    ...[0x28, 0x29, 0x2a, 0x2f, 0x30],
  ),
};

describe("parseWk1 against fixtures/manifest.json", () => {
  it("has at least one wk1 or wks entry", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  for (const entry of entries) {
    describe(entry.path, () => {
      const bytes = new Uint8Array(readFileSync(entry.path));
      const { sheet, diagnostics, stats } = parseWk1(bytes);
      const skipped = Object.entries(stats.skippedByOpcode).map(([op, n]) => `${hex(Number(op))} x${n}`);
      const other = diagnostics.filter((d) => d.code !== "skipped-opcode").map((d) => `${d.code} @${d.offset}: ${d.message}`);
      console.info(
        `${entry.path} (${entry.origin}): ${stats.records} records, ${stats.skippedRecords} skipped: ${skipped.join(", ") || "none"}; ` +
          `other diagnostics: ${other.join("; ") || "none"}`,
      );

      it("parses with no error diagnostics and the manifest format", () => {
        expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
        expect(sheet.format).toBe(entry.format);
        expect(sheet.sawEof).toBe(true);
      });

      it("has the manifest counts", () => {
        const { cells, formulas, labels, numbers } = stats;
        expect({ cells, formulas, labels, numbers }).toEqual(entry.counts);
        expect(sheet.cells.size).toBe(stats.cells);
      });

      it("has the manifest's expected values", () => {
        for (const v of entry.expectedValues) {
          const at = parseA1(v.cell);
          expect(at, v.cell).not.toBeNull();
          const cell = at ? getCell(sheet, at.col, at.row) : undefined;
          expect(cell?.kind, v.cell).toBe(v.kind);
          if (cell?.kind === "label") expect(cell.text, v.cell).toBe(v.cached);
          else if (cell?.kind === "formula") expect(Object.is(cell.cached, v.cached), `${v.cell} ${cell.cached}`).toBe(true);
          else expect(cell?.value, v.cell).toBe(v.cached);
        }
      });

      // A real file added later has no recorded list yet: its skips are printed above for a human to record.
      // macros.wk1 holds two NAME records (\0 and \P, design.md "Fixture"); the parser skips them.
      const recorded = entry.origin === "real" ? REAL_SKIPPED[entry.path] : entry.path === "fixtures/macros/macros.wk1" ? { 11: 2 } : {};
      if (recorded) {
        it("skips the recorded opcodes and raises no warnings", () => {
          expect(stats.skippedByOpcode).toEqual(recorded);
          expect(diagnostics.filter((d) => d.code !== "skipped-opcode")).toEqual([]);
        });
      }

      it("matches the independent walker cell for cell", () => {
        const scan = scanWk1(bytes);
        expect(sheet.version).toBe(scan.version);
        expect(stats.cells).toBe(scan.counts.cells);
        const byAddress = (a: Wk1Cell, b: Wk1Cell) => {
          const pa = parseA1(a.cell)!;
          const pb = parseA1(b.cell)!;
          return pa.row - pb.row || pa.col - pb.col;
        };
        expect(cellsInRowMajorOrder(sheet).map(asScanCell)).toEqual([...scan.cells].sort(byAddress));
      });
    });
  }
});
