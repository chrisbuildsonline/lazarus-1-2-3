// renderReportHtml content and the self-contained scan (requirements 39, 40, 43, 44).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildReport, renderReportHtml, type ReportInput } from "../../../src/report/index.ts";
import { TOLERANCE, verifyBytes, type CellResult, type Status } from "../../../src/verify/index.ts";

const cell = (i: number, status: Status, over: Partial<CellResult> = {}): CellResult => ({
  address: `B${i + 1}`,
  col: 1,
  row: i,
  status,
  cached: { t: "num", v: 3.5 },
  recalculated: { t: "num", v: 3.5 },
  reason: { code: "exact", message: `reason ${i}` },
  formula: "SUM(A1:A3)",
  lotusFormula: "@SUM(A1..A3)",
  candidateOpcodes: [],
  ...over,
});

const html = (cells: CellResult[], totals?: { matched: number; formulas: number }) => {
  const matched = totals?.matched ?? cells.filter((c) => c.status === "matched").length;
  const formulas = totals?.formulas ?? cells.length;
  const input: ReportInput = {
    fileName: "C:\\old\\BOOK.WK1",
    sha256: "ab".repeat(32),
    byteLength: 10,
    toolVersion: "9.8.7",
    verification: { name: "", format: "wk1", tolerance: TOLERANCE, cells, totals: { formulas, matched, mismatched: cells.filter((c) => c.status === "mismatched").length, unverifiable: formulas - matched - cells.filter((c) => c.status === "mismatched").length, exact: 0, withinTolerance: 0, byReason: {} } },
  };
  return renderReportHtml(buildReport(input));
};

function scan(page: string) {
  for (const tag of ["<script", "<link", "<img", "<iframe", "<object", "<embed", "<form"]) expect(page.toLowerCase(), tag).not.toContain(tag);
  expect(page).not.toMatch(/\son[a-z]+=/i);
  expect(page).not.toMatch(/\s(src|href)=/i);
  expect(page).not.toContain("url(");
  expect(page).not.toContain("@import");
  expect(page).not.toMatch(/https?:/);
  expect(page.match(/<style>/g)).toHaveLength(1);
  const css = /<style>([\s\S]*?)<\/style>/.exec(page)![1]!;
  expect(css).not.toMatch(/animation|transition/);
}

describe("renderReportHtml", () => {
  const mismatched = cell(1, "mismatched", { recalculated: { t: "num", v: 2 }, reason: { code: "value-differs", message: "differs" }, inputs: [{ address: "A7", kind: "number", value: { t: "num", v: 11 }, cached: { t: "num", v: 12 } }] });
  const unverifiable = cell(2, "unverifiable", { recalculated: null, formula: null, reason: { code: "unsupported-function", message: "This formula uses @IRR, which" } });
  const page = html([cell(0, "matched"), mismatched, unverifiable, cell(3, "matched", { cached: { t: "err" }, recalculated: { t: "err" } })]);

  it("is a complete document with lang, charset, CSP and a title naming the file", () => {
    expect(page.startsWith("<!doctype html>")).toBe(true);
    expect(page).toContain('<html lang="en">');
    expect(page).toContain('<meta charset="utf-8">');
    expect(page).toContain(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`);
    expect(page).toMatch(/<title>BOOK\.WK1[^<]*<\/title>/);
  });

  it("shows the file, hash, tool version, tolerance, counts, pills and the unchanged-values sentence", () => {
    for (const s of ["BOOK.WK1", "ab".repeat(32), "9.8.7", `relative ${TOLERANCE.relative}`, "Matched 2", "Mismatched 1", "Unverifiable 1", "Stored values were not changed."]) expect(page, s).toContain(s);
    for (const s of ["Matched", "Mismatched", "Unverifiable"]) expect(page).toContain(`">${s}</span>`);
    expect(page).not.toContain("C:\\old");
  });

  it("rounds the verified percentage down, and says No formulas for zero", () => {
    const pct = (matched: number, formulas: number) => />(\d+)%</.exec(html([], { matched, formulas }))?.[1];
    expect(/>(\d+)%</.exec(html([cell(0, "matched"), cell(1, "matched"), cell(2, "matched"), unverifiable]))![1]).toBe("75");
    expect(pct(2, 1000)).toBe("0");
    expect(pct(999, 1000)).toBe("99");
    expect(html([])).toContain("No formulas");
  });

  it("has one table row per report row with all seven columns, and mismatched inputs", () => {
    const rows = page.split("<tbody>")[1]!.match(/<tr>[\s\S]*?<\/tr>/g)!;
    expect(rows).toHaveLength(4);
    for (const r of rows) expect(r.match(/<td/g)).toHaveLength(7);
    expect(rows[0]).toContain("@SUM(A1..A3)");
    expect(rows[0]).toContain("SUM(A1:A3)");
    expect(rows[1]).toContain("A7");
    expect(rows[1]).toContain("11");
    expect(rows[3]).toContain("ERR");
  });

  it("lists unsupported features and unknown opcodes, or None", () => {
    expect(page).toContain("@IRR");
    expect(page).toContain("None");
    expect(html([cell(0, "matched")]).match(/None/g)).toHaveLength(2);
  });

  it("passes the self-contained scan for the hand-built report and every fixture", () => {
    scan(page);
    const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: { path: string; format: string }[] };
    for (const f of manifest.fixtures.filter((x) => x.format === "wk1" || x.format === "wks")) {
      const { verification } = verifyBytes(new Uint8Array(readFileSync(f.path)));
      scan(renderReportHtml(buildReport({ fileName: f.path, sha256: "0".repeat(64), byteLength: 0, toolVersion: "0", verification })));
    }
  });
});
