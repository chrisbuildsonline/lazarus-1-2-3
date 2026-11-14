// The WK1/WKS formula opcode table. Filled from evidence only (steering/lotus-format.md).
import type { BinaryOp, UnaryOp } from "./ast.ts";

export type OpcodeStatus = "confirmed" | "candidate";
export type OperandName = "NUM" | "REF" | "RANGE" | "INT" | "STRING";

type Evidence = { opcode: number; source: string; status: OpcodeStatus };

export type OpcodeEntry =
  | (Evidence & { kind: "operand"; name: OperandName })
  | (Evidence & { kind: "unary"; op: UnaryOp })
  | (Evidence & { kind: "binary"; op: BinaryOp })
  | (Evidence & { kind: "paren" })
  | (Evidence & { kind: "return" })
  | (Evidence & { kind: "function"; name: string; arity: number | "variable" });

export const OPCODES: readonly OpcodeEntry[] = [
  { opcode: 0x03, kind: "return", source: "", status: "confirmed" },
  { opcode: 0x05, kind: "operand", name: "INT", source: "", status: "confirmed" },
];

export const OPCODE_TABLE: ReadonlyMap<number, OpcodeEntry> = new Map(OPCODES.map((e) => [e.opcode, e]));
