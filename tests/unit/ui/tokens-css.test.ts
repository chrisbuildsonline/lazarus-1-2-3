// src/ui/tokens.css against the css block of design/DESIGN.md section 2 (requirement 73), and the
// seance palette with its contrast pairs (seance-visuals requirements 1 to 8).
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOKENS } from "../../../src/report/tokens.ts";

const declarations = (css: string) => [...css.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()] as const);

/** Only the :root block, so the reduced-motion overrides do not count as second values. */
const rootBlock = (css: string) => /:root\s*\{([\s\S]*?)\n\}/.exec(css)![1]!;

const designCss = (() => {
  const md = readFileSync("design/DESIGN.md", "utf8");
  const section = md.slice(md.indexOf("## 2. Tokens"));
  return /```css\n([\s\S]*?)```/.exec(section)![1]!;
})();

/** The paper block: the light palette the downloadable report keeps (seance-visuals requirement 7). */
const paperCss = (() => {
  const md = readFileSync("design/DESIGN.md", "utf8");
  const section = md.slice(md.indexOf("### Paper palette (HTML report)"));
  return /```css\n([\s\S]*?)```/.exec(section)![1]!;
})();

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const normalise = (css: string) => stripComments(css).replace(/\s+/g, " ").trim();

describe("src/ui/tokens.css", () => {
  it("exists", () => {
    expect(existsSync("src/ui/tokens.css")).toBe(true);
  });

  const ui = () => readFileSync("src/ui/tokens.css", "utf8");

  it("holds every custom property of DESIGN.md section 2 with the same value, and nothing else", () => {
    const want = new Map(declarations(rootBlock(designCss)));
    const got = new Map(declarations(rootBlock(ui())));
    expect(new Set(got.keys())).toEqual(new Set(want.keys()));
    for (const [name, value] of want) expect(got.get(name), name).toBe(value);
    expect(declarations(rootBlock(ui())).length).toBe(want.size);
  });

  it("is the whole block, including the reduced-motion rule and the body rule", () => {
    expect(normalise(ui())).toBe(normalise(designCss));
  });

  it("every TOKENS entry of src/report/tokens.ts equals the paper block for its names and the file for the rest", () => {
    const got = new Map(declarations(rootBlock(ui())));
    const paper = new Map(declarations(rootBlock(paperCss)));
    for (const [name, value] of Object.entries(TOKENS)) expect(paper.get(name) ?? got.get(name), name).toBe(value);
  });

  it("is imported exactly once, in src/ui/main.tsx", () => {
    const main = readFileSync("src/ui/main.tsx", "utf8");
    expect(main.match(/import\s+["']\.\/tokens\.css["']/g)?.length).toBe(1);
  });
});

// ---------- the seance palette (seance-visuals requirements 1 to 8) ----------

const SEANCE: Record<string, string> = {
  canvas: "#0d0b14",
  surface: "#17141f",
  "surface-sunken": "#211d2c",
  text: "#efeaf6",
  "text-muted": "#a59fb7",
  accent: "#9d8cff",
  "accent-ink": "#b9adff",
  "accent-soft": "#2a2448",
  primary: "#f4e9d4",
  "on-primary": "#15111c",
  "status-matched-mark": "#4fe39a",
  "status-matched-fg": "#86f0b4",
  "status-matched-bg": "#11291f",
  "status-mismatched-mark": "#ff6b86",
  "status-mismatched-fg": "#ffa3b5",
  "status-mismatched-bg": "#3a1622",
  "status-unverifiable-mark": "#8f89a3",
  "status-unverifiable-fg": "#bdb7cc",
  "status-unverifiable-bg": "#25222f",
};

/** WCAG 2.x relative luminance contrast of two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

type Pair = [fg: string, bg: string, need: number];
const TEXT = 4.5;
const GRAPHIC = 3;
const on = (fg: string, bgs: string[], need: number): Pair[] => bgs.map((bg) => [fg, bg, need]);
const STATUS = ["matched", "mismatched", "unverifiable"] as const;

/** The pairs of the seance-visuals design.md "Contrast pairs" table. */
export const PAIRS: Pair[] = [
  ...on("text", ["canvas", "surface", "surface-sunken", "accent-soft", "status-mismatched-bg", "status-matched-bg"], TEXT),
  ...on("text-muted", ["canvas", "surface", "surface-sunken", "accent-soft", "status-mismatched-bg", "status-matched-bg"], TEXT),
  ["on-primary", "primary", TEXT],
  ...on("accent-ink", ["canvas", "surface", "surface-sunken", "accent-soft"], TEXT),
  ...STATUS.map((s): Pair => [`status-${s}-fg`, `status-${s}-bg`, TEXT]),
  ...on("danger", ["surface", "danger-soft"], TEXT),
  ...on("ghost-ink", ["surface", "surface-sunken"], TEXT),
  ...STATUS.flatMap((s) => on(`status-${s}-mark`, ["canvas", "surface", "surface-sunken", `status-${s}-bg`], GRAPHIC)),
  ...on("accent", ["canvas", "surface", "surface-sunken", "accent-soft", "status-matched-bg", "status-mismatched-bg"], GRAPHIC),
];

describe("the seance palette", () => {
  const tokens = () => new Map(declarations(rootBlock(readFileSync("src/ui/tokens.css", "utf8"))));

  it("is the default: tokens.css holds the seance values and a dark colour scheme", () => {
    const got = tokens();
    for (const [name, value] of Object.entries(SEANCE)) expect(got.get(name), name).toBe(value);
    expect(rootBlock(readFileSync("src/ui/tokens.css", "utf8"))).toMatch(/color-scheme:\s*dark;/);
  });

  it("the contrast helper bites below the limit", () => {
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrast("#646a7b", "#ffffff")).toBeCloseTo(5.4, 1);
    const weak: Pair = ["#5a5466", "#17141f", TEXT];
    expect(contrast(weak[0], weak[1])).toBeLessThan(weak[2]);
  });

  it("every listed pair meets 4.5 for text and 3.0 for graphics and focus rings", () => {
    const got = tokens();
    const rows = PAIRS.map(([fg, bg, need]) => {
      const ratio = contrast(got.get(fg)!, got.get(bg)!);
      return { pair: `${fg} ${got.get(fg)} on ${bg} ${got.get(bg)}`, ratio: ratio.toFixed(2), need, ok: ratio >= need };
    });
    console.log(rows.map((r) => `| ${r.pair} | ${r.ratio} | ${r.need} |`).join("\n"));
    expect(rows.filter((r) => !r.ok)).toEqual([]);
  });

  it("DESIGN.md lists every pair with the ratio the test computes, to two decimals", () => {
    const md = readFileSync("design/DESIGN.md", "utf8");
    const got = tokens();
    for (const [fg, bg] of PAIRS) {
      const ratio = contrast(got.get(fg)!, got.get(bg)!).toFixed(2);
      expect(md, `${fg} on ${bg}`).toContain(`| \`--${fg}\` on \`--${bg}\` | ${ratio} |`);
    }
  });

  it("the paper block has exactly the colour, ghost and shadow names of the seance block", () => {
    const seance = declarations(rootBlock(designCss)).map(([n]) => n);
    const pick = (names: string[]) => new Set(names.filter((n) => /^(canvas|surface|surface-sunken|text|text-muted|hairline|on-primary|primary|primary-hover)$|^(accent|candle|status|danger|ghost|shadow)-?/.test(n)));
    const paper = declarations(rootBlock(paperCss)).map(([n]) => n);
    expect(new Set(paper)).toEqual(pick(seance));
    expect(new Map(declarations(rootBlock(paperCss))).get("canvas")).toBe("#eef0f4");
  });
});
