// The totals surface and the proof bar (requirements 27 to 30). Counts come from golden.json, never
// from what the markup printed.
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProofBar } from "../../../../src/ui/components/ProofBar.tsx";
import { TotalsSurface } from "../../../../src/ui/components/TotalsSurface.tsx";
import type { Totals } from "../../../../src/verify/index.ts";

const golden = JSON.parse(readFileSync("tests/differential/verify/golden.json", "utf8")) as Record<string, Totals>;
const KSBASE = golden["fixtures/ksbase/KSBASE.WK1"]!;
const HONEST = "Unverifiable cells are not wrong; we could not prove them. The report lists each one and why.";
const totals = (matched: number, mismatched: number, unverifiable: number): Totals => ({
  formulas: matched + mismatched + unverifiable,
  matched,
  mismatched,
  unverifiable,
  exact: matched,
  withinTolerance: 0,
  byReason: {},
});

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const tileValues = (html: string) => [...html.matchAll(/class="tile__value[^"]*"[^>]*>([^<]*)</g)].map((m) => m[1]);

describe("TotalsSurface", () => {
  it("KSBASE (golden.json: 160 of 160): 100.0%, 160, 0, 0, three pills, the proof bar label", () => {
    expect(KSBASE.matched).toBe(160);
    const html = renderToStaticMarkup(<TotalsSurface totals={KSBASE} />);
    expect(tileValues(html)).toEqual(["100.0%", "160", "0", "0"]);
    expect(html.match(/class="pill pill--/g)).toHaveLength(3);
    for (const s of ["Matched", "Mismatched", "Unverifiable"]) expect(html).toContain(`>${s}<`);
    expect(text(html)).toContain("Verified");
    expect(html).toMatch(/role="img"[^>]*aria-label="160 matched, 0 mismatched, 0 unverifiable"|aria-label="160 matched, 0 mismatched, 0 unverifiable"[^>]*role="img"/);
    expect(html).not.toContain(HONEST);
  });

  it("the proof bar is described by the visible counts through aria-describedby", () => {
    const html = renderToStaticMarkup(<TotalsSurface totals={KSBASE} />);
    const id = /role="img"[^>]*aria-describedby="([^"]+)"|aria-describedby="([^"]+)"[^>]*role="img"/.exec(html);
    expect(id).not.toBeNull();
    const ref = (id![1] ?? id![2])!;
    expect(html).toContain(`id="${ref}"`);
  });

  it("shows the unverifiable line only when the count is above 0", () => {
    expect(renderToStaticMarkup(<TotalsSurface totals={totals(3, 0, 1)} />)).toContain(HONEST);
    expect(renderToStaticMarkup(<TotalsSurface totals={totals(3, 1, 0)} />)).not.toContain(HONEST);
  });

  it("an empty sheet reads No formulas and three zero counts", () => {
    const html = renderToStaticMarkup(<TotalsSurface totals={totals(0, 0, 0)} />);
    expect(tileValues(html)).toEqual(["No formulas", "0", "0", "0"]);
    expect(html).not.toMatch(/class="proof__seg/);
  });

  it("large counts are grouped: 1180 of 1204 reads 98.0% and 1,180", () => {
    const html = renderToStaticMarkup(<TotalsSurface totals={totals(1180, 3, 21)} />);
    expect(tileValues(html)).toEqual(["98.0%", "1,180", "3", "21"]);
  });
});

describe("ProofBar", () => {
  const segments = (html: string) => [...html.matchAll(/class="proof__seg proof__seg--(\w+)"[^>]*style="flex-grow:([^;"]+)/g)].map((m) => [m[1], Number(m[2])] as const);

  it("one segment per non-zero count, in order matched, mismatched, unverifiable, none of zero width", () => {
    const html = renderToStaticMarkup(<ProofBar totals={totals(1180, 3, 21)} />);
    const segs = segments(html);
    expect(segs.map(([s]) => s)).toEqual(["matched", "mismatched", "unverifiable"]);
    for (const [, f] of segs) expect(f).toBeGreaterThan(0);
    // 1180 / 1204, 3 / 1204, 21 / 1204: the widths sum to 1.
    expect(segs.reduce((a, [, f]) => a + f, 0)).toBeCloseTo(1, 12);
    expect(segs[0]![1]).toBeCloseTo(1180 / 1204, 12);
  });

  it("KSBASE has a single matched segment", () => {
    const segs = segments(renderToStaticMarkup(<ProofBar totals={KSBASE} />));
    expect(segs).toEqual([["matched", 1]]);
  });

  it("holds no colour literal in its inline style", () => {
    expect(renderToStaticMarkup(<ProofBar totals={totals(1, 1, 1)} />)).not.toMatch(/style="[^"]*(#|rgb|hsl)/i);
  });
});

describe("TotalsSurface during the verification sweep (seance-visuals requirements 19, 21)", () => {
  const engine = totals(3, 2, 1);
  const partial: Totals = { ...totals(1, 1, 0), formulas: 6 };

  it("without the sweep props the markup has no trace of it", () => {
    const html = renderToStaticMarkup(<TotalsSurface totals={engine} />);
    expect(html).not.toMatch(/visually-hidden|is-sweeping|class="totals__tiles"[^>]*aria-hidden/);
  });

  it("shows the partial figures hidden from assistive tech, and the engine figures in a visually hidden line", () => {
    const html = renderToStaticMarkup(<TotalsSurface totals={engine} partial={partial} running />);
    // 1 of 6 matched: 166.6 tenths, floor 166: 16.6%.
    expect(tileValues(html)).toEqual(["16.6%", "1", "1", "0"]);
    expect(html).toMatch(/class="totals__tiles"[^>]*aria-hidden="true"/);
    const hidden = /class="visually-hidden"[^>]*>([^<]*)</.exec(html)![1]!;
    expect(hidden).toContain("50.0%");
    expect(hidden).toContain("3 matched, 2 mismatched, 1 unverifiable");
    expect(/role="img" aria-label="([^"]*)"/.exec(html)![1]).toBe("3 matched, 2 mismatched, 1 unverifiable");
  });

  it("the proof bar fills over the engine's formula count, from empty", () => {
    const segs = [...renderToStaticMarkup(<TotalsSurface totals={engine} partial={partial} running />).matchAll(/proof__seg--(\w+)"[^>]*style="flex-grow:([^;"]+)/g)].map((m) => [m[1], Number(m[2])]);
    expect(segs).toEqual([
      ["matched", 1 / 6],
      ["mismatched", 1 / 6],
    ]);
    const empty = renderToStaticMarkup(<TotalsSurface totals={engine} partial={{ ...totals(0, 0, 0), formulas: 6 }} running />);
    expect(empty).not.toMatch(/proof__seg--/);
  });
});
