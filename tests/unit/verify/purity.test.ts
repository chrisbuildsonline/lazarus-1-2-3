import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";
import * as verify from "../../../src/verify/index.ts";

// src/verify must run unchanged in a Web Worker, in bun and in Node (requirement 2): no Node
// modules, no React or DOM, no clocks, randomness, TextDecoder or network. It may import
// src/parser, src/formula and its own files. Checked on the source text of every file.

const ROOT = "src/verify";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(e.name) ? [path] : [];
  });
}

/** Source with comments removed, so a comment that names a forbidden API does not count. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

const FORBIDDEN = [
  /\bnode:/,
  /\breact\b/i,
  /\b(document|window|navigator|self|globalThis)\b/,
  /\b(process|Buffer|require|__dirname)\b/,
  /\b(fetch|XMLHttpRequest|WebSocket)\b/,
  /\b(Date|performance|setTimeout|setInterval)\b/,
  /\bMath\.random\b/,
  /\bTextDecoder\b/,
];

describe("src/verify purity", () => {
  const files = sourceFiles(ROOT);

  it("has source files to check, including the entry point", () => {
    expect(files).toContain(join(ROOT, "index.ts"));
  });

  it("exports the two entry points", () => {
    for (const name of ["verifySheet", "verifyBytes"] as const) expect(typeof verify[name], name).toBe("function");
  });

  for (const file of files) {
    it(`${file} imports only files inside src/verify, src/parser or src/formula`, () => {
      const specifiers = [...code(file).matchAll(/\b(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']/g)].map(
        (m) => m[1] ?? m[2] ?? "",
      );
      for (const spec of specifiers) {
        expect(spec, `${file}: ${spec}`).toMatch(/^\.\.?\//);
        const target = normalize(join(dirname(file), spec));
        expect(["src/verify/", "src/parser/", "src/formula/"].some((dir) => target.startsWith(dir)), `${file}: ${spec}`).toBe(true);
      }
    });

    it(`${file} uses no Node, DOM, clock, random or network API`, () => {
      const text = code(file);
      for (const pattern of FORBIDDEN) expect(text, `${file} ${pattern}`).not.toMatch(pattern);
    });
  }
});
