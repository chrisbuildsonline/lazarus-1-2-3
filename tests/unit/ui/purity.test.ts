// Purity, network and storage guard for src/ui and src/workers (requirements 16, 63, 66).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const staticImports = (src: string): string[] => [...src.matchAll(/(?:^|[\s;])(?:import|export)\s[^"'()]*?from\s*["']([^"']+)["']|(?:^|[\s;])import\s*["']([^"']+)["']/gm)].map((m) => (m[1] ?? m[2])!);
const dynamicImports = (src: string): string[] => [...src.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1]!);

const ENGINE_CALLS = ["parseWk1", "verifySheet", "verifyBytes", "classifySheet"];

const NETWORK: [string, RegExp][] = [
  ["fetch", /\bfetch\s*\(/g],
  ["XMLHttpRequest", /\bXMLHttpRequest\b/g],
  ["WebSocket", /\bWebSocket\b/g],
  ["EventSource", /\bEventSource\b/g],
  ["sendBeacon", /\bsendBeacon\b/g],
  ["importScripts", /\bimportScripts\b/g],
];

const STORAGE: [string, RegExp][] = [
  ["localStorage", /\blocalStorage\b/],
  ["sessionStorage", /\bsessionStorage\b/],
  ["indexedDB", /\bindexedDB\b/],
  ["document.cookie", /\bdocument\.cookie\b/],
  ["caches.", /\bcaches\./],
];

const DOM_IN_MODEL: [string, RegExp][] = [
  ["document", /\bdocument\b/],
  ["window", /\bwindow\b/],
  ["navigator", /\bnavigator\b/],
];

const SAMPLE = "src/ui/io/sample.ts";
const DOWNLOADS = "src/ui/io/downloads.ts";

/** Strips line and block comments, so a comment that names a forbidden call does not count. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const pointsAt = (spec: string, dir: string) => spec.startsWith(".") && new RegExp(`(^|/)${dir}(/|$)`).test(spec);

/** Rule violations of one file. `path` is relative to the repo, with forward slashes. */
export function violations(path: string, raw: string): string[] {
  const out: string[] = [];
  const src = code(raw);
  const inUi = path.startsWith("src/ui/");
  const inWorkers = path.startsWith("src/workers/");
  if (!inUi && !inWorkers) return out;
  const stat = staticImports(src);
  const dyn = dynamicImports(src);
  for (const s of [...stat, ...dyn]) {
    if (s === "exceljs") out.push("imports exceljs");
    if (s.startsWith("node:")) out.push(`imports ${s}`);
    if (pointsAt(s, "cli")) out.push(`imports ${s}`);
  }
  for (const s of stat) {
    // The worker hashes with src/report/sha256.ts (design.md, dependency rules); nothing else of report or xlsx is static.
    const workerHash = inWorkers && /(^|\/)report\/sha256\.ts$/.test(s);
    if ((pointsAt(s, "xlsx") || pointsAt(s, "report")) && !workerHash) out.push(`imports ${s} statically`);
  }
  if (path !== DOWNLOADS) for (const s of dyn) if (pointsAt(s, "xlsx") || pointsAt(s, "report")) out.push(`imports ${s} outside downloads.ts`);
  if (inUi) for (const name of ENGINE_CALLS) if (new RegExp(`\\b${name}\\b`).test(src)) out.push(`uses ${name}`);
  for (const [name, re] of NETWORK) {
    const count = src.match(re)?.length ?? 0;
    const allowed = path === SAMPLE && name === "fetch" ? 1 : 0;
    if (count > allowed) out.push(`uses ${name}`);
  }
  for (const [name, re] of STORAGE) if (re.test(src)) out.push(`uses ${name}`);
  if (path.startsWith("src/ui/model/")) {
    for (const s of stat) if (s === "react" || s.startsWith("react-dom") || s.startsWith("react/")) out.push(`imports ${s}`);
    for (const [name, re] of DOM_IN_MODEL) if (re.test(src)) out.push(`uses ${name}`);
  }
  return out;
}

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? tsFiles(p) : p.endsWith(".ts") || p.endsWith(".tsx") ? [p.replaceAll("\\", "/")] : [];
  });
}

