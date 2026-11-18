import { describe, expect, it } from "vitest";
import { writeDbf } from "../../../scripts/lib/dbf-writer.ts";
import { parseDbf } from "../../../src/parser/dbf.ts";
import { SAMPLE_DBF } from "../helpers/dbf-sample.ts";

const codes = (r: ReturnType<typeof parseDbf>) => r.diagnostics.map((d) => d.code);

describe("parseDbf header", () => {
  it("reads version, date, counts, lengths and code page into table (SAMPLE_DBF, hand-built)", () => {
    const r = parseDbf(SAMPLE_DBF);
    expect(r.table).toEqual({
      version: 0x03,
      lastUpdate: { year: 2026, month: 11, day: 14 },
      declaredRecords: 2,
      headerLength: 97,
      recordLength: 19,
      codePage: 0,
      fields: [
        { name: "NAME", type: "C", length: 10, decimals: 0 },
        { name: "PRICE", type: "N", length: 8, decimals: 2 },
      ],
    });
    expect(r.workbook.format).toBe("dbf");
    expect(r.workbook.sheets.map((s) => s.name)).toEqual(["Table"]);
    const sheet = r.workbook.sheets[0]!.sheet;
    expect(sheet.format).toBe("dbf");
    expect(sheet.version).toBe(0x03);
    expect(sheet.declaredDimensions).toBeNull();
    expect(r.diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
  });

  it("keeps the year byte as 1900 plus the byte, unvalidated", () => {
    expect(parseDbf(writeDbf({ lastUpdate: [255, 13, 40], fields: [{ name: "A", type: "C", length: 1 }], records: [] })).table.lastUpdate).toEqual({
      year: 2155,
      month: 13,
      day: 40,
    });
  });

  it("is quiet about code page 0x03 and diagnoses 0x65 once, keeping the raw byte", () => {
    const quiet = parseDbf(writeDbf({ codePage: 0x03, fields: [{ name: "A", type: "C", length: 1 }], records: [{ values: ["x"] }] }));
    expect(codes(quiet)).not.toContain("code-page-not-decoded");
    const dos = parseDbf(writeDbf({ codePage: 0x65, fields: [{ name: "A", type: "C", length: 1 }], records: [{ values: ["x"] }] }));
    expect(dos.table.codePage).toBe(0x65);
    expect(dos.diagnostics.filter((d) => d.code === "code-page-not-decoded")).toHaveLength(1);
    expect(dos.diagnostics.find((d) => d.code === "code-page-not-decoded")!.severity).toBe("info");
  });
});
