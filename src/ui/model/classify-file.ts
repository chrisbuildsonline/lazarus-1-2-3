// What the app does with one answer of the worker (requirements 20, 21).
import type { Diagnostic } from "../../parser/index.ts";
import type { RaisedFile } from "../../workers/verify-protocol.ts";
import { COPY } from "../copy.ts";

const MAX_LINES = 50;

export function diagnosticLine(d: Diagnostic): string {
  return `offset 0x${d.offset.toString(16).toUpperCase().padStart(4, "0")}  ${d.message}`;
}

export function classifyRaised(file: RaisedFile): { kind: "raised" } | { kind: "unsupported" } | { kind: "failed"; lines: string[] } {
  if (file.verification.format === "unknown") return { kind: "unsupported" };
  const errors = file.diagnostics.filter((d) => d.severity === "error");
  if (file.sheet.cells.length > 0 || errors.length === 0) return { kind: "raised" };
  const lines = errors.slice(0, MAX_LINES).map(diagnosticLine);
  if (errors.length > MAX_LINES) lines.push(COPY.andMore(errors.length - MAX_LINES));
  return { kind: "failed", lines };
}
