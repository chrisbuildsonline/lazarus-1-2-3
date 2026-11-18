// Confinement of src/macro (requirement 46, design.md "Layout"): no React, DOM, node, report,
// xlsx, cli or workers import; explain.ts reads no number or JSON text and holds no key; the one
// URL is the local model, and the one network call is the injected fetch.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DIR = new URL("../../../src/macro/", import.meta.url);
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".ts"));
const read = (f: string) => readFileSync(new URL(f, DIR), "utf8");
const LOCAL = "http://localhost:11434/v1/chat/completions";

const imports = (src: string): string[] => [...src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]!);

function badImports(src: string): string[] {
  return imports(src).filter((s) => s === "react" || s.startsWith("react-dom") || s.startsWith("node:") || /\/(report|xlsx|cli|workers|ui)\//.test(s));
}
const EXPLAIN_BANNED = /JSON\.parse|Number\(|parseFloat|Authorization|api_key|process\.env/;
const urls = (src: string) => src.match(/\b(?:https?|wss?):\/\/[^\s"'`)]+/g) ?? [];
const NETWORK = [/\bXMLHttpRequest\b/, /\bWebSocket\b/, /\bEventSource\b/, /\bsendBeacon\b/, /\bimportScripts\b/, /\bglobalThis\.fetch\b/, /\bwindow\.fetch\b/, /\bself\.fetch\b/];
/** Network calls other than the injected `fetch` of explain.ts. */
function networkUses(file: string, src: string): string[] {
  const out = NETWORK.filter((re) => re.test(src)).map((re) => re.source);
  const calls = src.match(/\bfetch\s*\(/g)?.length ?? 0;
  const injected = file === "explain.ts" && /const \{ fetch[,\s]/.test(src) ? 1 : 0;
  if (calls > injected) out.push("fetch(");
  return out;
}
const DOM = /\b(document|window|navigator|localStorage)\./;

describe("src/macro purity", () => {
  it("each check bites", () => {
    for (const s of ['import React from "react";', 'import { x } from "node:fs";', 'import { r } from "../report/index.ts";', 'import { w } from "../xlsx/write.ts";', 'import { c } from "../cli/lazarus.ts";', 'import { v } from "../workers/verify-protocol.ts";', 'const m = await import("../report/html.ts");']) {
      expect(badImports(s), s).toHaveLength(1);
    }
    expect(badImports('import type { Sheet } from "../parser/sheet.ts"; import type { CellResult } from "../verify/index.ts";')).toEqual([]);
    for (const s of ["JSON.parse(t)", "Number(x)", "parseFloat(x)", 'h["Authorization"]', "api_key", "process.env.X"]) expect(EXPLAIN_BANNED.test(s), s).toBe(true);
    expect(urls('const u = "https://api.example.com/v1";')).toEqual(["https://api.example.com/v1"]);
    expect(networkUses("steps.ts", "fetch(u)")).toEqual(["fetch("]);
    expect(networkUses("explain.ts", "const { fetch, models } = deps; fetch(a); fetch(b)")).toEqual(["fetch("]);
    expect(networkUses("explain.ts", "const { fetch, models } = deps; fetch(a)")).toEqual([]);
    expect(networkUses("explain.ts", "globalThis.fetch(a)")).toHaveLength(2);
    expect(networkUses("queue.ts", "new WebSocket(u)")).toHaveLength(1);
    expect(DOM.test("document.title")).toBe(true);
  });
  it("imports no React, node, report, xlsx, cli, workers or ui module", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(6);
    for (const f of FILES) expect(badImports(read(f)), f).toEqual([]);
  });
  it("uses no DOM global", () => {
    for (const f of FILES) expect(read(f), f).not.toMatch(DOM);
  });
  it("explain.ts never parses numbers or JSON text and holds no key", () => {
    expect(read("explain.ts")).not.toMatch(EXPLAIN_BANNED);
  });
  it("the only URL in src/macro is the local model", () => {
    expect([...new Set(FILES.flatMap((f) => urls(read(f))))]).toEqual([LOCAL]);
  });
  it("the only network call is the injected fetch of explain.ts", () => {
    for (const f of FILES) expect(networkUses(f, read(f)), f).toEqual([]);
    expect(read("explain.ts").match(/\bfetch\s*\(/g)).toHaveLength(1);
  });
});
