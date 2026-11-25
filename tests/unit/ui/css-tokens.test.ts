// Token-only styling (requirements 34, 68, 72, 74): every .css file under src/ui other than tokens.css,
// and every style={{...}} object of the components, uses the tokens for colour, radius, shadow, font,
// motion and spacing. Literal sizes are only the ones DESIGN.md names.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pixel sizes DESIGN.md names (sections 2 to 4 and requirement 74): hairline 1, dashed outline 1.5, bar,
 * ring and proof gap 2, toast bar 3, progress bar 4, glyph 6, proof bar and outline inset 8, insets 16,
 * pill 24, header and tabs 32, row 36, pill 44, row number and phone pill 48, phone top bar 56, list row 64,
 * top bar 72, Summon offset 96, column 112, empty filter 120, summoning circle 140 (phone) and 220,
 * drop zone 180, 240 and 320, batch 320,
 * toast 420, drawer 440, queue 520, column and breakpoint 640 (tablet 641 to 1023), desktop 1024, content 1360.
 */
const NAMED_PX = new Set([1, 1.5, 2, 3, 4, 6, 8, 16, 24, 32, 36, 44, 48, 56, 64, 72, 96, 112, 120, 140, 180, 220, 240, 320, 420, 440, 520, 640, 641, 1023, 1024, 1360]);

const COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|\b(?:white|black|red|green|blue|gr[ae]y|orange|yellow|purple|pink|violet|silver)\b/i;
const LENGTH = /(?<![\w-])-?\d*\.?\d+(?:px|r?em|%|vh|vw|dvh|svh|ch|ex|pt|cm|mm|in)\b/;
const DURATION = /(?<![\w-])\d*\.?\d+m?s\b/;
const PX = /(?<![\w-])(\d*\.?\d+)px\b/g;

/** Drops var(--x) and env(x) references, which are tokens or the platform's safe area, not literals. */
const withoutRefs = (v: string) => v.replace(/var\(--[a-z0-9-]+\)/gi, "").replace(/env\([a-z-]+\)/gi, "");

function declarationViolations(prop: string, value: string): string[] {
  const out: string[] = [];
  const p = prop.toLowerCase();
  const v = value.trim();
  if (/!important/i.test(v)) out.push("!important");
  if (/\binfinite\b/i.test(v)) out.push("infinite");
  if (COLOUR.test(withoutRefs(v))) out.push("colour literal");
  if (/^border(-[a-z]+)*-radius$/.test(p) && /\d/.test(withoutRefs(v).replace(/(^|\s)0(\s|$)/g, " "))) out.push("literal border-radius");
  if (p === "box-shadow" && v !== "none" && /\d/.test(withoutRefs(v).replace(/(^|\s)0(\s|$)/g, " "))) out.push("literal box-shadow");
  if ((p === "font" || p === "font-family") && withoutRefs(v).trim() !== "" && v !== "inherit") out.push(`literal ${p}`);
  if (/^(transition|animation)(-[a-z]+)?$/.test(p) && DURATION.test(withoutRefs(v))) out.push("literal duration");
  if (/^(padding|margin|gap|row-gap|column-gap)(-[a-z]+)*$/.test(p) && LENGTH.test(withoutRefs(v))) out.push(`literal ${p}`);
  for (const m of v.matchAll(PX)) if (!NAMED_PX.has(Number(m[1]))) out.push(`size ${m[1]}px`);
  return out;
}

/** Violations of one stylesheet: declarations inside blocks, after comments and selectors are removed. */
export function cssViolations(css: string): string[] {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/[^{};]+\{/g, "{");
  return [...body.matchAll(/(--)?([a-z-]+)\s*:\s*([^;{}]+)/gi)].flatMap((m) => {
    // Local custom properties may hold the named sizes; anything else in them is checked like a value.
    const prop = m[1] ? "--custom" : m[2]!;
    return declarationViolations(prop, m[3]!);
  });
}

const CAMEL = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Violations of the style={{...}} objects of one component file. */
export function styleViolations(tsx: string): string[] {
  return [...tsx.matchAll(/style=\{\{([\s\S]*?)\}\}/g)].flatMap((m) =>
    [...m[1]!.matchAll(/(\w+)\s*:\s*([^,]+)/g)].flatMap(([, key, raw]) => {
      const prop = CAMEL(key!);
      const value = raw!.trim();
      const out = declarationViolations(prop, value.replace(/^["'`]|["'`]$/g, ""));
      // React turns a bare number into pixels.
      if (/^(padding|margin|gap|row-gap|column-gap)/.test(prop) && /^-?\d*\.?\d+$/.test(value) && Number(value) !== 0) out.push(`literal ${prop}`);
      if (/^(border-radius|box-shadow|font|font-family)$/.test(prop) && /^-?\d/.test(value)) out.push(`literal ${prop}`);
      return out;
    }),
  );
}

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name).replaceAll("\\", "/");
    return statSync(p).isDirectory() ? files(p, ext) : ext.test(p) ? [p] : [];
  });
}

