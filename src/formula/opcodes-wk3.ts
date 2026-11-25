// The WK3 (Lotus 1-2-3 Release 3) formula token table. Filled from two independent readers, never
// from memory (copies in docs/sources/wk3/):
//   LO  LibreOffice sc/source/filter/lotus/lotform.cxx, LotusToSc::Convert with bWK3 set,
//       IndexToTypeWK123 + IndexToTokenWK123, ReadSRD, MPL-2.0:
//       https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/lotus/lotform.cxx
//   GN  Gnumeric plugins/lotus-123/lotus-formula.c, lotus_parse_formula_new, get_new_cellref and
//       functions_lotus, GPL-2-or-3 (read, not copied):
//       https://gitlab.gnome.org/GNOME/gnumeric/-/raw/master/plugins/lotus-123/lotus-formula.c
// Differences from WK1: 0x00 is a 10-byte constant (LO ScfTools::ReadLongDouble, GN lotus_load_treal),
// 0x01/0x02 carry a relbits byte and row u16, sheet u8, column u8 per corner with the coordinates
// stored as they are (not as offsets), 0x05 is a packed 16-bit small number (LO SnumToDouble, GN
// lotus_smallnum: WK3 is version 0x1000 <= 0x1002, so 16 bits), and the operators move to 0x0E..0x1E.
// Relbits: LO ReadSRD reads bit 0 = column relative, bit 1 = row relative, bit 2 = sheet relative;
// GN get_new_cellref reads bit 0 as row. The real file m3.wk3 settles it for LO: its relbits-6
// reference to column C stays on C in the formulas of columns U and V and follows the row (U9..U41).
// Range relbits (GN): low 3 bits for the first corner, bits 3-5 for the second.
// 0x07..0x0B (named and error references) are known tokens this program does not read.
// Function numbers 0x1F..0x5A are the WK1 numbers with the WK1 arities in both LO (IndexToTypeWK123)
// and GN (functions_lotus); only the functions the WK1 table already has (and the evaluator knows) are
// listed, so anything else stays an unknown opcode, never a guess.
// `confirmed` = seen in a real WK3 fixture's bytes AND named by LO and GN; `candidate` otherwise.
import type { BinaryOp, UnaryOp } from "./ast.ts";
import { OPCODES, type OpcodeEntry, type OperandName } from "./opcodes.ts";

const REFS = "LO lotform.cxx IndexToTypeWK123/IndexToTokenWK123; GN lotus-formula.c lotus_parse_formula_new";
const FUNCS = "LO lotform.cxx IndexToTypeWK123 (same number and arity as WK1); GN lotus-formula.c functions_lotus";

/** Opcodes read from the real NOAA files (fixtures/noaa-ala-wai-m3/m3.wk3, noaa-ala-wai-m21/m21tab.wk3). */
const SEEN: ReadonlyMap<number, string> = new Map([
  [0x01, "m3.wk3 U9, m21tab.wk3 T44"],
  [0x03, "m3.wk3, m21tab.wk3: last byte of every formula"],
  [0x04, "m3.wk3 U9"],
  [0x05, "m3.wk3 U9 (0x0014 = 10), m21tab.wk3 U45 (0x004D = 0.25)"],
  [0x0f, "m3.wk3 E59"],
  [0x10, "m3.wk3 U9, m21tab.wk3 U45"],
  [0x11, "m3.wk3 U9, m21tab.wk3 T44"],
  [0x12, "m3.wk3 U9, m21tab.wk3 T44"],
  [0x1d, "m3.wk3 U9"],
]);

const ev = (opcode: number, refs = REFS) => {
  const seen = SEEN.get(opcode);
  return seen ? { opcode, source: `${seen}; ${refs}`, status: "confirmed" as const } : { opcode, source: refs, status: "candidate" as const };
};
const opd = (opcode: number, name: OperandName): OpcodeEntry => ({ ...ev(opcode), kind: "operand", name });
const bin = (opcode: number, op: BinaryOp): OpcodeEntry => ({ ...ev(opcode), kind: "binary", op });
const un = (opcode: number, op: UnaryOp): OpcodeEntry => ({ ...ev(opcode), kind: "unary", op });

/** Named range (0x07, 0x08) and error references (0x09..0x0B): LO FT_Nrref, FT_Absnref, FT_Erref, FT_Ecref, FT_Econstant. */
export const WK3_UNSUPPORTED_REFERENCES: ReadonlyMap<number, string> = new Map([
  [0x07, "named range reference"],
  [0x08, "absolute named range reference"],
  [0x09, "error range reference"],
  [0x0a, "error cell reference"],
  [0x0b, "error constant"],
]);

export const WK3_OPCODES: readonly OpcodeEntry[] = [
  opd(0x00, "NUM10"),
  opd(0x01, "CREF"),
  opd(0x02, "RREF"),
  { ...ev(0x03), kind: "return" },
  { ...ev(0x04), kind: "paren" },
  opd(0x05, "SNUM"),
  opd(0x06, "STRING"),
  un(0x0e, "neg"),
  bin(0x0f, "add"),
  bin(0x10, "sub"),
  bin(0x11, "mul"),
  bin(0x12, "div"),
  bin(0x13, "pow"),
  bin(0x14, "eq"),
  bin(0x15, "ne"),
  bin(0x16, "le"),
  bin(0x17, "ge"),
  bin(0x18, "lt"),
  bin(0x19, "gt"),
  bin(0x1a, "and"),
  bin(0x1b, "or"),
  // LO FT_FuncFix1 ocNot, GN LOTUS_FORMULA_OP_NOT: one operand, as the WK1 #NOT#.
  un(0x1c, "not"),
  // LO FT_NOP, GN LOTUS_FORMULA_OP_UPLU: kept as unary plus, as WK1 0x17.
  un(0x1d, "plus"),
  bin(0x1e, "concat"),
  ...OPCODES.flatMap((e): OpcodeEntry[] => (e.kind === "function" ? [{ ...e, ...ev(e.opcode, FUNCS) }] : [])),
];

export const WK3_OPCODE_TABLE: ReadonlyMap<number, OpcodeEntry> = new Map(WK3_OPCODES.map((e) => [e.opcode, e]));
