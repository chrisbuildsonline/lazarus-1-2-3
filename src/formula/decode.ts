// decodeRpn: a stack machine over the RPN bytes of one FORMULA cell. One forward pass, no
// recursion; every iteration reads at least one byte, so it ends on any input.
import { ByteReader } from "../parser/index.ts";
import type { Expr, Origin, Ref } from "./ast.ts";
import { diag, type FormulaDiagnostic } from "./diagnostics.ts";
import { OPCODE_TABLE, type OperandName } from "./opcodes.ts";

export type DecodeResult = {
  ast: Expr | null;
  diagnostics: FormulaDiagnostic[];
  /** The first opcode with no table entry, for the later approval queue. */
  unknown: { opcode: number; offset: number } | null;
  bytesRead: number;
};

const MAX_COL = 255;
const MAX_ROW = 8191;

/** Why an operand could not be read; null fields mean success. */
type Fault = { code: "truncated-stream" | "non-finite-constant" | "reference-out-of-grid"; message: string };

const signed = (v: number, bits: number) => (v & (1 << (bits - 1)) ? v - (1 << bits) : v);

/**
 * One coordinate word (requirements 21 to 23). Bit 15 set = relative: the low `bits` bits are a
 * signed offset from the origin. Absolute: the low `bits` bits are the coordinate. The bits above
 * the field up to bit 14 must be zero (absolute) or copies of the field's sign bit (relative,
 * bits up to 13; bit 14 zero), the pattern KSBASE.WK1 and the fixture writer use.
 */
function coord(w: number, bits: number, origin: number): { value: number; abs: boolean; reserved: boolean } {
  const field = w & ((1 << bits) - 1);
  const high = w & 0x7fff & ~((1 << bits) - 1);
  if ((w & 0x8000) === 0) return { value: field, abs: true, reserved: high !== 0 };
  const sign = field >> (bits - 1);
  const expected = sign ? 0x3fff & ~((1 << bits) - 1) : 0;
  return { value: signed(field, bits) + origin, abs: false, reserved: high !== expected };
}

export function decodeRpn(rpn: Uint8Array, origin: Origin): DecodeResult {
  const reader = new ByteReader(rpn);
  const diagnostics: FormulaDiagnostic[] = [];
  const stack: Expr[] = [];
  const fail = (d: FormulaDiagnostic): DecodeResult => {
    diagnostics.push(d);
    return { ast: null, diagnostics, unknown: null, bytesRead: reader.pos };
  };

  /** Reads a column word and a row word; null when the stream ends. */
  const readRef = (at: number, op: number): Ref | Fault | null => {
    const cw = reader.u16();
    const rw = reader.u16();
    if (cw === null || rw === null) return null;
    const c = coord(cw, 8, origin.col);
    const r = coord(rw, 13, origin.row);
    if (c.reserved || r.reserved) {
      diagnostics.push(diag("reserved-bits-set", "warning", at, "reference word has unused high bits set that do not match its mode", op));
    }
    if (c.value < 0 || c.value > MAX_COL || r.value < 0 || r.value > MAX_ROW) {
      return { code: "reference-out-of-grid", message: `reference resolves to column ${c.value}, row ${r.value}, outside the 256 x 8192 grid` };
    }
    return { col: c.value, row: r.value, colAbs: c.abs, rowAbs: r.abs };
  };

  const isFault = (x: object): x is Fault => "code" in x;

  const readOperand = (name: OperandName, at: number, op: number): Expr | Fault => {
    const cut: Fault = { code: "truncated-stream", message: "stream ends inside the operand" };
    switch (name) {
      case "NUM": {
        const v = reader.f64();
        if (v === null) return cut;
        if (!Number.isFinite(v)) return { code: "non-finite-constant", message: `number constant is ${v}` };
        return { type: "number", value: v };
      }
      case "INT": {
        const v = reader.i16();
        return v === null ? cut : { type: "int", value: v };
      }
      case "STRING": {
        let text = "";
        for (;;) {
          const b = reader.u8();
          if (b === null) return { code: "truncated-stream", message: "string has no terminating 0x00" };
          if (b === 0) return { type: "string", value: text };
          text += String.fromCharCode(b);
        }
      }
      case "REF": {
        const r = readRef(at, op);
        if (r === null) return cut;
        return isFault(r) ? r : { type: "ref", ref: r };
      }
      case "RANGE": {
        const from = readRef(at, op);
        if (from === null) return cut;
        const to = readRef(at, op);
        if (to === null) return cut;
        if (isFault(from)) return from;
        if (isFault(to)) return to;
        return { type: "range", from, to };
      }
    }
  };

  for (;;) {
    const at = reader.pos;
    const op = reader.u8();
    if (op === null) return fail(diag("truncated-stream", "error", at, "formula ends without a return token"));
    const entry = OPCODE_TABLE.get(op);
    if (!entry) return fail(diag("unknown-opcode", "error", at, "opcode not in the table", op));

    switch (entry.kind) {
      case "operand": {
        const node = readOperand(entry.name, at, op);
        if (isFault(node)) return fail(diag(node.code, "error", at, node.message, op));
        stack.push(node);
        break;
      }
      case "return": {
        if (stack.length !== 1) {
          return fail(diag("stack-imbalance", "error", at, `return token with ${stack.length} nodes on the stack, expected 1`, op));
        }
        const rest = reader.remaining();
        if (rest > 0) diagnostics.push(diag("trailing-bytes", "info", reader.pos, `${rest} bytes after the return token`));
        return { ast: stack[0]!, diagnostics, unknown: null, bytesRead: reader.pos };
      }
      default:
        return fail(diag("unknown-opcode", "error", at, "opcode not in the table", op));
    }
  }
}
