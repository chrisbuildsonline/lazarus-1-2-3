// The report's macros section (macro-translator requirements 51 to 54): additive, in queue order,
// escaped, and with no effect on any other part of the report.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { approve, buildQueue, reject, setExplanation, toReportItems } from "../../../src/macro/index.ts";
import { buildReport, renderReportHtml, serializeReportJson, type ReportInput, type ReportMacroItem } from "../../../src/report/index.ts";
import { verifyBytes } from "../../../src/verify/index.ts";
import { raiseFixture } from "../helpers/raised.ts";

const sha = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");

function input(path: string): ReportInput {
  const b = new Uint8Array(readFileSync(path));
  return { fileName: path, sha256: sha(b), byteLength: b.byteLength, toolVersion: "0.0.0", verification: verifyBytes(b, path).verification };
}

// Recorded before the macros section existed (JSON sha256, HTML sha256), with toolVersion 0.0.0.
const BEFORE: [string, string, string][] = [
  ["fixtures/mixed/mixed.wk1", "5a10ebdc1b42d1d76661075c60fdc5b271946886d9221c4290e8b38d8284271f", "87ecd4b0a851856bc5c680e9fcc1feae7fefeaa6e1c72aa2bfb861e852d28e36"],
  ["fixtures/ksbase/KSBASE.WK1", "a207bb5d803a90b250918d3551a1b1b7b6dd97f03041445a0bcbbdd73fdc9825", "2a71bcde9282b1d83b19001cc933e2a1fdb3fb00d25a31cc965439e79490f337"],
  ["fixtures/macros/macros.wk1", "83ed0743dbd816e32265159e65e31bcc8673f442d003cc0b73e4d5cbf856270b", "3c8a15cb158bfbf63a1c251293e50d59544929c6b77b8999d2f456f91ee806a5"],
];

const T1 = "2026-11-18T10:00:00.000Z";
const T2 = "2026-11-18T10:05:00.000Z";

async function decidedItems(): Promise<ReportMacroItem[]> {
  const file = await raiseFixture("fixtures/macros/macros.wk1");
  let q = buildQueue({ macros: file.macros, sheets: file.sheets.map((s) => ({ name: s.name, cells: s.verification.cells })) }, T1);
  q = setExplanation(q, "macro:Sheet1!H1", { suggestion: "Prints A1..D8.", rationale: null, confidence: null, model: "recorded fixture" });
  q = setExplanation(q, "opcode:0x61", { suggestion: "Perhaps an @function.", rationale: "A guess.", confidence: "Low", model: "qwen3" });
  q = approve(q, "macro:Sheet1!F1", T1);
  q = reject(q, "opcode:0x61", T2);
  return toReportItems(q);
}

describe("buildReport without macros", () => {
  for (const [path, json, html] of BEFORE) {
    it(`${path}: JSON and HTML are byte-identical to before, with macros missing or empty`, () => {
      for (const macros of [undefined, []]) {
        const r = buildReport(macros === undefined ? input(path) : { ...input(path), macros });
        expect("macros" in r).toBe(false);
        expect(sha(serializeReportJson(r))).toBe(json);
        expect(sha(renderReportHtml(r))).toBe(html);
      }
    });
  }
});

