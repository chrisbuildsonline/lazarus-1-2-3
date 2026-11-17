// Writes tests/differential/verify/golden.json: the measured verification totals of every real
// wk1/wks fixture with formulas. Existing findings are kept by (reason, rule); a new group gets an
// empty finding, which fails golden.test.ts until a human writes one. Run: bun run verify:golden
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { verifyBytes, type CellResult, type ReasonCode, type Totals } from "../src/verify/index.ts";

export const GOLDEN = "tests/differential/verify/golden.json";
const MANIFEST = "fixtures/manifest.json";
const EXAMPLES = 5;

export type GoldenGroup = { reason: ReasonCode; rule: string | null; count: number; examples: string[]; finding: string };
export type GoldenFixture = Totals & { maxRelativeDifference: number; candidateOpcodes: number[]; groups: GoldenGroup[] };

type Entry = { path: string; format: string; origin: "real" | "synthetic"; counts: { formulas: number } };

/** Real wk1/wks fixtures of the manifest that hold at least one formula, sorted by path. */
export function realFixtures(): string[] {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as { fixtures: Entry[] };
  return manifest.fixtures
    .filter((e) => e.origin === "real" && (e.format === "wk1" || e.format === "wks") && e.counts.formulas > 0)
    .map((e) => e.path)
    .sort();
}

function relativeDifference(c: CellResult): number {
  if (c.cached?.t !== "num" || c.recalculated?.t !== "num") return 0;
  const [a, b] = [c.cached.v, c.recalculated.v];
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return a === b || scale === 0 ? 0 : Math.abs(a - b) / scale;
}

/** The measured golden entry for one fixture, with empty findings. */
export function measure(path: string): GoldenFixture {
  const { cells, totals } = verifyBytes(new Uint8Array(readFileSync(path)), path).verification;
  const matched = cells.filter((c) => c.status === "matched");
  const groups = new Map<string, GoldenGroup>();
  for (const c of cells) {
    if (c.status === "matched") continue;
    const rule = c.reason.rule ?? null;
    const key = `${c.reason.code} ${rule}`;
    const g = groups.get(key) ?? { reason: c.reason.code, rule, count: 0, examples: [], finding: "" };
    g.count++;
    if (g.examples.length < EXAMPLES) g.examples.push(c.address);
    groups.set(key, g);
  }
  return {
    ...totals,
    maxRelativeDifference: matched.reduce((m, c) => Math.max(m, relativeDifference(c)), 0),
    candidateOpcodes: [...new Set(matched.flatMap((c) => c.candidateOpcodes))].sort((a, b) => a - b),
    groups: [...groups.values()].sort((a, b) => (`${a.reason} ${a.rule}` < `${b.reason} ${b.rule}` ? -1 : 1)),
  };
}

function main(): void {
  const old = existsSync(GOLDEN) ? (JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, GoldenFixture>) : {};
  const out: Record<string, GoldenFixture> = {};
  for (const path of realFixtures()) {
    const m = measure(path);
    for (const g of m.groups) g.finding = old[path]?.groups.find((o) => o.reason === g.reason && o.rule === g.rule)?.finding ?? "";
    out[path] = m;
    console.log(`${path}: ${m.formulas} formulas, ${m.matched} matched (${m.exact} exact, ${m.withinTolerance} within tolerance), ${m.mismatched} mismatched, ${m.unverifiable} unverifiable`);
  }
  writeFileSync(GOLDEN, `${JSON.stringify(out, null, 2)}\n`);
  const empty = Object.values(out).flatMap((f) => f.groups).filter((g) => g.finding === "").length;
  console.log(`wrote ${GOLDEN}${empty ? `; ${empty} group(s) need a finding` : ""}`);
}

if (import.meta.main) main();
