// Declarative specs for the synthetic WK1 fixtures. Plain constants only, so the
// generator output is byte-stable. Every cached value here is what the file stores.
import type { CellSpec } from "./wk1-writer.ts";

export type FixtureSpec = {
  name: string;
  /** BOF version word. */
  version: number;
  cells: CellSpec[];
  /** A1 addresses whose stored values go into the manifest's expectedValues. */
  expect: string[];
};

// BOF version for .wk1 files. Public documentation gives 0x0406 for WK1 (1-2-3 Release 2)
// and 0x0404 for WKS (Release 1A); lotus-format.md lists them the other way round and asks
// for confirmation from a real file.
export const WK1_VERSION = 0x0406;

const int = (col: number, row: number, value: number): CellSpec => ({ kind: "integer", col, row, value });
const num = (col: number, row: number, value: number): CellSpec => ({ kind: "number", col, row, value });
const lbl = (col: number, row: number, prefix: "'" | '"' | "^", text: string): CellSpec => ({ kind: "label", col, row, prefix, text });

// RPN token opcodes, each confirmed twice: by the WK1/WKS opcode table in LibreOffice
// sc/source/filter/lotus/lotform.cxx (MPL-2.0), and by the bytes of a real fixture:
const NUM = 0x00; // 8-byte double. KSBASE.WK1 O3 has "00 00..e03f" = 0.5 inside 0.5*(J3+J4)
const REF = 0x01; // cell reference, col u16 + row u16. testLotus123.wks C2..C11 = A*B
const RANGE = 0x02; // range, two corners. gnome647171-1.wks A2 = @SUM(A1..B1)
const RET = 0x03; // end of formula. Last byte of every real formula seen
const PAREN = 0x04; // parentheses marker, display only. KSBASE.WK1 O3, right after the add
const INT = 0x05; // 2-byte integer. KSBASE.WK1 O3 (N3=1), gnome647171-1.wks A5
const ADD = 0x09; // KSBASE.WK1 O3 (J3+J4)
const MUL = 0x0b; // testLotus123.wks C2 = A2*B2, cached 1*10 = 10, C3 cached 2*9 = 18
const SUM = 0x50; // @SUM, followed by an argument count byte. gnome647171-1.wks A2, cached 10+11.5 = 21.5
// Relative references set bit 15 and store a signed offset from the formula cell.
// KSBASE.WK1 writes col -5 as 0xBFFB and row -1 as 0xBFFF; LibreOffice reads the low
// 8 bits (col) and 13 bits (WK1 row) as signed, so offset & 0x3FFF decodes the same.
const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
const rel = (offset: number) => u16(0x8000 | (offset & 0x3fff));
const ref = (dc: number, dr: number) => [REF, ...rel(dc), ...rel(dr)];
const range = (dc1: number, dr1: number, dc2: number, dr2: number) => [RANGE, ...rel(dc1), ...rel(dr1), ...rel(dc2), ...rel(dr2)];
const f64 = (v: number) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, v, true);
  return [NUM, ...b];
};
const fml = (col: number, row: number, cached: number, rpn: number[]): CellSpec => ({ kind: "formula", col, row, cached, rpn: [...rpn, RET] });

const LONG_TEXT ="Lotus 1-2-3 kept this label on one line, however wide the column was. ".repeat(3).trimEnd();

