// decodeRpn: a stack machine over the RPN bytes of one FORMULA cell. One forward pass, no
// recursion; every iteration reads at least one byte, so it ends on any input.
// Dialect "wk1" (WK1/WKS, opcodes.ts) is the default; "wk3" reads Release 3 tokens (opcodes-wk3.ts).
import { ByteReader, a1, float80ToDouble, unpackSmall } from "../parser/index.ts";
import { MAX_DEPTH, type Expr, type Origin, type Ref } from "./ast.ts";
import { diag, type FormulaDiagnostic } from "./diagnostics.ts";
import { OPCODE_TABLE, type OpcodeEntry, type OperandName } from "./opcodes.ts";
import { WK3_OPCODE_TABLE, WK3_UNSUPPORTED_REFERENCES } from "./opcodes-wk3.ts";

export type Dialect = "wk1" | "wk3";

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
type Fault = { code: "truncated-stream" | "non-finite-constant" | "reference-out-of-grid" | "foreign-reference"; message: string };

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

/** Lotus sheet letter for a WK3 sheet byte: 0 is A, 26 is AA. */
const sheetLetter = (index: number) => a1(index, 0).slice(0, -1);

export function decodeRpn(rpn: Uint8Array, origin: Origin, dialect: Dialect = "wk1"): DecodeResult {
  const reader = new ByteReader(rpn);
  const table = dialect === "wk3" ? WK3_OPCODE_TABLE : OPCODE_TABLE;
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

  /**
   * One WK3 corner: row u16, sheet u8, column u8, stored as they are (LO ReadSRD, GN get_new_cellref).
   * `bits` is its 3-bit relbits field: bit 0 column relative, bit 1 row relative (LO; see opcodes-wk3.ts).
   */
  const readCorner3 = (bits: number): Ref | Fault | null => {
    const row = reader.u16();
    const sheet = reader.u8();
    const col = reader.u8();
    if (row === null || sheet === null || col === null) return null;
    const own = origin.sheet ?? 0;
    if (sheet !== own) {
      return { code: "foreign-reference", message: `reference to ${sheetLetter(sheet)}:${a1(col, row)} on sheet ${sheetLetter(sheet)}, not this formula's sheet ${sheetLetter(own)}` };
    }
    if (row > MAX_ROW) return { code: "reference-out-of-grid", message: `reference resolves to column ${col}, row ${row}, outside the 256 x 8192 grid` };
    return { col, row, colAbs: (bits & 1) === 0, rowAbs: (bits & 2) === 0 };
  };

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
      case "NUM10": {
        const raw = reader.slice(10);
        if (raw === null) return cut;
        const { value, exact } = float80ToDouble(raw);
        if (!Number.isFinite(value)) return { code: "non-finite-constant", message: `number constant is ${value}` };
        if (!exact) diagnostics.push(diag("constant-precision", "info", at, "10-byte constant rounded to the nearest double", op));
        return { type: "number", value };
      }
      case "SNUM": {
        const w = reader.i16();
        if (w === null) return cut;
        const { kind, value } = unpackSmall(w);
        return kind === "integer" ? { type: "int", value } : { type: "number", value };
      }
      case "CREF":
      case "RREF": {
        const bits = reader.u8();
        if (bits === null) return cut;
        const unused = name === "CREF" ? bits & ~0x07 : bits & ~0x3f;
        if (unused) diagnostics.push(diag("reserved-bits-set", "warning", at, "relbits byte has unused high bits set", op));
        const from = readCorner3(bits & 7);
        if (from === null) return cut;
        if (isFault(from)) return from;
        if (name === "CREF") return { type: "ref", ref: from };
        const to = readCorner3((bits >> 3) & 7);
        if (to === null) return cut;
        if (isFault(to)) return to;
        return { type: "range", from, to };
      }
    }
  };

  // depths[i] is the nesting depth of stack[i]: 0 for an operand, 1 + deepest child otherwise.
  const depths: number[] = [];
  const warned = new Set<number>();

  for (;;) {
    const at = reader.pos;
    const op = reader.u8();
    if (op === null) return fail(diag("truncated-stream", "error", at, "formula ends without a return token"));
    const entry = table.get(op);
    const unsupported = dialect === "wk3" ? WK3_UNSUPPORTED_REFERENCES.get(op) : undefined;
    if (unsupported) return fail(diag("reference-kind-unsupported", "error", at, `${unsupported} is not read yet`, op));
    if (!entry) {
      // Operand length is unknown, so nothing after this byte can be read safely.
      const result = fail(diag("unknown-opcode", "error", at, "opcode not in the table; decoding stops here", op));
      return { ...result, unknown: { opcode: op, offset: at } };
    }
    if (entry.status === "candidate" && !warned.has(op)) {
      warned.add(op);
      diagnostics.push(diag("unconfirmed-opcode", "warning", at, `opcode read as ${describe(entry)} from written references only, not yet seen in a real fixture`, op));
    }

    /** Pops n nodes in written order, or null on underflow. */
    const pop = (n: number): { nodes: Expr[]; depth: number } | null => {
      if (stack.length < n) return null;
      const nodes = stack.splice(stack.length - n, n);
      const depth = n === 0 ? -1 : Math.max(...depths.splice(depths.length - n, n));
      return { nodes, depth };
    };
    const underflow = (n: number) =>
      fail(diag("stack-underflow", "error", at, `token needs ${n} operands, the stack holds ${stack.length}`, op));
    const push = (e: Expr, depth: number): DecodeResult | null => {
      if (depth > MAX_DEPTH) return fail(diag("nesting-too-deep", "error", at, `formula nests deeper than ${MAX_DEPTH} levels`, op));
      stack.push(e);
      depths.push(depth);
      return null;
    };

    let stop: DecodeResult | null = null;
    switch (entry.kind) {
      case "operand": {
        const node = readOperand(entry.name, at, op);
        if (isFault(node)) return fail(diag(node.code, "error", at, node.message, op));
        stop = push(node, 0);
        break;
      }
      case "unary":
      case "paren": {
        const p = pop(1);
        if (!p) return underflow(1);
        const arg = p.nodes[0]!;
        stop = push(entry.kind === "paren" ? { type: "paren", inner: arg } : { type: "unary", op: entry.op, arg }, p.depth + 1);
        break;
      }
      case "binary": {
        const p = pop(2);
        if (!p) return underflow(2);
        stop = push({ type: "binary", op: entry.op, left: p.nodes[0]!, right: p.nodes[1]! }, p.depth + 1);
        break;
      }
      case "function": {
        let n: number;
        if (entry.arity === "variable") {
          const count = reader.u8();
          if (count === null) return fail(diag("truncated-stream", "error", at, "stream ends before the argument count byte", op));
          n = count;
        } else {
          n = entry.arity;
        }
        const p = pop(n);
        if (!p) return underflow(n);
        stop = push({ type: "call", name: entry.name, args: p.nodes }, p.depth + 1);
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
    }
    if (stop) return stop;
  }
}

function describe(entry: OpcodeEntry): string {
  switch (entry.kind) {
    case "operand":
    case "function":
      return entry.name;
    case "unary":
    case "binary":
      return entry.op;
    default:
      return entry.kind;
  }
}