describe("token-only css guard", () => {
  it("bites on each forbidden form in a stylesheet", () => {
    const bad: [string, string][] = [
      [".a { color: #12141a; }", "colour literal"],
      [".a { background: rgba(18, 20, 26, 0.24); }", "colour literal"],
      [".a { background: hsl(250 70% 60%); }", "colour literal"],
      [".a { color: white; }", "colour literal"],
      [".a { border-radius: 12px; }", "literal border-radius"],
      [".a { border-top-left-radius: 50%; }", "literal border-radius"],
      [".a { box-shadow: 0 1px 2px var(--hairline); }", "literal box-shadow"],
      [".a { font-family: Arial, sans-serif; }", "literal font-family"],
      [".a { font: 600 15px/1.5 var(--font-sans); }", "literal font"],
      [".a { transition: opacity 200ms var(--ease-out); }", "literal duration"],
      [".a { animation: x 0.25s ease; }", "literal duration"],
      [".a { padding: 12px; }", "literal padding"],
      [".a { padding-inline: 1rem; }", "literal padding-inline"],
      [".a { margin: 0 8px; }", "literal margin"],
      [".a { gap: 4px; }", "literal gap"],
      [".a { width: 37px; }", "size 37px"],
      [".a { --x: 13px; }", "size 13px"],
      [".a { color: var(--text) !important; }", "!important"],
      [".a { animation: x var(--dur-slow) infinite; }", "infinite"],
    ];
    for (const [css, why] of bad) expect(cssViolations(css), css).toContain(why);
  });

  it("lets the token forms through", () => {
    const good = [
      ".a { color: var(--text); background: transparent; }",
      ".a { border-radius: var(--radius-lg); box-shadow: var(--shadow-surface); }",
      ".a { box-shadow: none; border-radius: 0; }",
      ".a { font: var(--text-body); } button { font: inherit; }",
      ".a { transition: transform var(--dur-fast) var(--ease-out); }",
      ".a { padding: 0 calc(var(--space-5) + var(--space-1) / 2); margin: 0 auto; gap: var(--space-2); }",
      ".a { bottom: calc(var(--space-4) + env(safe-area-inset-bottom)); }",
      ".a { height: 44px; width: 440px; border: 1px solid var(--hairline); }",
      "@media (max-width: 640px) { .a { height: 48px; } }",
      ":root { --grid-row: calc(var(--space-8) + var(--space-1)); }",
    ];
    for (const css of good) expect(cssViolations(css), css).toEqual([]);
  });

  it("bites on each forbidden form in a style object", () => {
    expect(styleViolations("<div style={{ color: '#fff' }} />")).toContain("colour literal");
    expect(styleViolations('<div style={{ borderRadius: "12px" }} />')).toContain("literal border-radius");
    expect(styleViolations("<div style={{ borderRadius: 12 }} />")).toContain("literal border-radius");
    expect(styleViolations('<div style={{ boxShadow: "0 0 0 1px red" }} />').length).toBeGreaterThan(0);
    expect(styleViolations('<div style={{ fontFamily: "Arial" }} />')).toContain("literal font-family");
    expect(styleViolations('<div style={{ transition: "opacity 150ms" }} />')).toContain("literal duration");
    expect(styleViolations("<div style={{ padding: 8 }} />")).toContain("literal padding");
    expect(styleViolations('<div style={{ margin: "4px" }} />')).toContain("literal margin");
    expect(styleViolations('<div style={{ width: "37px" }} />')).toContain("size 37px");
    expect(styleViolations("<div style={{ flexGrow: s.fraction }} />")).toEqual([]);
    expect(styleViolations("<div style={{ transform: `translateY(${i * LAYOUT.rowHeight}px)` }} />")).toEqual([]);
    expect(styleViolations("<div style={{ width, height: count * LAYOUT.rowHeight }} />")).toEqual([]);
  });

  it("holds for every stylesheet under src/ui other than tokens.css", () => {
    const sheets = files("src/ui", /\.css$/).filter((f) => f !== "src/ui/tokens.css");
    expect(sheets).toContain("src/ui/styles/app.css");
    const found = sheets.flatMap((f) => cssViolations(readFileSync(f, "utf8")).map((v) => `${f}: ${v}`));
    expect(found).toEqual([]);
  });

  it("holds for every style object under src/ui", () => {
    const comps = files("src/ui", /\.tsx$/);
    expect(comps.length).toBeGreaterThan(5);
    const found = comps.flatMap((f) => styleViolations(readFileSync(f, "utf8")).map((v) => `${f}: ${v}`));
    expect(found).toEqual([]);
  });

  it("app.css is imported once in main.tsx, after tokens.css", () => {
    const main = readFileSync("src/ui/main.tsx", "utf8");
    expect(main.match(/import\s+["']\.\/styles\/app\.css["']/g)?.length).toBe(1);
    expect(main.indexOf("./tokens.css")).toBeLessThan(main.indexOf("./styles/app.css"));
  });
});

describe("app.css covers the components", () => {
  it("styles every class the components render", () => {
    const css = readFileSync("src/ui/styles/app.css", "utf8");
    const defined = new Set([...css.matchAll(/\.([a-z][a-z0-9_-]*)/gi)].map((m) => m[1]));
    const used = new Set(
      files("src/ui/components", /\.tsx$/).flatMap((f) =>
        [...readFileSync(f, "utf8").matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\}|\{[^}]*?"([^"]+)"\s*:\s*"([^"]+)"\})/g)].flatMap((m) =>
          [m[1], m[2], m[3], m[4]].filter(Boolean).flatMap((s) => s!.replace(/\$\{[^}]*\}/g, "").split(/\s+/)),
        ),
      ),
    );
    const missing = [...used].filter((c) => c && !c.endsWith("--") && !defined.has(c));
    expect(missing).toEqual([]);
  });

  it("has the reduced-motion rule, the focus ring and the phone breakpoint", () => {
    const css = readFileSync("src/ui/styles/app.css", "utf8");
    expect(css).toMatch(/:focus-visible\s*\{[^}]*box-shadow:\s*var\(--focus-ring\)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/@media \(max-width: 640px\)/);
    expect(css).toMatch(/@media \(min-width: 1024px\)/);
  });
});
