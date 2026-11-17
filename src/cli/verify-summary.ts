// The verify summary for one file (requirements 70 to 73): recalculates its formulas through
// src/verify and counts the results. The one file in src/cli that parses cells.
import { verifyBytes, type Totals } from "../verify/index.ts";

export type VerifySummary = Totals & { parseErrors: number };

export const VERIFY_NOTICE = "lazarus: verify: formulas are recalculated and compared with the values stored in the file. Stored values are never changed.";

/** The counts for a WK1/WKS file, or null when the bytes are not one. */
export function summarizeFile(bytes: Uint8Array): VerifySummary | null {
  const { diagnostics, verification } = verifyBytes(bytes);
  if (verification.format === "unknown") return null;
  return { ...verification.totals, parseErrors: diagnostics.filter((d) => d.severity === "error").length };
}

/** The text-mode field, one more tab-separated field on the file's line. */
export function formatSummary(s: VerifySummary): string {
  const errors = s.parseErrors > 0 ? ` (parser errors: ${s.parseErrors})` : "";
  return `verify: ${s.formulas} formulas, ${s.matched} matched, ${s.mismatched} mismatched, ${s.unverifiable} unverifiable${errors}`;
}

/** The `--json` object: the summary, without parseErrors when there are none. */
export function summaryJson({ parseErrors, ...totals }: VerifySummary): Totals | VerifySummary {
  return parseErrors > 0 ? { ...totals, parseErrors } : totals;
}
