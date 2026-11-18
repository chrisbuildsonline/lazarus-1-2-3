import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { padValue, writeDbf, type DbfFieldSpec } from "../../../scripts/lib/dbf-writer.ts";
import { cellKey, parseDbf, type DbfParseResult } from "../../../src/parser/index.ts";

const SEVERITIES = new Set(["error", "warning", "info"]);

function expectWellFormed(result: DbfParseResult, length: number): void {
  const { workbook, diagnostics, stats, table } = result;
  expect(workbook.format).toBe("dbf");
  expect(stats.bytesRead).toBeGreaterThanOrEqual(0);
  expect(stats.bytesRead).toBeLessThanOrEqual(Math.max(length, 32));
  expect(stats.cells).toBe(stats.labels + stats.numbers + stats.otherTyped);
  if (workbook.sheets.length > 0) {
    // The count invariant (requirement 42).
    const positions = (stats.records - stats.deletedRecords) * table.fields.length;
    expect(stats.cells + stats.blankCells + stats.unreadableCells).toBe(positions);
    expect(workbook.sheets[0]!.sheet.cells.size).toBe(stats.cells + stats.headerCells);
  }
  for (const d of diagnostics) {
    expect(SEVERITIES.has(d.severity)).toBe(true);
    expect(d.offset).toBeGreaterThanOrEqual(0);
    expect(d.offset).toBeLessThanOrEqual(Math.max(length, 32));
  }
}

/** A dBase III header whose counts and lengths come from the test, followed by arbitrary bytes. */
const header = (records: number, headerLength: number, recordLength: number) => {
  const h = new Uint8Array(32);
  const v = new DataView(h.buffer);
  h[0] = 0x03;
  v.setUint32(4, records, true);
  v.setUint16(8, headerLength, true);
  v.setUint16(10, recordLength, true);
  return h;
};

