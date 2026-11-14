import { describe, expect, it } from "vitest";
import { bof, eof, integer } from "../../../scripts/lib/wk1-writer.ts";
import { getCell } from "../../../src/parser/sheet.ts";
import { parseWk1 } from "../../../src/parser/wk1.ts";
import { concat, rawRecord } from "../helpers/bytes.ts";

describe("parseWk1 skipped records", () => {
  it("skips unknown opcodes by length, counts each record and diagnoses each opcode once", () => {
    const bytes = concat(
      bof(0x0406), // 0..5
      rawRecord(0x0018, [1, 2, 3]), // 6..12
      rawRecord(0x0018, []), // 13..16
      rawRecord(0x0d00, [0x0d, 0x00, 0x07, 0x00]), // 17..24, a body that looks like a record header
      integer(0, 0, 9), // 25..35
      rawRecord(0x0018, [9]), // 36..40
      eof(),
    );
    const { sheet, diagnostics, stats } = parseWk1(bytes);
    expect(getCell(sheet, 0, 0)).toEqual({ kind: "integer", col: 0, row: 0, value: 9 });
    expect(stats.skippedRecords).toBe(4);
    expect(stats.skippedByOpcode).toEqual({ 0x0018: 3, 0x0d00: 1 });
    expect(stats.records).toBe(7);
    expect(stats.cells).toBe(1);
    expect(sheet.sawEof).toBe(true);
    expect(diagnostics).toEqual([
      expect.objectContaining({ severity: "info", code: "skipped-opcode", offset: 6, opcode: 0x0018 }),
      expect.objectContaining({ severity: "info", code: "skipped-opcode", offset: 17, opcode: 0x0d00 }),
    ]);
  });

  it("skips a BOF that is not the first record", () => {
    const { stats, diagnostics } = parseWk1(concat(bof(0x0406), bof(0x0404), eof()));
    expect(stats.skippedByOpcode).toEqual({ 0: 1 });
    expect(diagnostics).toEqual([expect.objectContaining({ code: "skipped-opcode", offset: 6, opcode: 0 })]);
  });

  it("reports a 0xFFFF length past the end as truncated-record and keeps earlier cells", () => {
    const bytes = concat(bof(0x0406), integer(1, 1, 3), rawRecord(0x0018, [1, 2, 3], 0xffff));
    const { sheet, diagnostics, stats } = parseWk1(bytes);
    expect(diagnostics).toEqual([expect.objectContaining({ severity: "error", code: "truncated-record", offset: 17, opcode: 0x0018 })]);
    expect(getCell(sheet, 1, 1)).toMatchObject({ value: 3 });
    expect(stats.skippedRecords).toBe(0);
    expect(stats.records).toBe(2);
    expect(stats.bytesRead).toBe(17);
    expect(sheet.sawEof).toBe(false);
  });
});
