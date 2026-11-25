// The WK1/WKS formula opcode table. Filled from evidence only (steering/lotus-format.md),
// never from memory. Sources:
//   LO    LibreOffice sc/source/filter/lotus/lotform.cxx, IndexToType + IndexToToken (the
//         WK1/WKS tables, not the WK123 ones), MPL-2.0:
//         https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/lotus/lotform.cxx
//         FT_FuncVar there means a count byte follows the opcode; FT_FuncFixN means N args.
//   WSFF5 Lotus Worksheet File Format addendum (2-19-85), full opcode list, public domain:
//         https://www.mettalogic.co.uk/tim/l123/WSFF5.TXT
//         "@sum..followed by 1 byte # of args", same for avg, cnt, min, max.
//   WSFF2 Lotus Worksheet File Format, FORMULA Table 1-a..1-c:
//         https://oss.sheetjs.com/notes/lotus/WSFF2.TXT
//   Fixture bytes: .kiro/specs/formula-translator/evidence.md (real fixtures KSBASE.WK1,
//         gnome647171-1.wks, testLotus123.wks).
// `confirmed` = seen in a real fixture's bytes AND named by a written reference.
// `candidate` = written references only; decoding it adds an unconfirmed-opcode warning.
// Where the references disagree, the entry says so: WSFF2 lists @round as 0x3E and has no
// 0x3F; WSFF5 and LO both give 0x3E = @year and 0x3F = @round, so 0x3F is used.
// Concatenation 0x18 is in WSFF5 only; LO's WK1 table has 0x18 as not implemented.
// Arity of CHOOSE (count byte) is from LO only; WSFF5 names the count byte for SUM..MAX only.
import type { BinaryOp, UnaryOp } from "./ast.ts";

export type OpcodeStatus = "confirmed" | "candidate";
/** WK1 operands, then the WK3 ones (opcodes-wk3.ts): 10-byte constant, packed small number, cell and range reference. */
export type OperandName = "NUM" | "REF" | "RANGE" | "INT" | "STRING" | "NUM10" | "SNUM" | "CREF" | "RREF";

type Evidence = { opcode: number; source: string; status: OpcodeStatus };

export type OpcodeEntry =
  | (Evidence & { kind: "operand"; name: OperandName })
  | (Evidence & { kind: "unary"; op: UnaryOp })
  | (Evidence & { kind: "binary"; op: BinaryOp })
  | (Evidence & { kind: "paren" })
  | (Evidence & { kind: "return" })
  | (Evidence & { kind: "function"; name: string; arity: number | "variable" });

const REFS = "LO lotform.cxx IndexToType; WSFF5; WSFF2 Table 1";
const LO_WSFF5 = "LO lotform.cxx IndexToType; WSFF5";

const c = (opcode: number, fixture: string, refs = REFS) => ({ opcode, source: `${fixture}; ${refs}`, status: "confirmed" as const });
const k = (opcode: number, refs = REFS) => ({ opcode, source: refs, status: "candidate" as const });

const fn = (e: Evidence, name: string, arity: number | "variable"): OpcodeEntry => ({ ...e, kind: "function", name, arity });
const bin = (e: Evidence, op: BinaryOp): OpcodeEntry => ({ ...e, kind: "binary", op });
const un = (e: Evidence, op: UnaryOp): OpcodeEntry => ({ ...e, kind: "unary", op });
const opd = (e: Evidence, name: OperandName): OpcodeEntry => ({ ...e, kind: "operand", name });

