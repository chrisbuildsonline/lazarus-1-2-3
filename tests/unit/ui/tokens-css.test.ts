// src/ui/tokens.css against the css block of design/DESIGN.md section 2 (requirement 73).
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

  it("every TOKENS entry of src/report/tokens.ts equals the file's value", () => {
    const got = new Map(declarations(rootBlock(ui())));
    for (const [name, value] of Object.entries(TOKENS)) expect(got.get(name), name).toBe(value);
  });

  it("is imported exactly once, in src/ui/main.tsx", () => {
    const main = readFileSync("src/ui/main.tsx", "utf8");
    expect(main.match(/import\s+["']\.\/tokens\.css["']/g)?.length).toBe(1);
  });
});
