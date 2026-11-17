// Byte-identical output (requirements 24 to 26).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cellKey, type Cell, type Sheet } from "../../../src/parser/index.ts";
import { verifySheet } from "../../../src/verify/index.ts";
import { writeXlsx } from "../../../src/xlsx/index.ts";

const cells: Cell[] = [
  { kind: "number", col: 0, row: 0, value: 1.25 },
  { kind: "label", col: 1, row: 0, prefix: "^", text: "title" },
  { kind: "integer", col: 0, row: 1, value: 7 },
  { kind: "number", col: 2, row: 3, value: -Infinity },
];
const sheetOf = (list: Cell[]): Sheet => ({ format: "wk1", version: null, sawEof: true, declaredDimensions: null, cells: new Map(list.map((c) => [cellKey(c.col, c.row), c])) });
const write = (list: Cell[]) => {
  const sheet = sheetOf(list);
  return writeXlsx({ sheet, verification: verifySheet(sheet) }).then((r) => r.bytes);
};

/** Byte equality that reports a short message instead of two 8 KB arrays. */
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

afterEach(() => {
  vi.useRealTimers();
});

describe("determinism", () => {
  it("gives equal bytes for the same input and for any Map insertion order", async () => {
    const a = await write(cells);
    expect(same(await write(cells), a)).toBe(true);
    expect(same(await write([...cells].reverse()), a)).toBe(true);
  });

  it("gives equal bytes whatever the system time", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.UTC(2001, 0, 1, 13, 37, 42)));
    const a = await write(cells);
    vi.setSystemTime(new Date(Date.UTC(2031, 5, 15, 7, 5, 9)));
    const b = await write(cells);
    // Without normalizeZipTimestamps this fails: only the DOS time and date of each header differ.
    expect(same(b, a)).toBe(true);
  });

  it("stamps 1980-01-01 in the first central directory header", async () => {
    const bytes = await write(cells);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = bytes.length - 22;
    while (view.getUint32(eocd, true) !== 0x06054b50) eocd--;
    const central = view.getUint32(eocd + 16, true);
    expect(view.getUint32(central, true)).toBe(0x02014b50);
    expect(view.getUint16(central + 12, true)).toBe(0x0000);
    expect(view.getUint16(central + 14, true)).toBe(0x0021);
  });
});