describe("parseDbf properties", () => {
  it("never throws on arbitrary bytes", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 2048 }), (bytes) => {
        expectWellFormed(parseDbf(bytes), bytes.length);
      }),
      { numRuns: 500 },
    );
  });

  it("never throws on arbitrary bytes behind a valid header with random counts", () => {
    fc.assert(
      fc.property(fc.nat({ max: 5000 }), fc.integer({ min: 0, max: 600 }), fc.integer({ min: 0, max: 300 }), fc.uint8Array({ maxLength: 2048 }), (n, hl, rl, tail) => {
        const bytes = new Uint8Array(32 + tail.length);
        bytes.set(header(n, hl, rl));
        bytes.set(tail, 32);
        expectWellFormed(parseDbf(bytes), bytes.length);
      }),
      { numRuns: 500 },
    );
  });

  it("reads back generated tables cell for cell and keeps the count invariant", () => {
    const field = fc.oneof(
      fc.record({ type: fc.constant("C"), length: fc.integer({ min: 1, max: 20 }) }),
      fc.record({ type: fc.constant("N"), length: fc.integer({ min: 4, max: 18 }) }),
      fc.constantFrom({ type: "D", length: 8 }, { type: "L", length: 1 }, { type: "M", length: 10 }),
    );
    const table = fc.array(field, { minLength: 1, maxLength: 8 }).chain((kinds) => {
      const fields: DbfFieldSpec[] = kinds.map((k, i) => ({ name: `F${i}`, ...k }));
      const value = (f: DbfFieldSpec) =>
        f.type === "C"
          ? fc.string({ maxLength: f.length }).map((s) => s.replace(/[^\x21-\x7e ]/g, "a"))
          : f.type === "N"
            ? fc.oneof(fc.constant(""), fc.integer({ min: -999, max: 9999 }).map(String), fc.double({ min: -99, max: 99, noNaN: true }).map((d) => d.toFixed(2)))
            : f.type === "D"
              ? fc.constantFrom("", "20261118", "19991231")
              : f.type === "L"
                ? fc.constantFrom("", "T", "F", "?")
                : fc.constantFrom("", "1", "42");
      const rec = fc.record({ deleted: fc.boolean(), values: fc.tuple(...fields.map(value)) });
      return fc.record({ fields: fc.constant(fields), records: fc.array(rec, { maxLength: 15 }) });
    });
    fc.assert(
      fc.property(table, (spec) => {
        const bytes = writeDbf(spec);
        const result = parseDbf(bytes);
        expectWellFormed(result, bytes.length);
        const { stats, workbook } = result;
        const cells = workbook.sheets[0]!.sheet.cells;
        const live = spec.records.filter((r) => !r.deleted);
        expect(stats.records).toBe(spec.records.length);
        expect(stats.deletedRecords).toBe(spec.records.length - live.length);
        expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
        let expectedCells = 0;
        live.forEach((r, i) => {
          spec.fields.forEach((f, col) => {
            const stored = padValue(f, r.values[col]!);
            const cell = cells.get(cellKey(col, i + 1));
            if (f.type === "C") {
              expectedCells++;
              expect(cell).toEqual({ kind: "label", col, row: i + 1, prefix: "'", text: stored.replace(/ +$/, "") });
            } else if (stored.trim() === "") {
              expect(cell).toBeUndefined();
            } else if (f.type === "N") {
              expectedCells++;
              expect(cell).toEqual({ kind: "number", col, row: i + 1, value: Number(stored.trim()) });
            } else {
              expectedCells++;
              expect(cell).toEqual({ kind: "label", col, row: i + 1, prefix: "'", text: stored.trim() });
            }
          });
        });
        expect(stats.cells).toBe(expectedCells);
      }),
      { numRuns: 300 },
    );
  });

  it("reads N text made by toFixed and toExponential back as Number(text)", () => {
    const text = fc.oneof(
      fc.tuple(fc.double({ min: -1e9, max: 1e9, noNaN: true }), fc.integer({ min: 0, max: 6 })).map(([d, n]) => d.toFixed(n)),
      fc.tuple(fc.double({ noNaN: true, noDefaultInfinity: true }), fc.integer({ min: 0, max: 8 })).map(([d, n]) => d.toExponential(n)),
    );
    fc.assert(
      fc.property(text, (t) => {
        const field = { name: "N", type: "N", length: Math.max(t.length, 1) };
        const { workbook } = parseDbf(writeDbf({ fields: [field], records: [{ values: [t] }] }));
        expect(workbook.sheets[0]!.sheet.cells.get(cellKey(0, 1))).toEqual({ kind: "number", col: 0, row: 1, value: Number(t) });
      }),
      { numRuns: 1000 },
    );
  });

  describe("mutated fixtures", () => {
    const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: { path: string; format: string }[] };
    const paths = manifest.fixtures.filter((e) => e.format === "dbf").map((e) => e.path);

    it("has dbf fixtures to mutate, the real one included", () => {
      expect(paths).toContain("fixtures/natural-earth-land/ne_110m_land.dbf");
      expect(paths).toContain("fixtures/dbf-table/dbf-table.dbf");
    });

    for (const path of paths) {
      it(`never throws on mutations of ${path}`, () => {
        const original = new Uint8Array(readFileSync(path));
        const mutation = fc.array(fc.record({ at: fc.nat(), value: fc.integer({ min: 0, max: 255 }) }), { minLength: 1, maxLength: 16 });
        fc.assert(
          fc.property(mutation, fc.nat(), fc.boolean(), (edits, cut, inHeader) => {
            const bytes = original.slice(0, original.length - (cut % 64));
            for (const e of edits) if (bytes.length > 0) bytes[e.at % (inHeader ? Math.min(bytes.length, 128) : bytes.length)] = e.value;
            expectWellFormed(parseDbf(bytes), bytes.length);
          }),
          { numRuns: 200 },
        );
      });
    }
  });
});
