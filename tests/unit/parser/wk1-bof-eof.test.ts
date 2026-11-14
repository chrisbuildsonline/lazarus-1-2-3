import { describe, expect, it } from "vitest";
import { bof, eof, integer } from "../../../scripts/lib/wk1-writer.ts";
import { parseWk1 } from "../../../src/parser/wk1.ts";
import { concat, rawRecord } from "../helpers/bytes.ts";

const codes = (bytes: Uint8Array) => parseWk1(bytes).diagnostics.map((d) => d.code);

describe("parseWk1 BOF and EOF", () => {
  it("reads 0x0404 as wks", () => {
    const bytes = concat(bof(0x0404), eof());
    const { sheet, diagnostics, stats } = parseWk1(bytes);
    expect(sheet.format).toBe("wks");
    expect(sheet.version).toBe(0x0404);
    expect(sheet.sawEof).toBe(true);
    expect(sheet.declaredDimensions).toBeNull();
    expect(sheet.cells.size).toBe(0);
    expect(diagnostics).toEqual([]);
    expect(stats).toEqual({
      records: 2,
      cells: 0,
      formulas: 0,
      labels: 0,
      numbers: 0,
      skippedRecords: 0,
      skippedByOpcode: {},
      bytesRead: bytes.length,
    });
  });

  it("reads 0x0406 as wk1", () => {
    const { sheet, diagnostics } = parseWk1(concat(bof(0x0406), eof()));
    expect(sheet.format).toBe("wk1");
    expect(sheet.version).toBe(0x0406);
    expect(diagnostics).toEqual([]);
  });

  for (const version of [0x0405, 0x1234]) {
    const hex = `0x${version.toString(16).padStart(4, "0")}`;
    it(`warns on version ${hex}, sets format unknown and keeps reading`, () => {
      const { sheet, diagnostics, stats } = parseWk1(concat(bof(version), rawRecord(0x00ff, [1, 2]), eof()));
      expect(sheet.format).toBe("unknown");
      expect(sheet.version).toBe(version);
      expect(sheet.sawEof).toBe(true);
      expect(stats.records).toBe(3);
      const warning = diagnostics.find((d) => d.code === "unknown-version");
      expect(warning).toMatchObject({ severity: "warning", offset: 0 });
      expect(warning?.message).toContain(hex);
    });

    it(`still parses an INTEGER after version ${hex}`, () => {
      const { sheet } = parseWk1(concat(bof(version), integer(2, 3, -7), eof()));
      expect(sheet.cells.get(3 * 65536 + 2)).toEqual({ kind: "integer", col: 2, row: 3, value: -7 });
    });
  }

  it("reports missing-bof when the first record is not BOF and still parses from offset 0", () => {
    const { sheet, diagnostics, stats } = parseWk1(concat(integer(0, 0, 5), eof()));
    expect(diagnostics[0]).toMatchObject({ severity: "error", code: "missing-bof", offset: 0 });
    expect(sheet.format).toBe("unknown");
    expect(sheet.version).toBeNull();
    expect(sheet.sawEof).toBe(true);
    expect(stats.records).toBe(2);
  });

  it("reports missing-bof and missing-eof for empty input", () => {
    const { sheet, diagnostics, stats } = parseWk1(new Uint8Array(0));
    expect(diagnostics.map((d) => [d.severity, d.code])).toEqual([
      ["error", "missing-bof"],
      ["warning", "missing-eof"],
    ]);
    expect(sheet.format).toBe("unknown");
    expect(stats.records).toBe(0);
    expect(stats.bytesRead).toBe(0);
  });

  it("reports missing-bof when the input is shorter than a BOF record", () => {
    const bytes = bof(0x0406).subarray(0, 5);
    const diagnostics = parseWk1(bytes).diagnostics;
    expect(diagnostics.map((d) => d.code).sort()).toEqual(["missing-bof", "truncated-record"]);
    expect(parseWk1(bytes).sheet.format).toBe("unknown");
  });

  it("reports a BOF with a 1-byte body as short-record", () => {
    const { sheet, diagnostics } = parseWk1(concat(rawRecord(0x0000, [0x06]), eof()));
    expect(diagnostics).toEqual([expect.objectContaining({ severity: "error", code: "short-record", offset: 0, opcode: 0 })]);
    expect(sheet.version).toBeNull();
    expect(sheet.format).toBe("unknown");
    expect(sheet.sawEof).toBe(true);
  });

  it("reports missing-eof when the input ends without EOF", () => {
    const bytes = bof(0x0406);
    const { sheet, diagnostics, stats } = parseWk1(bytes);
    expect(diagnostics).toEqual([expect.objectContaining({ severity: "warning", code: "missing-eof", offset: 6 })]);
    expect(sheet.sawEof).toBe(false);
    expect(stats.bytesRead).toBe(6);
  });

  it("does not add missing-eof after a truncated record", () => {
    expect(codes(concat(bof(0x0406), [0x0d, 0x00]))).toEqual(["truncated-record"]);
  });

  it("stops at EOF and reports trailing bytes with their count", () => {
    const bytes = concat(bof(0x0406), eof(), bof(0x0404), [0xaa]);
    const { sheet, diagnostics, stats } = parseWk1(bytes);
    expect(sheet.version).toBe(0x0406);
    expect(sheet.format).toBe("wk1");
    expect(stats.records).toBe(2);
    expect(stats.bytesRead).toBe(10);
    expect(diagnostics).toEqual([expect.objectContaining({ severity: "info", code: "trailing-bytes", offset: 10 })]);
    expect(diagnostics[0]?.message).toContain("7");
  });

  it("does not take a later BOF as a second version", () => {
    const { sheet } = parseWk1(concat(bof(0x0406), bof(0x0404), eof()));
    expect(sheet.version).toBe(0x0406);
    expect(sheet.format).toBe("wk1");
  });
});