describe("buildReport with macros", () => {
  it("lists the items in queue order with their fields and decision times", async () => {
    const items = await decidedItems();
    const r = buildReport({ ...input("fixtures/macros/macros.wk1"), macros: items });
    const json = JSON.parse(serializeReportJson(r));
    expect(json.macros.map((m: ReportMacroItem) => [m.kind, m.title, m.status, m.decidedAt, m.cells])).toEqual([
      ["macro", "\\0", "approved", T1, ["F1"]],
      ["macro", "\\P", "pending", null, ["H1"]],
      ["macro", "Macro at J1", "pending", null, ["J1"]],
      ["unknown-opcode", "0x61", "rejected", T2, ["A10"]],
    ]);
    expect(Object.keys(json.macros[0])).toEqual(["kind", "title", "sheet", "steps", "explanation", "rationale", "confidence", "model", "status", "decidedAt", "cells"]);
    expect(json.macros[3]).toMatchObject({ explanation: "Perhaps an @function.", rationale: "A guess.", confidence: "Low", model: "qwen3" });
    expect(json.macros[0].steps[0]).toEqual({ label: "Go to A1", raw: "{GOTO}A1~" });
    // The key comes last, after rows.
    expect(Object.keys(json).at(-1)).toBe("macros");
  });

  it("copies the list, so a later change to the input does not reach the report", async () => {
    const items = await decidedItems();
    const r = buildReport({ ...input("fixtures/macros/macros.wk1"), macros: items });
    items[0]!.title = "changed";
    items[0]!.steps[0]!.label = "changed";
    items[0]!.cells.push("Z9");
    expect(r.macros![0]!.title).toBe("\\0");
    expect(r.macros![0]!.steps[0]!.label).toBe("Go to A1");
    expect(r.macros![0]!.cells).toEqual(["F1"]);
  });

  it("leaves totals, rows, sheets, unknownOpcodes and unsupportedFeatures as they are", async () => {
    const items = await decidedItems();
    for (const path of ["fixtures/macros/macros.wk1", "fixtures/mixed/mixed.wk1"]) {
      const without = buildReport(input(path));
      const withMacros = buildReport({ ...input(path), macros: items });
      const { macros, ...rest } = withMacros;
      expect(macros).toHaveLength(4);
      expect(rest).toEqual(without);
    }
  });

  it("renders the Macros section after the sheets and before the features", async () => {
    const page = renderReportHtml(buildReport({ ...input("fixtures/macros/macros.wk1"), macros: await decidedItems() }));
    const at = (s: string) => page.indexOf(s);
    expect(at('<section id="macros"')).toBeGreaterThan(at('<section id="summary"'));
    expect(at('<section id="macros"')).toBeLessThan(at('<section id="features"'));
    const section = page.slice(at('<section id="macros"'), at('<section id="features"'));
    expect(section).toContain("<h2>Macros</h2>");
    expect(section).toContain("Macros were not run. Each item below needs a person&#39;s decision.");
    for (const s of ["Waiting", "Approved by you", "Rejected", "Explanation (local model, unchecked)", "recorded fixture", "qwen3", "Confidence: Low", "Unknown opcode", "Macro", T1, T2, "A10", "<code>{GOTO}A1~</code>", "Go to A1", "Prints A1..D8."]) {
      expect(section, s).toContain(s);
    }
    expect(section.match(/class="pill pill-approved"/g)).toHaveLength(1);
    expect(section.match(/class="pill pill-rejected"/g)).toHaveLength(1);
    expect(section.match(/class="pill pill-waiting"/g)).toHaveLength(2);
  });

  it("escapes hostile text in titles, steps and explanations", async () => {
    const evil = '<script>alert("x")</script><img src=x onerror=alert(1)>';
    const items = (await decidedItems()).map((m) => ({ ...m, title: evil, sheet: evil, explanation: evil, rationale: evil, model: evil, steps: [{ label: evil, raw: evil }], cells: [evil] }));
    const page = renderReportHtml(buildReport({ ...input("fixtures/macros/macros.wk1"), macros: items }));
    for (const tag of ["<script", "<link", "<img", "<iframe", "<object", "<embed", "<form"]) expect(page.toLowerCase(), tag).not.toContain(tag);
    // No attribute inside a real tag other than the template's own class, id, lang, charset and meta ones.
    const attrs = [...page.matchAll(/<[a-z][^>]*>/gi)].flatMap((m) => [...m[0].matchAll(/\s([a-z-]+)=("[^"]*"|'[^']*'|[^\s>]+)/gi)].map((a) => a[1]!.toLowerCase()));
    expect(new Set(attrs)).toEqual(new Set(["lang", "charset", "http-equiv", "content", "name", "id", "class"]));
    expect(page).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;");
  });
});
