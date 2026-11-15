// Test-only: a Lotus AST to WK1 RPN bytes, using the opcode table, to feed the property
// generators. Not used for the per-token unit tests, which use literal bytes from evidence.md.
// Relative words are written the KSBASE.WK1 way: 0x8000 | (offset & 0x3FFF). Throws on a tree
// it cannot encode (an offset that does not fit, a name not in the table).
import type { Expr, Origin, Ref } from "../../../src/formula/ast.ts";
import { OPCODES, type OpcodeEntry } from "../../../src/formula/opcodes.ts";

const find = (test: (e: OpcodeEntry) => boolean, what: string): OpcodeEntry => {
  const e = OPCODES.find(test);
  if (!e) throw new Error(`no opcode for ${what}`);
  return e;
};
const operand = (name: string) => find((e) => e.kind === "operand" && e.name === name, name).opcode;
const kind = (k: string) => find((e) => e.kind === k, k).opcode;

const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];

function word(value: number, abs: boolean, origin: number, bits: number): number[] {
  if (abs) return u16(value);
  const offset = value - origin;
  if (offset < -(1 << (bits - 1)) || offset >= 1 << (bits - 1)) throw new Error(`offset ${offset} does not fit ${bits} bits`);
  return u16(0x8000 | (offset & 0x3fff));
}

const refBytes = (r: Ref, o: Origin) => [...word(r.col, r.colAbs, o.col, 8), ...word(r.row, r.rowAbs, o.row, 13)];

function tokens(e: Expr, o: Origin): number[] {
  switch (e.type) {
    case "number": {
      const b = new Uint8Array(8);
      new DataView(b.buffer).setFloat64(0, e.value, true);
      return [operand("NUM"), ...b];
    }
    case "int":
      return [operand("INT"), ...u16(e.value)];
    case "string":
      return [operand("STRING"), ...[...e.value].map((c) => c.charCodeAt(0)), 0];
    case "ref":
      return [operand("REF"), ...refBytes(e.ref, o)];
    case "range":
      return [operand("RANGE"), ...refBytes(e.from, o), ...refBytes(e.to, o)];
    case "paren":
      return [...tokens(e.inner, o), kind("paren")];
    case "unary":
      return [...tokens(e.arg, o), find((x) => x.kind === "unary" && x.op === e.op, e.op).opcode];
    case "binary":
      return [...tokens(e.left, o), ...tokens(e.right, o), find((x) => x.kind === "binary" && x.op === e.op, e.op).opcode];
    case "call": {
      const f = find((x) => x.kind === "function" && x.name === e.name, e.name);
      const count = f.kind === "function" && f.arity === "variable" ? [e.args.length] : [];
      return [...e.args.flatMap((a) => tokens(a, o)), f.opcode, ...count];
    }
  }
}

export function encodeRpn(e: Expr, origin: Origin): Uint8Array {
  return Uint8Array.from([...tokens(e, origin), kind("return")]);
}
