import { describe, expect, it } from "vitest";
import { writeDbf, type DbfFieldSpec } from "../../../scripts/lib/dbf-writer.ts";
import { parseDbf } from "../../../src/parser/dbf.ts";

const fieldsOf = (n: number): DbfFieldSpec[] => Array.from({ length: n }, (_, i) => ({ name: `F${i}`, type: "C", length: 1 }));
const errors = (r: ReturnType<typeof parseDbf>) => r.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);

describe("parseDbf field descriptors", () => {
  it("reads names up to the first NUL, type, length and decimals", () => {
    const r = parseDbf(writeDbf({ fields: [{ name: "PRICE", type: "N", length: 8, decimals: 2 }, { name: "ELEVENCHARS", type: "C", length: 3 }], records: [] }));
    expect(r.table.fields).toEqual([
      { name: "PRICE", type: "N", length: 8, decimals: 2 },
      { name: "ELEVENCHARS", type: "C", length: 3, decimals: 0 },
    ]);
    expect(r.stats.fields).toBe(2);
  });

  it("reads 2 and 255 descriptors", () => {
    expect(parseDbf(writeDbf({ fields: fieldsOf(2), records: [{ values: ["a", "b"] }] })).stats.fields).toBe(2);
    const big = parseDbf(writeDbf({ fields: fieldsOf(255), records: [{ values: fieldsOf(255).map(() => "x") }] }));
    expect(big.stats.fields).toBe(255);
    expect(big.stats.cells).toBe(255);
    expect(errors(big)).toEqual([]);
  });

  it("gives bad-header and no records for a missing 0x0D", () => {
    const r = parseDbf(writeDbf({ terminator: false, fields: fieldsOf(2), records: [{ values: ["a", "b"] }] }));
    expect(errors(r)).toContain("bad-header");
    expect(r.stats.records).toBe(0);
    expect(r.stats.cells).toBe(0);
  });

  it("gives bad-header and no records for 256 descriptors", () => {
    const r = parseDbf(writeDbf({ fields: fieldsOf(256), records: [{ values: fieldsOf(256).map(() => "x") }] }));
    expect(errors(r)).toContain("bad-header");
    expect(r.stats.records).toBe(0);
    expect(r.stats.cells).toBe(0);
  });

  it("warns bad-field when field lengths plus 1 differ from the record length, and steps by the header's length", () => {
    // Record length 6 (one pad byte after the 4-byte field): records start at 65, 71.
    const r = parseDbf(writeDbf({ recordLength: 6, fields: [{ name: "Q", type: "N", length: 4 }], records: [{ values: ["12"] }, { values: ["34"] }] }));
    const bad = r.diagnostics.find((d) => d.code === "bad-field")!;
    expect(bad.severity).toBe("warning");
    expect(bad.message).toContain("5");
    expect(bad.message).toContain("6");
    expect(r.workbook.sheets[0]!.sheet.cells.get(65536)).toMatchObject({ kind: "number", value: 12 });
    expect(r.workbook.sheets[0]!.sheet.cells.get(2 * 65536)).toMatchObject({ kind: "number", value: 34 });
  });

  it("gives a field that crosses the record end bad-field and no cells, counted as unreadable", () => {
    const r = parseDbf(writeDbf({ recordLength: 3, fields: [{ name: "A", type: "C", length: 2 }, { name: "B", type: "C", length: 2 }], records: [{ values: ["ab", "cd"] }] }));
    expect(r.diagnostics.filter((d) => d.code === "bad-field").length).toBeGreaterThanOrEqual(2);
    expect(r.stats.cells).toBe(1);
    expect(r.stats.unreadableCells).toBe(1);
  });
});
