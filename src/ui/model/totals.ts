// Verified percentage, headline, proof bar and its text (requirements 27 to 29). Counts come from
// SheetVerification.totals as they are; nothing here recounts cells.
import type { Status, Totals } from "../../verify/index.ts";
import { COPY } from "../copy.ts";
import { formatNumber } from "./format-value.ts";

/** The totals of several sheets added up, for a batch row of a multi-sheet file. */
export function sumTotals(list: readonly Totals[]): Totals {
  const t: Totals = { formulas: 0, matched: 0, mismatched: 0, unverifiable: 0, exact: 0, withinTolerance: 0, byReason: {} };
  for (const x of list) {
    for (const k of ["formulas", "matched", "mismatched", "unverifiable", "exact", "withinTolerance"] as const) t[k] += x[k];
    for (const [code, n] of Object.entries(x.byReason)) t.byReason[code as keyof Totals["byReason"]] = (t.byReason[code as keyof Totals["byReason"]] ?? 0) + n;
  }
  return t;
}

/** floor(matched / formulas * 1000) in integers, so 100.0% means every formula matched. */
export function percentVerified(t: Totals): { kind: "none" } | { kind: "pct"; tenths: number } {
  if (t.formulas === 0) return { kind: "none" };
  return { kind: "pct", tenths: Math.floor((t.matched * 1000) / t.formulas) };
}

export function formatTenths(tenths: number): string {
  return `${Math.floor(tenths / 10)}.${tenths % 10}%`;
}

export function headline(t: Totals): string {
  const p = percentVerified(t);
  return p.kind === "none" ? COPY.noFormulas : formatTenths(p.tenths);
}

export const STATUS_ORDER: readonly Status[] = ["matched", "mismatched", "unverifiable"];

export function proofSegments(t: Totals): { status: Status; fraction: number }[] {
  if (t.formulas === 0) return [];
  return STATUS_ORDER.filter((s) => t[s] > 0).map((s) => ({ status: s, fraction: t[s] / t.formulas }));
}

export function describeTotals(t: Totals): string {
  return STATUS_ORDER.map((s) => `${formatNumber(t[s])} ${s}`).join(", ");
}