export const OPCODES: readonly OpcodeEntry[] = [
  // Operands, return, parentheses (WSFF2 Table 1-a gives the operand lengths).
  opd(c(0x00, "KSBASE.WK1 O3 (0.5)"), "NUM"),
  opd(c(0x01, "testLotus123.wks C2; KSBASE.WK1 N3"), "REF"),
  opd(c(0x02, "gnome647171-1.wks A2"), "RANGE"),
  { ...c(0x03, "KSBASE.WK1, gnome647171-1.wks, testLotus123.wks: last byte of every formula"), kind: "return" },
  { ...c(0x04, "KSBASE.WK1 O3, after the add"), kind: "paren" },
  opd(c(0x05, "KSBASE.WK1 O3; gnome647171-1.wks A5"), "INT"),
  opd(c(0x06, "gnome647171-1.wks A5 (\"Odd\", \"Even\")", LO_WSFF5), "STRING"),
  // Operators (WSFF2 Table 1-b).
  un(k(0x08), "neg"),
  bin(c(0x09, "KSBASE.WK1 O3"), "add"),
  bin(k(0x0a), "sub"),
  bin(c(0x0b, "testLotus123.wks C2; KSBASE.WK1 O3"), "mul"),
  bin(k(0x0c), "div"),
  bin(k(0x0d), "pow"),
  bin(c(0x0e, "KSBASE.WK1 N3, O3; gnome647171-1.wks A5"), "eq"),
  bin(k(0x0f), "ne"),
  bin(k(0x10), "le"),
  bin(k(0x11), "ge"),
  bin(k(0x12), "lt"),
  bin(k(0x13), "gt"),
  bin(c(0x14, "KSBASE.WK1 N3"), "and"),
  bin(k(0x15), "or"),
  un(k(0x16), "not"),
  un(k(0x17), "plus"),
  bin(k(0x18, "WSFF5 only (\"24 &\"); LO lotform.cxx IndexToType has 0x18 as FT_NotImpl"), "concat"),
  // Functions with a fixed argument count (LO FT_FuncFixN; names from WSFF5 and WSFF2).
  fn(k(0x1f), "NA", 0),
  fn(k(0x20), "ERR", 0),
  fn(k(0x21), "ABS", 1),
  fn(k(0x22), "INT", 1),
  fn(k(0x23), "SQRT", 1),
  fn(k(0x26), "PI", 0),
  fn(c(0x2f, "gnome647171-1.wks A5 (two args, no count byte)"), "MOD", 2),
  fn(k(0x30, "LO lotform.cxx IndexToType FT_FuncVar (count byte: LO only); WSFF5 @sel; WSFF2 @Choose"), "CHOOSE", "variable"),
  fn(c(0x33, "KSBASE.WK1 O3 (zero args, value 0 in O4)"), "FALSE", 0),
  fn(k(0x34), "TRUE", 0),
  fn(k(0x35), "RAND", 0),
  fn(k(0x36), "DATE", 3),
  fn(k(0x37, "LO lotform.cxx IndexToType (Today, ocGetActDate); WSFF5 @now; WSFF2 @today"), "NOW", 0),
  fn(k(0x38), "PMT", 3),
  fn(k(0x39), "PV", 3),
  fn(k(0x3a), "FV", 3),
  fn(c(0x3b, "KSBASE.WK1 O3; gnome647171-1.wks A5 (three args, no count byte)"), "IF", 3),
  fn(k(0x3f, "LO lotform.cxx IndexToType; WSFF5 @round (WSFF2 Table 1-b says 0x3E; outvoted)"), "ROUND", 2),
  // Functions followed by a count byte (LO FT_FuncVar; WSFF5 for SUM..MAX).
  fn(c(0x50, "gnome647171-1.wks A2 (count 1)"), "SUM", "variable"),
  fn(k(0x51), "AVG", "variable"),
  fn(c(0x52, "gnome647171-1.wks B2 (count 1, cached 2 cells)"), "COUNT", "variable"),
  fn(k(0x53), "MIN", "variable"),
  fn(k(0x54), "MAX", "variable"),
  fn(k(0x55), "VLOOKUP", 3),
  fn(k(0x56), "NPV", 2),
  fn(c(0x58, "gnome647171-1.wks C2 (count 2, population std dev of 10 and 11.5 = 0.75)"), "STD", "variable"),
  fn(k(0x5a), "HLOOKUP", 3),
];

export const OPCODE_TABLE: ReadonlyMap<number, OpcodeEntry> = new Map(OPCODES.map((e) => [e.opcode, e]));