export const SPECS: FixtureSpec[] = [
  {
    name: "basic-values",
    version: WK1_VERSION,
    cells: [
      int(0, 0, 0),
      int(1, 0, 1),
      int(2, 0, -1),
      int(3, 0, 32767),
      int(4, 0, -32768),
      num(0, 1, 3.14159),
      num(1, 1, -2.5),
      num(2, 1, 0.1),
      num(3, 1, 1234567.125),
      num(4, 1, 1e100),
      num(0, 2, -0.000001),
      num(1, 2, 6.02214076e23),
    ],
    expect: ["D1", "B2", "C2"],
  },
  {
    name: "labels",
    version: WK1_VERSION,
    cells: [
      lbl(0, 0, "'", "Left"),
      lbl(1, 0, '"', "Right"),
      lbl(2, 0, "^", "Center"),
      lbl(0, 1, "'", ""),
      lbl(1, 1, '"', ""),
      lbl(2, 1, "^", ""),
      lbl(0, 2, "'", LONG_TEXT),
      lbl(0, 3, "'", "Punctuation: !#$%&()*+,-./:;<=>?[]_{}~"),
    ],
    expect: ["A1", "B1", "C1", "A2"],
  },
  {
    name: "formulas",
    version: WK1_VERSION,
    cells: [
      int(0, 0, 10),
      int(1, 0, 20),
      num(2, 0, 2.5),
      fml(0, 1, 30, [...ref(0, -1), ...ref(1, -1), ADD]), // A2: +A1+B1
      fml(1, 1, 25, [...ref(-1, -1), ...ref(1, -1), MUL]), // B2: +A1*C1
      fml(2, 1, 32.5, [...range(-2, -1, 0, -1), SUM, 1]), // C2: @SUM(A1..C1)
      fml(0, 2, 60, [...ref(0, -2), ...ref(1, -2), ADD, PAREN, INT, ...u16(2), MUL]), // A3: (A1+B1)*2
      fml(1, 2, 10, [...f64(0.5), ...ref(0, -2), MUL]), // B3: 0.5*B1
      fml(2, 2, 147.5, [...range(-2, -1, 0, -1), SUM, 1, ...ref(-2, 0), ADD]), // C3: @SUM(A2..C2)+A3
    ],
    expect: ["A2", "C2", "A3", "B3", "C3"],
  },
  {
    // Date serials stored as plain numbers (1900-01-01 = 1, serial 60 is the
    // nonexistent 1900-02-29). Column B says what each serial means.
    name: "dates",
    version: WK1_VERSION,
    cells: [
      int(0, 0, 1),
      lbl(1, 0, "'", "1900-01-01"),
      int(0, 1, 59),
      lbl(1, 1, "'", "1900-02-28"),
      int(0, 2, 60),
      lbl(1, 2, "'", "1900-02-29, a day that never existed"),
      int(0, 3, 61),
      lbl(1, 3, "'", "1900-03-01"),
      num(0, 4, 60),
      lbl(1, 4, "'", "serial 60 again, stored as a NUMBER record"),
      num(0, 5, 36585),
      lbl(1, 5, "'", "2000-02-29, leap day"),
      num(0, 6, 45351.5),
      lbl(1, 6, "'", "2024-02-29 at noon"),
      fml(0, 7, 36586, [...ref(0, -2), INT, ...u16(1), ADD]), // A8: +A6+1
      lbl(1, 7, "'", "2000-03-01, the day after the leap day"),
    ],
    expect: ["A3", "A5", "A6", "A8"],
  },
  {
    // Small sheet with every cell record kind; the main smoke input.
    name: "mixed",
    version: WK1_VERSION,
    cells: [
      lbl(0, 0, "'", "Item"),
      lbl(1, 0, '"', "Qty"),
      lbl(2, 0, '"', "Price"),
      lbl(3, 0, "^", "Total"),
      lbl(0, 1, "'", "Apples"),
      int(1, 1, 3),
      num(2, 1, 0.5),
      fml(3, 1, 1.5, [...ref(-2, 0), ...ref(-1, 0), MUL]), // D2: +B2*C2
      lbl(0, 2, "'", "Pears"),
      int(1, 2, 4),
      num(2, 2, 0.75),
      fml(3, 2, 3, [...ref(-2, 0), ...ref(-1, 0), MUL]), // D3: +B3*C3
      lbl(0, 3, "'", "Total"),
      fml(1, 3, 7, [...range(0, -2, 0, -1), SUM, 1]), // B4: @SUM(B2..B3)
      fml(3, 3, 4.5, [...range(0, -2, 0, -1), SUM, 1]), // D4: @SUM(D2..D3)
    ],
    expect: ["A2", "B2", "C2", "D2", "D4"],
  },
];