describe("ui and workers purity guard", () => {
  it("bites on each forbidden form", () => {
    for (const name of ENGINE_CALLS) {
      expect(violations("src/ui/App.tsx", `import { ${name} } from "../parser/index.ts";`), name).toEqual([`uses ${name}`]);
      expect(violations("src/ui/components/X.tsx", `${name}(bytes)`), name).toEqual([`uses ${name}`]);
    }
    expect(violations("src/ui/a.ts", 'import ExcelJS from "exceljs";')).toEqual(["imports exceljs"]);
    expect(violations("src/workers/a.ts", 'import ExcelJS from "exceljs";')).toEqual(["imports exceljs"]);
    expect(violations("src/ui/a.ts", 'import { main } from "../cli/lazarus.ts";')).toEqual(["imports ../cli/lazarus.ts"]);
    expect(violations("src/workers/a.ts", 'import { readFileSync } from "node:fs";')).toEqual(["imports node:fs"]);
    expect(violations("src/ui/a.ts", 'import { writeXlsx } from "../xlsx/index.ts";')).toEqual(["imports ../xlsx/index.ts statically"]);
    expect(violations("src/ui/io/downloads.ts", 'import { writeXlsx } from "../../xlsx/index.ts";')).toEqual(["imports ../../xlsx/index.ts statically"]);
    expect(violations("src/ui/io/downloads.ts", 'import type { Report } from "../../report/index.ts";')).toEqual(["imports ../../report/index.ts statically"]);
    expect(violations("src/ui/a.ts", 'const m = await import("../report/index.ts");')).toEqual(["imports ../report/index.ts outside downloads.ts"]);
    expect(violations("src/ui/io/downloads.ts", 'const m = await import("../../xlsx/index.ts");')).toEqual([]);
    expect(violations("src/workers/a.ts", 'import { sha256Hex } from "../report/sha256.ts";')).toEqual([]);
    expect(violations("src/workers/a.ts", 'import { buildReport } from "../report/build.ts";')).toEqual(["imports ../report/build.ts statically"]);
    for (const s of ["fetch(url)", "new XMLHttpRequest()", "new WebSocket(u)", "new EventSource(u)", "navigator.sendBeacon(u)", "importScripts(u)"]) {
      expect(violations("src/ui/a.ts", s), s).toHaveLength(1);
      expect(violations("src/workers/a.ts", s), s).toHaveLength(1);
    }
    expect(violations("src/ui/io/sample.ts", "fetch(sampleUrl)")).toEqual([]);
    expect(violations("src/ui/io/sample.ts", "fetch(a); fetch(b)")).toEqual(["uses fetch"]);
    for (const s of ['localStorage.setItem("k", v)', "sessionStorage.clear()", 'indexedDB.open("x")', 'document.cookie = "a=b"', 'caches.open("x")']) {
      expect(violations("src/ui/a.ts", s), s).toHaveLength(1);
    }
    expect(violations("src/ui/model/a.ts", 'import { useState } from "react";')).toEqual(["imports react"]);
    for (const s of ["document.title", "window.scrollY", "navigator.clipboard"]) expect(violations("src/ui/model/a.ts", s), s).toHaveLength(1);
    expect(violations("src/ui/components/A.tsx", 'import { useState } from "react"; document.title = "x";')).toEqual([]);
    expect(violations("src/ui/a.ts", "// the one fetch(url) lives in sample.ts")).toEqual([]);
    expect(violations("src/ui/a.ts", 'import type { Sheet } from "../parser/index.ts"; import { a1 } from "../parser/index.ts";')).toEqual([]);
  });

  it("the app entry points exist, so the scan below is not vacuous", () => {
    expect(existsSync("src/ui/App.tsx")).toBe(true);
    expect(existsSync("src/ui/main.tsx")).toBe(true);
    expect(existsSync("src/workers/verify-protocol.ts")).toBe(true);
  });

  it("holds for every file under src/ui and src/workers", () => {
    const files = ["src/ui", "src/workers"].flatMap(tsFiles);
    expect(files.length).toBeGreaterThan(2);
    const found = files.flatMap((f) => violations(f, readFileSync(f, "utf8")).map((v) => `${f}: ${v}`));
    expect(found).toEqual([]);
  });
});
