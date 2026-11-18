import { describe, expect, it } from "vitest";
import { writeDbf, type DbfSpec } from "../../../scripts/lib/dbf-writer.ts";
import { parseDbf, type DbfParseResult } from "../../../src/parser/dbf.ts";
import { cellKey, getCell } from "../../../src/parser/sheet.ts";

const TWO = [
  { name: "NAME", type: "C", length: 6 },
  { name: "QTY", type: "N", length: 4 },
] as const;
const table = (records: DbfSpec["records"], extra: Partial<DbfSpec> = {}) => parseDbf(writeDbf({ fields: TWO, records, ...extra }));
const sheetOf = (r: DbfParseResult) => r.workbook.sheets[0]!.sheet;
const codes = (r: DbfParseResult) => r.diagnostics.map((d) => d.code);

function invariant(r: DbfParseResult): void {
  const s = r.stats;
  expect(s.cells + s.blankCells + s.unreadableCells).toBe((s.records - s.deletedRecords) * s.fields);
  expect(s.cells).toBe(s.labels + s.numbers + s.otherTyped);
  expect(sheetOf(r).cells.size).toBe(s.cells + s.headerCells);
  expect([...sheetOf(r).cells.values()].some((c) => c.kind === "formula")).toBe(false);
  expect("formulas" in s).toBe(false);
}

describe("parseDbf records", () => {
  it("puts the field names in row 0 with prefix ' and data rows from 1", () => {
    const r = table([{ values: ["Apple", "3"] }, { values: ["Pear", "12"] }]);
    const s = sheetOf(r);
    expect(getCell(s, 0, 0)).toEqual({ kind: "label", col: 0, row: 0, prefix: "'", text: "NAME" });
    expect(getCell(s, 1, 0)).toEqual({ kind: "label", col: 1, row: 0, prefix: "'", text: "QTY" });
    expect(getCell(s, 0, 1)).toEqual({ kind: "label", col: 0, row: 1, prefix: "'", text: "Apple" });
    expect(getCell(s, 1, 2)).toEqual({ kind: "number", col: 1, row: 2, value: 12 });
    expect(r.stats).toMatchObject({ records: 2, fields: 2, headerCells: 2, cells: 4, labels: 2, numbers: 2, deletedRecords: 0 });
    expect(s.sawEof).toBe(true);
    invariant(r);
  });

  it("skips a deleted record with one deleted-record info naming record 2, the next live record takes row 2", () => {
    const r = table([{ values: ["A", "1"] }, { deleted: true, values: ["B", "2"] }, { values: ["C", "3"] }, { deleted: true, values: ["D", "4"] }]);
    const del = r.diagnostics.filter((d) => d.code === "deleted-record");
    expect(del).toHaveLength(1);
    expect(del[0]!.severity).toBe("info");
    expect(del[0]!.message).toContain("record 2");
    expect(r.stats.deletedRecords).toBe(2);
    expect(getCell(sheetOf(r), 0, 2)).toMatchObject({ text: "C" });
    expect(getCell(sheetOf(r), 0, 3)).toBeUndefined();
    invariant(r);
  });

  it("gives truncated-table for fewer records than declared, keeps earlier cells, no cells from a partial record", () => {
    const full = writeDbf({ fields: TWO, records: [{ values: ["A", "1"] }, { values: ["B", "2"] }], eof: false });
    const cut = full.subarray(0, full.length - 3); // record 2 loses its last 3 bytes
    const r = parseDbf(cut);
    const t = r.diagnostics.find((d) => d.code === "truncated-table")!;
    expect(t.severity).toBe("error");
    expect(t.message).toContain("2");
    expect(t.message).toContain("1");
    expect(r.stats.records).toBe(1);
    expect(getCell(sheetOf(r), 0, 1)).toMatchObject({ text: "A" });
    expect(getCell(sheetOf(r), 0, 2)).toBeUndefined();
    invariant(r);
  });

  it("reports a missing 0x1A as missing-eof info and extra bytes as trailing-bytes", () => {
    const noEof = table([{ values: ["A", "1"] }], { eof: false });
    expect(noEof.diagnostics.find((d) => d.code === "missing-eof")!.severity).toBe("info");
    expect(sheetOf(noEof).sawEof).toBe(false);
    const extra = table([{ values: ["A", "1"] }], { trailing: [1, 2, 3] });
    expect(codes(extra)).toContain("trailing-bytes");
    expect(codes(extra)).not.toContain("missing-eof");
  });

  it("stops at the row limit with a row-limit error and keeps the rows read", () => {
    const bytes = writeDbf({ fields: TWO, records: [{ values: ["A", "1"] }, { values: ["B", "2"] }, { values: ["C", "3"] }] });
    const r = parseDbf(bytes, { rowLimit: 2 });
    const e = r.diagnostics.find((d) => d.code === "row-limit")!;
    expect(e.severity).toBe("error");
    expect(e.message).toContain("3");
    expect(getCell(sheetOf(r), 0, 2)).toMatchObject({ text: "B" });
    expect(getCell(sheetOf(r), 0, 3)).toBeUndefined();
    invariant(r);
  });

  it("keys every cell with cellKey", () => {
    const r = table([{ values: ["A", "1"] }]);
    expect([...sheetOf(r).cells.entries()].every(([k, c]) => k === cellKey(c.col, c.row))).toBe(true);
  });
});
