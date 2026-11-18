// The verify summary for one file (requirements 70 to 73): recalculates its formulas through
// src/verify and counts the results, summed over the sheets. The one file in src/cli that parses cells.
import { sumTotals, verifyWorkbookBytes, type Totals } from "../verify/index.ts";

export type VerifySummary = Totals & { parseErrors: number };

export const VERIFY_NOTICE = "lazarus: verify: formulas are recalculated and compared with the values stored in the file. Stored values are never changed.";

/** The counts for a WK1, WKS, WK3 or DBF file, or null when the bytes are none of these. */
export function summarizeFile(bytes: Uint8Array): VerifySummary | null {
  const { diagnostics, verifications } = verifyWorkbookBytes(bytes);
  if (verifications.length === 0 || verifications[0]!.format === "unknown") return null;
  return { ...sumTotals(verifications.map((v) => v.totals)), parseErrors: diagnostics.filter((d) => d.severity === "error").length };
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
