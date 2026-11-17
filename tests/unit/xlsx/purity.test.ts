// Purity and confinement of src/xlsx and src/report (requirements 2, 3, 28, 57).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const imports = (src: string): string[] => [...src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]!);

const FORBIDDEN_GLOBALS: [string, RegExp][] = [
  ["Buffer", /\bBuffer\b/],
  ["fetch", /\bfetch\s*\(/],
  ["XMLHttpRequest", /\bXMLHttpRequest\b/],
  ["WebSocket", /\bWebSocket\b/],
  ["sendBeacon", /\bsendBeacon\b/],
  ["Date.now", /\bDate\.now\b/],
  ["new Date()", /new\s+Date\s*\(\s*\)/],
  ["Math.random", /\bMath\.random\b/],
  ["performance", /\bperformance\b/],
];

/** Rule violations of one file. `path` is relative to the repo, with forward slashes. */
export function violations(path: string, src: string): string[] {
  const out: string[] = [];
  const specs = imports(src);
  if (path !== "src/xlsx/exceljs-adapter.ts" && specs.includes("exceljs")) out.push("imports exceljs");
  const inXlsx = path.startsWith("src/xlsx/");
  const inReport = path.startsWith("src/report/");
  if (inXlsx || inReport) {
    const banned = inXlsx ? ["ui", "cli", "workers", "report"] : ["xlsx", "ui", "cli", "workers"];
    for (const s of specs) {
      if (s.startsWith("..") && banned.some((b) => s.includes(`/${b}/`))) out.push(`imports ${s}`);
      if (s.startsWith("node:") || s === "react" || s.startsWith("react-dom") || (inReport && s === "exceljs")) out.push(`imports ${s}`);
    }
    for (const [name, re] of FORBIDDEN_GLOBALS) if (re.test(src)) out.push(`uses ${name}`);
  }
  return out;
}

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? tsFiles(p) : p.endsWith(".ts") || p.endsWith(".tsx") ? [p.replaceAll("\\", "/")] : [];
  });
}

describe("purity guard", () => {
  it("bites on each forbidden form", () => {
    expect(violations("src/xlsx/plan.ts", 'import ExcelJS from "exceljs";')).toEqual(["imports exceljs"]);
    expect(violations("src/parser/x.ts", 'import x from "exceljs";')).toEqual(["imports exceljs"]);
    expect(violations("src/xlsx/exceljs-adapter.ts", 'import ExcelJS from "exceljs";')).toEqual([]);
    for (const dir of ["ui", "cli", "workers", "report"]) expect(violations("src/xlsx/a.ts", `import { x } from "../${dir}/index.ts";`)).toEqual([`imports ../${dir}/index.ts`]);
    for (const dir of ["xlsx", "ui", "cli", "workers"]) expect(violations("src/report/a.ts", `import { x } from "../${dir}/index.ts";`)).toEqual([`imports ../${dir}/index.ts`]);
    expect(violations("src/report/a.ts", 'import x from "exceljs";')).toEqual(["imports exceljs", "imports exceljs"]);
    for (const s of ['import { readFile } from "node:fs/promises";', 'import React from "react";']) expect(violations("src/xlsx/a.ts", s)).toHaveLength(1);
    for (const s of ["Buffer.from(x)", "fetch(url)", "new XMLHttpRequest()", "new WebSocket(u)", "navigator.sendBeacon(u)", "Date.now()", "new Date()", "Math.random()", "performance.now()"]) {
      expect(violations("src/xlsx/a.ts", s), s).toHaveLength(1);
      expect(violations("src/report/a.ts", s), s).toHaveLength(1);
    }
    expect(violations("src/xlsx/a.ts", "new Date(Date.UTC(1980, 0, 1))")).toEqual([]);
    expect(violations("src/xlsx/a.ts", 'import { a1 } from "../parser/index.ts"; import type { CellResult } from "../verify/index.ts";')).toEqual([]);
  });

  it("the module entry points exist, so the scan below is not vacuous", () => {
    expect(existsSync("src/xlsx/index.ts")).toBe(true);
    expect(existsSync("src/report/index.ts")).toBe(true);
  });

  it("holds for every file under src, scripts and mcp", () => {
    const files = ["src", "scripts", "mcp"].filter(existsSync).flatMap(tsFiles);
    const found = files.flatMap((f) => violations(f, readFileSync(f, "utf8")).map((v) => `${f}: ${v}`));
    expect(found).toEqual([]);
  });
});
