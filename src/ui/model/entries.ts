// Which inputs of one summon go to the worker, in what order (requirements 10 to 12). Content is
// judged by the parser; here only the name, the path and the size count.

/** The limits of one summon. A full WK1 sheet (8,192 rows by 256 columns) stays below 32 MiB. */
export const LIMITS = { maxEntries: 500, maxBytes: 32 * 1024 * 1024 } as const;

/** One input file: its path relative to what was dropped or picked, and an opaque handle. */
export type FoundFile<F = unknown> = { path: string; name: string; size: number; file: F };

export type SkipReason = "extension" | "too-large" | "unreadable" | "over-limit";
export type Skipped = { path: string; why: SkipReason };

export function acceptEntry(name: string): boolean {
  return /\.wk[1s]$/i.test(name);
}

const byPath = (a: { path: string }, b: { path: string }) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/** Sorts by path (code-unit order), drops repeated paths, then applies the extension and the limits. */
export function planBatch<F>(found: readonly FoundFile<F>[]): { accepted: FoundFile<F>[]; skipped: Skipped[] } {
  const sorted = [...found].sort(byPath).filter((e, i, all) => i === 0 || all[i - 1]!.path !== e.path);
  const accepted: FoundFile<F>[] = [];
  const skipped: Skipped[] = [];
  for (const e of sorted) {
    if (!acceptEntry(e.name)) skipped.push({ path: e.path, why: "extension" });
    else if (e.size > LIMITS.maxBytes) skipped.push({ path: e.path, why: "too-large" });
    else if (accepted.length >= LIMITS.maxEntries) skipped.push({ path: e.path, why: "over-limit" });
    else accepted.push(e);
  }
  return { accepted, skipped };
}

export function skippedCounts(skipped: readonly Skipped[]): Record<SkipReason, number> {
  const counts: Record<SkipReason, number> = { extension: 0, "too-large": 0, unreadable: 0, "over-limit": 0 };
  for (const s of skipped) counts[s.why]++;
  return counts;
}
