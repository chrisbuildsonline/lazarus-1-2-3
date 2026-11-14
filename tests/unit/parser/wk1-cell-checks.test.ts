import { describe, expect, it } from "vitest";
import { bof, eof, integer, label, number } from "../../../scripts/lib/wk1-writer.ts";
import { getCell } from "../../../src/parser/sheet.ts";
import { parseWk1 } from "../../../src/parser/wk1.ts";
import { concat } from "../helpers/bytes.ts";

describe("parseWk1 duplicate cells", () => {
  it("keeps the later cell, warns, and counts both records", () => {
    const bytes = concat(bof(0x0406), integer(2, 3, 1), label(2, 3, "'", "later"), eof());
    const { sheet, diagnostics, stats } = parseWk1(bytes);
    expect(getCell(sheet, 2, 3)).toEqual({ kind: "label", col: 2, row: 3, prefix: "'", text: "later" });
    expect(sheet.cells.size).toBe(1);
    expect(stats).toMatchObject({ cells: 2, numbers: 1, labels: 1 });
    expect(diagnostics).toEqual([expect.objectContaining({ severity: "warning", code: "duplicate-cell", offset: 17, opcode: 0x000f })]);
    expect(diagnostics[0]?.message).toContain("C4");
  });
});

describe("parseWk1 address range", () => {
  it("keeps a cell at column 256 with a warning", () => {
    const { sheet, diagnostics } = parseWk1(concat(bof(0x0406), number(256, 0, 1.5), eof()));
    expect(getCell(sheet, 256, 0)).toEqual({ kind: "number", col: 256, row: 0, value: 1.5 });
    expect(diagnostics).toEqual([expect.objectContaining({ severity: "warning", code: "address-out-of-range", offset: 6, opcode: 0x000e })]);
  });

  it("keeps a cell at row 8192 with a warning", () => {
    const { sheet, diagnostics } = parseWk1(concat(bof(0x0406), integer(0, 8192, 4), eof()));
    expect(getCell(sheet, 0, 8192)).toMatchObject({ value: 4 });
    expect(diagnostics.map((d) => d.code)).toEqual(["address-out-of-range"]);
  });

  it("does not warn at the grid's last cell IV8192", () => {
    const { diagnostics } = parseWk1(concat(bof(0x0406), integer(255, 8191, 4), eof()));
    expect(diagnostics).toEqual([]);
  });
});
