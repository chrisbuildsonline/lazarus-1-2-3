// Parser diagnostics and a capped sink, so a hostile file cannot flood the result.

export type Severity = "error" | "warning" | "info";

export type DiagnosticCode =
  | "truncated-record"
  | "short-record"
  | "missing-bof"
  | "unknown-version"
  | "missing-eof"
  | "trailing-bytes"
  | "unknown-label-prefix"
  | "duplicate-cell"
  | "address-out-of-range"
  | "skipped-opcode"
  | "diagnostics-truncated"
  | "unknown-format"
  | "duplicate-sheet-name"
  | "value-rounded"
  | "bad-header"
  | "bad-field"
  | "unsupported-field-type"
  | "invalid-number"
  | "deleted-record"
  | "truncated-table"
  | "row-limit"
  | "memo-not-read"
  | "code-page-not-decoded";

export type Diagnostic = { severity: Severity; code: DiagnosticCode; offset: number; message: string; opcode?: number };

export const MAX_DIAGNOSTICS = 1000;

export class DiagnosticSink {
  readonly list: Diagnostic[] = [];
  private readonly max: number;

  constructor(max = MAX_DIAGNOSTICS) {
    this.max = max;
  }

  add(d: Diagnostic): void {
    if (this.list.length < this.max) {
      this.list.push(d);
    } else if (this.list.length === this.max) {
      this.list.push({
        severity: "warning",
        code: "diagnostics-truncated",
        offset: d.offset,
        message: `more than ${this.max} diagnostics; later ones are dropped`,
      });
    }
  }
}
