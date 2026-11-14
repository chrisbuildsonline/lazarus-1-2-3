// decodeRpn: a stack machine over the RPN bytes of one FORMULA cell. One forward pass, no
// recursion; every iteration reads at least one byte, so it ends on any input.
import { ByteReader } from "../parser/index.ts";
import type { Expr, Origin } from "./ast.ts";
import { diag, type FormulaDiagnostic } from "./diagnostics.ts";
import { OPCODE_TABLE } from "./opcodes.ts";

export type DecodeResult = {
  ast: Expr | null;
  diagnostics: FormulaDiagnostic[];
  /** The first opcode with no table entry, for the later approval queue. */
  unknown: { opcode: number; offset: number } | null;
  bytesRead: number;
};

export function decodeRpn(rpn: Uint8Array, origin: Origin): DecodeResult {
  const reader = new ByteReader(rpn);
  const diagnostics: FormulaDiagnostic[] = [];
  const stack: Expr[] = [];
  const fail = (d: FormulaDiagnostic): DecodeResult => {
    diagnostics.push(d);
    return { ast: null, diagnostics, unknown: null, bytesRead: reader.pos };
  };
  void origin;

  for (;;) {
    const at = reader.pos;
    const op = reader.u8();
    if (op === null) return fail(diag("truncated-stream", "error", at, "formula ends without a return token"));
    const entry = OPCODE_TABLE.get(op);
    if (!entry) return fail(diag("unknown-opcode", "error", at, "opcode not in the table", op));

    switch (entry.kind) {
      case "operand": {
        const v = reader.i16();
        if (v === null) return fail(diag("truncated-stream", "error", at, "stream ends inside the operand", op));
        stack.push({ type: "int", value: v });
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
