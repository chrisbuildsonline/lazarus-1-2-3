import { describe, expect, it } from "vitest";
import { bof, eof, record, small, smallInt } from "../../../scripts/lib/wk3-writer.ts";
import { parseWk3 } from "../../../src/parser/wk3.ts";
import { concat } from "../helpers/bytes.ts";

describe("parseWk3 skipping", () => {
  it("skips an unknown opcode by its length with one diagnostic per opcode", () => {
    const r = parseWk3(concat(bof(), record(0x0007, [1, 2, 3]), record(0x0007, [4]), record(0x0014, [0, 0, 0, 0]), small(0, 0, 0, smallInt(5)), eof()));
    expect(r.stats.cells).toBe(1);
    expect(r.stats.skippedRecords).toBe(3);
    expect(r.stats.skippedByOpcode).toEqual({ 7: 2, 20: 1 });
    expect(r.diagnostics.filter((d) => d.code === "skipped-opcode").map((d) => d.opcode)).toEqual([7, 20]);
  });

  it("skips a 0x1B record of another subtype", () => {
    const r = parseWk3(concat(bof(), record(0x001b, [0xd7, 0x07, 1, 2]), eof()));
    expect(r.stats.skippedRecords).toBe(1);
    expect(r.workbook.sheets).toEqual([]);
  });

  it("stops with truncated-record at a length past the end, keeping earlier cells", () => {
    const r = parseWk3(concat(bof(), small(0, 0, 0, smallInt(5)), new Uint8Array([0x18, 0, 50, 0, 1])));
    expect(r.diagnostics.map((d) => d.code)).toEqual(["truncated-record"]);
    expect(r.stats.cells).toBe(1);
  });
});
