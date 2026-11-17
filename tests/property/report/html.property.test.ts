// HTML escaping property (requirement 56, design "Property test design"). Arbitrary strings go into
// every string field of a hand-built report; the output may hold only the template's own tags,
// and exactly as many < as the same report with every string replaced by "x".
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { printLotus, type Expr } from "../../../src/formula/index.ts";
import { renderReportHtml, type ProvenanceReport } from "../../../src/report/index.ts";
import { TOLERANCE } from "../../../src/verify/index.ts";

const TAGS = new Set("html head meta title style body main header section table thead tbody tr th td span ul li code p h1 h2 div".split(" "));
const ATTRS = /^(lang="en"|charset="utf-8"|http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"|name="viewport" content="width=device-width, initial-scale=1"|(id="(summary|features|cells)" ?)?(class="[a-z -]+")?)$/;

function checkTags(page: string) {
  for (const m of page.matchAll(/<(\/?)([a-z0-9!]+)([^>]*)>/g)) {
    if (m[2] === "!doctype") continue;
    expect(TAGS.has(m[2]!), m[0]).toBe(true);
    const attrs = m[3]!.trim();
    expect(ATTRS.test(attrs), m[0]).toBe(true);
  }
  // A < that no > closes is also forbidden.
  expect(/<[^>]*$/.test(page)).toBe(false);
}

const lt = (s: string) => s.split("<").length - 1;

/** A report whose every free-text field is s(i). */
function report(s: (i: number) => string): ProvenanceReport {
  return {
    schemaVersion: 1,
    tool: { name: "lazarus-1-2-3", version: s(0) },
    source: { fileName: s(1), sha256: s(2), byteLength: 1, format: "wk1" },
    tolerance: TOLERANCE,
    totals: { formulas: 2, matched: 1, mismatched: 1, unverifiable: 0, exact: 1, withinTolerance: 0, byReason: {} },
    unsupportedFeatures: [{ code: "unsupported-function", rule: s(3), name: s(4), count: 1, addresses: [s(5)] }],
    unknownOpcodes: [{ opcode: s(6), count: 1, addresses: [s(7)] }],
    rows: [
      { address: s(8), lotusFormula: s(9), excelFormula: s(10), cached: { t: "str", v: s(11) }, recalculated: { t: "num", v: 1 }, status: "matched", reason: { code: "exact", rule: s(12), message: s(13) } },
      {
        address: s(14),
        lotusFormula: s(15),
        excelFormula: s(16),
        cached: { t: "num", v: 2 },
        recalculated: { t: "str", v: s(17) },
        status: "mismatched",
        reason: { code: "value-differs", message: s(18) },
        inputs: [{ address: s(19), kind: "formula", value: { t: "str", v: s(20) }, cached: { t: "str", v: s(21) } }],
      },
    ],
  };
}

const payload = fc.oneof(fc.string({ unit: "binary" }), fc.constantFrom("<script>alert(1)</script>", "<img src=x onerror=1>", '"><svg/onload=1>', "&lt;", "]]>", "<", "</td></tr></tbody></table><script>"));

describe("HTML escaping properties", () => {
  const template = lt(renderReportHtml(report(() => "x")));

  it("arbitrary text in every string field adds no tag and no <", () => {
    fc.assert(
      fc.property(fc.array(payload, { minLength: 22, maxLength: 22 }), (strings) => {
        const page = renderReportHtml(report((i) => strings[i]!));
        checkTags(page);
        expect(lt(page)).toBe(template);
      }),
      { numRuns: 200 },
    );
  });

  it("arbitrary label text carried through a printed formula string constant adds no tag", () => {
    fc.assert(
      fc.property(payload, payload, (text, fileName) => {
        const e: Expr = { type: "call", name: "IF", args: [{ type: "binary", op: "concat", left: { type: "string", value: text }, right: { type: "ref", ref: { col: 0, row: 0, colAbs: false, rowAbs: false } } }, { type: "int", value: 1 }, { type: "int", value: 0 }] };
        const lotus = printLotus(e);
        const page = renderReportHtml(report((i) => (i === 9 ? lotus : i === 1 ? fileName : "x")));
        checkTags(page);
        expect(lt(page)).toBe(template);
      }),
    );
  });
});
