import { describe, expect, it } from "vitest";
import { bof, eof, small, smallInt, writeWk3 } from "../../../scripts/lib/wk3-writer.ts";
import { parseWk3 } from "../../../src/parser/wk3.ts";
import { concat } from "../helpers/bytes.ts";

const codes = (r: ReturnType<typeof parseWk3>) => r.diagnostics.map((d) => d.code);

describe("parseWk3 BOF and EOF", () => {
  it("reads version 0x1000 quietly and keeps it on each sheet", () => {
    const r = parseWk3(writeWk3([small(0, 0, 0, smallInt(1))]));
    expect(r.diagnostics).toEqual([]);
    expect(r.workbook.sheets[0]!.sheet.version).toBe(0x1000);
  });

  it("warns unknown-version for another version and keeps parsing", () => {
    const r = parseWk3(writeWk3([small(0, 0, 0, smallInt(1))], 0x1003));
    expect(codes(r)).toEqual(["unknown-version"]);
    expect(r.stats.cells).toBe(1);
  });

  it("reports missing-bof, missing-eof and trailing-bytes as WK1 does", () => {
    expect(codes(parseWk3(concat(small(0, 0, 0, smallInt(1)), eof())))).toContain("missing-bof");
    expect(codes(parseWk3(concat(bof(), small(0, 0, 0, smallInt(1)))))).toContain("missing-eof");
    const trailing = parseWk3(concat(writeWk3([]), new Uint8Array([1, 2])));
    expect(codes(trailing)).toEqual(["trailing-bytes"]);
    expect(trailing.stats.bytesRead).toBe(writeWk3([]).length);
  });

  it("gives short-record for a cell body shorter than its layout", () => {
    const cut = new Uint8Array([0x17, 0x00, 0x06, 0x00, 0, 0, 0, 0, 1, 2]); // NUMBER with 6 of 14 bytes
    const r = parseWk3(concat(bof(), cut, eof()));
    expect(codes(r)).toEqual(["short-record"]);
    expect(r.stats.cells).toBe(0);
  });
});
