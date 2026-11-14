import { describe, expect, it } from "vitest";
import { bof, eof, label } from "../../../scripts/lib/wk1-writer.ts";
import { getCell } from "../../../src/parser/sheet.ts";
import { parseWk1 } from "../../../src/parser/wk1.ts";
import { concat, rawRecord } from "../helpers/bytes.ts";

/** LABEL A1 with format 0xFF and the given bytes after the address. */
const rawLabel = (after: readonly number[]) => rawRecord(0x000f, [0xff, 0, 0, 0, 0, ...after]);
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const parse = (record: Uint8Array) => parseWk1(concat(bof(0x0406), record, eof()));

describe("parseWk1 LABEL", () => {
  for (const prefix of ["'", '"', "^", "\\", "|"]) {
    it(`keeps the ${prefix} prefix apart from the text`, () => {
      const { sheet, diagnostics, stats } = parse(rawLabel([...ascii(`${prefix}Total`), 0]));
      expect(getCell(sheet, 0, 0)).toEqual({ kind: "label", col: 0, row: 0, prefix, text: "Total" });
      expect(diagnostics).toEqual([]);
      expect(stats).toMatchObject({ cells: 1, labels: 1, numbers: 0, formulas: 0 });
    });
  }

  it("reads a label the writer made, at its address", () => {
    const { sheet } = parse(label(3, 4, "^", "Center me"));
    expect(getCell(sheet, 3, 4)).toEqual({ kind: "label", col: 3, row: 4, prefix: "^", text: "Center me" });
  });

  it("keeps an unknown prefix byte and warns", () => {
    const { sheet, diagnostics } = parse(rawLabel([...ascii("Xyz"), 0]));
    expect(getCell(sheet, 0, 0)).toEqual({ kind: "label", col: 0, row: 0, prefix: "X", text: "yz" });
    expect(diagnostics).toEqual([expect.objectContaining({ severity: "warning", code: "unknown-label-prefix", offset: 6, opcode: 0x000f })]);
  });

  it("reads prefix + NUL as an empty label", () => {
    const { sheet, diagnostics } = parse(rawLabel([0x27, 0]));
    expect(getCell(sheet, 0, 0)).toEqual({ kind: "label", col: 0, row: 0, prefix: "'", text: "" });
    expect(diagnostics).toEqual([]);
  });

  it("reads a prefix with nothing after it as an empty label", () => {
    expect(getCell(parse(rawLabel([0x5e])).sheet, 0, 0)).toEqual({ kind: "label", col: 0, row: 0, prefix: "^", text: "" });
  });

  it("decodes bytes at 0x80 and above as Latin-1 with no loss", () => {
    const { sheet } = parse(rawLabel([0x27, 0x80, 0xa3, 0xe9, 0xff, 0x41, 0]));
    expect(getCell(sheet, 0, 0)).toMatchObject({ text: "\u0080£éÿA" });
  });

  it("reads text with no NUL terminator up to the end of the body", () => {
    const { sheet, diagnostics } = parse(rawLabel(ascii("'Hi")));
    expect(getCell(sheet, 0, 0)).toMatchObject({ prefix: "'", text: "Hi" });
    expect(diagnostics).toEqual([]);
  });

  it("stops the text at the first NUL", () => {
    expect(getCell(parse(rawLabel([...ascii("'ab"), 0, ...ascii("cd"), 0])).sheet, 0, 0)).toMatchObject({ text: "ab" });
  });

  it("decodes a long label exactly", () => {
    const text = Array.from({ length: 20000 }, (_, i) => String.fromCharCode(0x20 + (i % 0xdf))).join("");
    const cell = getCell(parse(rawLabel([0x27, ...ascii(text), 0])).sheet, 0, 0);
    const read = cell?.kind === "label" ? cell.text : "";
    expect(read.length).toBe(text.length);
    expect(read === text).toBe(true);
  });

  it("reports a 5-byte body as short-record, adds no cell and keeps going", () => {
    const { sheet, diagnostics, stats } = parseWk1(concat(bof(0x0406), rawLabel([]), label(1, 0, "'", "ok"), eof()));
    expect(diagnostics).toEqual([expect.objectContaining({ severity: "error", code: "short-record", offset: 6, opcode: 0x000f })]);
    expect(getCell(sheet, 0, 0)).toBeUndefined();
    expect(getCell(sheet, 1, 0)).toMatchObject({ text: "ok" });
    expect(stats).toMatchObject({ cells: 1, labels: 1 });
  });
});
