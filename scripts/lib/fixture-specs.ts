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

const LONG_TEXT = "Lotus 1-2-3 kept this label on one line, however wide the column was. ".repeat(3).trimEnd();

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
];
