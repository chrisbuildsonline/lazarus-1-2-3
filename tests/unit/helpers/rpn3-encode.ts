// Test-only: a Lotus AST to WK3 RPN bytes, to feed the property generators. Operand and operator
// numbers are written out here from LO lotform.cxx IndexToTypeWK123 (not read from src/formula);
// function numbers are the WK1 ones (src/formula/opcodes.ts), which LO and GN keep for WK3.
// Every ref is written on `sheet`; ints as packed small numbers, numbers as 10-byte constants.
import type { Expr, Ref } from "../../../src/formula/ast.ts";
import { OPCODES } from "../../../src/formula/opcodes.ts";
import { encode80 } from "../../../scripts/lib/wk3-writer.ts";

const BINARY: Record<string, number> = { add: 0x0f, sub: 0x10, mul: 0x11, div: 0x12, pow: 0x13, eq: 0x14, ne: 0x15, le: 0x16, ge: 0x17, lt: 0x18, gt: 0x19, and: 0x1a, or: 0x1b, concat: 0x1e };
const UNARY: Record<string, number> = { neg: 0x0e, not: 0x1c, plus: 0x1d };

const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
const bits = (r: Ref, sheetRel: boolean) => (r.colAbs ? 0 : 1) | (r.rowAbs ? 0 : 2) | (sheetRel ? 4 : 0);
const corner = (r: Ref, sheet: number) => [...u16(r.row), sheet, r.col];

function tokens(e: Expr, sheet: number, sheetRel: boolean): number[] {
  switch (e.type) {
    case "number":
      return [0x00, ...encode80(e.value)];
    case "int":
      if (e.value < -16384 || e.value > 16383) throw new Error(`int ${e.value} does not fit a packed small number`);
      return [0x05, ...u16((e.value << 1) & 0xffff)];
    case "string":
      return [0x06, ...[...e.value].map((c) => c.charCodeAt(0)), 0];
    case "ref":
      return [0x01, bits(e.ref, sheetRel), ...corner(e.ref, sheet)];
    case "range":
      return [0x02, bits(e.from, sheetRel) | (bits(e.to, sheetRel) << 3), ...corner(e.from, sheet), ...corner(e.to, sheet)];
    case "paren":
      return [...tokens(e.inner, sheet, sheetRel), 0x04];
    case "unary":
      return [...tokens(e.arg, sheet, sheetRel), UNARY[e.op]!];
    case "binary":
      return [...tokens(e.left, sheet, sheetRel), ...tokens(e.right, sheet, sheetRel), BINARY[e.op]!];
    case "call": {
      const f = OPCODES.find((x) => x.kind === "function" && x.name === e.name);
      if (!f || f.kind !== "function") throw new Error(`no opcode for ${e.name}`);
      const count = f.arity === "variable" ? [e.args.length] : [];
      return [...e.args.flatMap((a) => tokens(a, sheet, sheetRel)), f.opcode, ...count];
    }
  }
}

export function encodeRpn3(e: Expr, sheet: number, sheetRel = true): Uint8Array {
  return Uint8Array.from([...tokens(e, sheet, sheetRel), 0x03]);
}
