// Formula diagnostics. Every message names the opcode as 0x%02X (when a token is involved)
// and the offset into the rpn array as a decimal number.
import type { Severity } from "../parser/index.ts";

export type FormulaDiagnosticCode =
  | "unknown-opcode"
  | "unconfirmed-opcode"
  | "truncated-stream"
  | "stack-underflow"
  | "stack-imbalance"
  | "trailing-bytes"
  | "reference-out-of-grid"
  | "foreign-reference"
  | "reference-kind-unsupported"
  | "reserved-bits-set"
  | "nesting-too-deep"
  | "non-finite-constant"
  | "constant-precision"
  | "no-excel-equivalent"
  | "volatile-function"
  | "semantics-note"
  | "excel-limit";

export type FormulaDiagnostic = {
  severity: Severity;
  code: FormulaDiagnosticCode;
  /** Index into the rpn array; for later stages, the end of rpn. */
  offset: number;
  opcode?: number;
  message: string;
};

export function hexOpcode(n: number): string {
  return `0x${n.toString(16).toUpperCase().padStart(2, "0")}`;
}

export function diag(code: FormulaDiagnosticCode, severity: Severity, offset: number, message: string, opcode?: number): FormulaDiagnostic {
  const where = opcode === undefined ? `at offset ${offset}` : `opcode ${hexOpcode(opcode)} at offset ${offset}`;
  const d: FormulaDiagnostic = { severity, code, offset, message: `${message} (${where})` };
  if (opcode !== undefined) d.opcode = opcode;
  return d;
}
