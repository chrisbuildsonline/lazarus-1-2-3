import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bof, eof, label, name, writeWk1 } from "../../../scripts/lib/wk1-writer.ts";
import { readNames } from "../../../src/macro/names.ts";
import { concat, rawRecord } from "../helpers/bytes.ts";

describe("name() encoder", () => {
  it("writes opcode 0x0B, length 24, the name NUL-padded and four u16 values", () => {
    const r = name("\\P", 5, 0, 5, 3);
    expect(r.length).toBe(28);
    expect([...r.subarray(0, 4)]).toEqual([0x0b, 0, 24, 0]);
    expect([...r.subarray(4, 8)]).toEqual([0x5c, 0x50, 0, 0]);
    expect([...r.subarray(20, 28)]).toEqual([5, 0, 0, 0, 5, 0, 3, 0]);
  });
  it("refuses a name of 16 characters, which leaves no NUL", () => {
    expect(() => name("ABCDEFGHIJKLMNOP", 0, 0, 0, 0)).toThrow(RangeError);
  });
  it("writeWk1 without names keeps its old output", () => {
    const cells = [{ kind: "label" as const, col: 0, row: 0, prefix: "'" as const, text: "x" }];
    expect(writeWk1(0x0406, cells, [])).toEqual(writeWk1(0x0406, cells));
  });
});

describe("readNames", () => {
  it("reads every NAME record with its range", () => {
    const bytes = concat(bof(0x0406), name("\\0", 1, 2, 1, 2), name("REVENUES", 0, 0, 1, 3), label(0, 0, "'", "a"), eof());
    expect(readNames(bytes)).toEqual({
      names: [
        { name: "\\0", startCol: 1, startRow: 2, endCol: 1, endRow: 2 },
        { name: "REVENUES", startCol: 0, startRow: 0, endCol: 1, endRow: 3 },
      ],
      notes: [],
    });
  });
  it("stops at EOF and reads nothing after it", () => {
    expect(readNames(concat(bof(0x0406), eof(), name("\\A", 0, 0, 0, 0))).names).toEqual([]);
  });
  it("skips a short NAME record with a note", () => {
    const r = readNames(concat(bof(0x0406), rawRecord(0x0b, [0x41, 0]), eof()));
    expect(r.names).toEqual([]);
    expect(r.notes).toEqual(["NAME record at 0x0006 is 2 bytes; 24 expected, skipped"]);
  });
  it("reads the first 24 bytes of a long NAME record with a note", () => {
    const long = concat(name("\\A", 0, 0, 0, 0).subarray(4), new Uint8Array(2));
    const r = readNames(concat(rawRecord(0x0b, [...long]), eof()));
    expect(r.names).toEqual([{ name: "\\A", startCol: 0, startRow: 0, endCol: 0, endRow: 0 }]);
    expect(r.notes).toEqual(["NAME record at 0x0000 is 26 bytes; first 24 read"]);
  });
  it("keeps the later of two records with the same name, with a note", () => {
    const r = readNames(concat(name("\\a", 0, 0, 0, 0), name("\\A", 3, 3, 3, 3)));
    expect(r.names).toEqual([{ name: "\\A", startCol: 3, startRow: 3, endCol: 3, endRow: 3 }]);
    expect(r.notes).toEqual(["two ranges are named \\A; the later one is kept"]);
  });
  it("notes a record that runs past the end and stops", () => {
    const r = readNames(concat(bof(0x0406), new Uint8Array([0x0b, 0, 24, 0, 1, 2])));
    expect(r).toEqual({ names: [], notes: ["record at 0x0006 runs past the end"] });
  });
  it("reads a 16-byte name that has no NUL", () => {
    const body = [...Array.from("ABCDEFGHIJKLMNOP", (c) => c.charCodeAt(0)), 0, 0, 0, 0, 0, 0, 0, 0];
    expect(readNames(rawRecord(0x0b, body)).names[0]!.name).toBe("ABCDEFGHIJKLMNOP");
  });
  it("does not import the WK1 parser", () => {
    const src = readFileSync(new URL("../../../src/macro/names.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/wk1/);
  });
});
