// Report tokens against design/DESIGN.md section 2 (requirement 42).
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildReport, renderReportHtml } from "../../../src/report/index.ts";
import { TOKENS } from "../../../src/report/tokens.ts";
import { verifyBytes } from "../../../src/verify/index.ts";

const declarations = (css: string) => new Map([...css.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));

const design = (() => {
  const md = readFileSync("design/DESIGN.md", "utf8");
  const section = md.slice(md.indexOf("## 2. Tokens"));
  return declarations(/```css\n([\s\S]*?)```/.exec(section)![1]!);
})();

const page = renderReportHtml(buildReport({ fileName: "K.WK1", sha256: "0".repeat(64), byteLength: 1, toolVersion: "0", verification: verifyBytes(new Uint8Array(readFileSync("fixtures/ksbase/KSBASE.WK1"))).verification }));
const css = /<style>([\s\S]*?)<\/style>/.exec(page)![1]!;

describe("report tokens", () => {
  it("every token exists in DESIGN.md section 2 with the same value", () => {
    for (const [name, value] of Object.entries(TOKENS)) expect(design.get(name), name).toBe(value);
  });

  it("matches src/ui/tokens.css when it exists (it did not exist when this test was written)", () => {
    if (!existsSync("src/ui/tokens.css")) return;
    const ui = declarations(readFileSync("src/ui/tokens.css", "utf8"));
    for (const [name, value] of Object.entries(TOKENS)) expect(ui.get(name), name).toBe(value);
  });

  it("the page uses only token variables and no other colour", () => {
    const used = [...css.matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(20);
    for (const name of used) expect(Object.keys(TOKENS), name).toContain(name);
    const values = new Set<string>(Object.values(TOKENS));
    const rootless = css.replace(/:root \{[^}]*\}/, "");
    expect(rootless.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? []).toEqual([]);
    for (const hex of css.match(/#[0-9a-fA-F]{6}\b/g) ?? []) expect(values.has(hex), hex).toBe(true);
  });
});
