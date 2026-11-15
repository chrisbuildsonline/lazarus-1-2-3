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

// BOF version for .wk1 files. The real fixtures confirm 0x0406 for WK1 (KSBASE.WK1, 92stlde.wk1)
// and 0x0404 for WKS (testLotus123.wks, gnome647171-1.wks); lotus-format.md lists them reversed.
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
const i16 = (v: number) => [INT, ...u16(v)];

// Function opcodes no real fixture uses yet, so they stay `candidate` in src/formula/opcodes.ts:
// one written source each (LibreOffice lotform.cxx IndexToType, WSFF5), not the decoder.
// A count byte follows the variable ones (FT_FuncVar).
const F = { ABS: 0x21, INT: 0x22, SQRT: 0x23, PI: 0x26, CHOOSE: 0x30, TRUE: 0x34, DATE: 0x36, PMT: 0x38, PV: 0x39, FV: 0x3a, ROUND: 0x3f };
const V = { AVG: 0x51, MIN: 0x53, MAX: 0x54, VLOOKUP: 0x55, NPV: 0x56, HLOOKUP: 0x5a };

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
  {
    // One formula per function that no real fixture uses, cached values worked out by hand with
    // inputs that are exact in binary. NA, ERR, NOW and RAND are left out: their stored value is
    // a special or volatile one that cannot be worked out by hand.
    name: "functions",
    version: WK1_VERSION,
    cells: [
      int(0, 0, 2), // A1
      num(1, 0, -7.5), // B1
      int(2, 0, 16), // C1
      int(4, 0, 1), // E1..F3: a vertical lookup table
      int(5, 0, 100),
      int(4, 1, 2),
      int(5, 1, 200),
      int(4, 2, 3),
      int(5, 2, 300),
      int(4, 4, 1), // E5..G6: a horizontal lookup table
      int(5, 4, 2),
      int(6, 4, 3),
      int(4, 5, 10),
      int(5, 5, 20),
      int(6, 5, 30),
      int(7, 0, 150), // H1..H2: cash flows
      int(7, 1, 220),
      // A10: @AVG(A1..C1) = (2 - 7.5 + 16) / 3 = 10.5 / 3 = 3.5
      fml(0, 9, 3.5, [...range(0, -9, 2, -9), V.AVG, 1]),
      // A11: @MIN(A1..C1) = -7.5
      fml(0, 10, -7.5, [...range(0, -10, 2, -10), V.MIN, 1]),
      // A12: @MAX(A1..C1) = 16
      fml(0, 11, 16, [...range(0, -11, 2, -11), V.MAX, 1]),
      // A13: @ABS(B1) = 7.5
      fml(0, 12, 7.5, [...ref(1, -12), F.ABS]),
      // A14: @INT(B1) = -7, Lotus truncates toward zero
      fml(0, 13, -7, [...ref(1, -13), F.INT]),
      // A15: @SQRT(C1) = 4
      fml(0, 14, 4, [...ref(2, -14), F.SQRT]),
      // A16: @ROUND(@PI, 2) = 3.14 (pi = 3.14159...)
      fml(0, 15, 3.14, [F.PI, ...i16(2), F.ROUND]),
      // A17: @TRUE = 1
      fml(0, 16, 1, [F.TRUE]),
      // A18: @DATE(92, 3, 1) = 1992-03-01. 2000-01-01 is 36526, so 1990-01-01 is 36526 - 3652 =
      // 32874 (two leap days, 1992 and 1996); + 730 for 1990 and 1991 + 31 (Jan) + 29 (Feb) = 33664
      fml(0, 17, 33664, [...i16(92), ...i16(3), ...i16(1), F.DATE]),
      // A19: @PMT(3000, 1, 2) = 3000 * 1 / (1 - 2^-2) = 3000 / 0.75 = 4000
      fml(0, 18, 4000, [...i16(3000), ...i16(1), ...i16(2), F.PMT]),
      // A20: @PV(4000, 1, 2) = 4000 * (1 - 2^-2) / 1 = 3000
      fml(0, 19, 3000, [...i16(4000), ...i16(1), ...i16(2), F.PV]),
      // A21: @FV(4000, 1, 2) = 4000 * (2^2 - 1) / 1 = 12000
      fml(0, 20, 12000, [...i16(4000), ...i16(1), ...i16(2), F.FV]),
      // A22: @NPV(1, H1..H2) = 150 / 2 + 220 / 4 = 75 + 55 = 130
      fml(0, 21, 130, [...i16(1), ...range(7, -21, 7, -20), V.NPV]),
      // A23: @CHOOSE(1, 10, 20, 30) = 20, the index counts from 0
      fml(0, 22, 20, [...i16(1), ...i16(10), ...i16(20), ...i16(30), F.CHOOSE, 4]),
      // A24: @VLOOKUP(2, E1..F3, 1) = 200: row with key 2, offset 1 from the key column
      fml(0, 23, 200, [...i16(2), ...range(4, -23, 5, -21), ...i16(1), V.VLOOKUP]),
      // A25: @HLOOKUP(3, E5..G6, 1) = 30: column with key 3, offset 1 from the key row
      fml(0, 24, 30, [...i16(3), ...range(4, -20, 6, -19), ...i16(1), V.HLOOKUP]),
    ],
    expect: ["A10", "A14", "A19", "A23", "A24"],
  },
];
