import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { writeDbf } from "../../../scripts/lib/dbf-writer.ts";
import { parseDbf } from "../../../src/parser/dbf.ts";
import { SAMPLE_DBF } from "../helpers/dbf-sample.ts";

const LAND = new Uint8Array(readFileSync("fixtures/natural-earth-land/ne_110m_land.dbf"));

describe("parseDbf robustness", () => {
  it("never throws on empty, 1 to 31 bytes, all 0xFF and all 0x00, and reports an error", () => {
    const inputs = [new Uint8Array(0), ...Array.from({ length: 31 }, (_, i) => SAMPLE_DBF.subarray(0, i + 1)), new Uint8Array(200).fill(0xff), new Uint8Array(200)];
    for (const bytes of inputs) {
      const r = parseDbf(bytes);
      expect(r.diagnostics.some((d) => d.severity === "error")).toBe(true);
      expect(r.stats.bytesRead).toBeLessThanOrEqual(bytes.length);
      expect(r.diagnostics.length).toBeLessThanOrEqual(1001);
    }
  });

  it("reads a header-only table (no records) as the header row", () => {
    const r = parseDbf(writeDbf({ fields: [{ name: "A", type: "C", length: 2 }], records: [] }));
    expect(r.workbook.sheets).toHaveLength(1);
    expect(r.stats).toMatchObject({ records: 0, headerCells: 1, cells: 0 });
  });

  it("gives bad-header for record length 0 and for a header length past the input", () => {
    const zero = Uint8Array.from(SAMPLE_DBF);
    zero[10] = 0;
    zero[11] = 0;
    expect(parseDbf(zero).diagnostics.map((d) => d.code)).toContain("bad-header");
    const past = Uint8Array.from(SAMPLE_DBF);
    new DataView(past.buffer).setUint16(8, 5000, true);
    const r = parseDbf(past);
    expect(r.diagnostics.map((d) => d.code)).toContain("bad-header");
    expect(r.stats.records).toBe(0);
  });

  it("does not change its input and reads a subarray like a copy", () => {
    const before = Uint8Array.from(LAND);
    const padded = new Uint8Array(LAND.length + 7);
    padded.set(LAND, 3);
    const a = parseDbf(LAND);
    const b = parseDbf(padded.subarray(3, 3 + LAND.length));
    expect(b).toEqual(a);
    expect(LAND).toEqual(before);
  });

  it("reads ne_110m_land.dbf: 127 records, 3 fields, 381 cells, 127 labels, 254 numbers", () => {
    const r = parseDbf(LAND);
    expect(r.stats).toMatchObject({ records: 127, fields: 3, cells: 381, labels: 127, numbers: 254, deletedRecords: 0, blankCells: 0, unreadableCells: 0 });
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("parses 100,000 generated records in one run", () => {
    const records = Array.from({ length: 100_000 }, (_, i) => ({ values: [String(i % 1000)] }));
    const r = parseDbf(writeDbf({ fields: [{ name: "N", type: "N", length: 4 }], records }));
    expect(r.workbook.sheets[0]!.sheet.cells.size).toBe(100_000 + 1);
    expect(r.stats.cells).toBe(100_000);
  });
});
