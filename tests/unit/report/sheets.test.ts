import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWorkbook } from "../../../src/parser/index.ts";
import { buildReport, renderReportHtml } from "../../../src/report/index.ts";
import { verifyWorkbook, type SheetVerification } from "../../../src/verify/index.ts";

const base = { fileName: "f", sha256: "0".repeat(64), byteLength: 10, toolVersion: "0.0.0" };

function sheetsOf(path: string) {
  const parsed = parseWorkbook(new Uint8Array(readFileSync(path)));
  const verifications = verifyWorkbook(parsed.workbook, "f");
  const fields = parsed.kind === "dbf" ? parsed.table.fields.map((f) => f.name) : undefined;
  return {
    format: parsed.workbook.format,
    sheets: parsed.workbook.sheets.map((s, i) => ({ name: s.name, verification: verifications[i]!, values: s.sheet.cells.size, ...(fields ? { fields } : {}) })),
  };
}

describe("buildReport over sheets", () => {
  it("one WK1 sheet: the report has no sheets field and the same totals as before", () => {
    const one = sheetsOf("fixtures/mixed/mixed.wk1");
    const old = buildReport({ ...base, verification: one.sheets[0]!.verification });
    expect(old).not.toHaveProperty("sheets");
    const now = buildReport({ ...base, ...one });
    expect(now.totals).toEqual(old.totals);
    expect(now.rows).toEqual(old.rows);
  });

  it("WK3: per-sheet totals, summed totals, sheet-qualified rows and the WK3 wording", () => {
    const report = buildReport({ ...base, ...sheetsOf("fixtures/wk3-sheets/wk3-sheets.wk3") });
    expect(report.source.format).toBe("wk3");
    expect(report.sheets!.map((s) => [s.name, s.format, s.totals.formulas])).toEqual([
      ["A", "wk3", 0],
      ["B", "wk3", 0],
      ["Totals", "wk3", 1],
    ]);
    expect(report.totals).toMatchObject({ formulas: 1, matched: 0, unverifiable: 1, byReason: { "wk3-formula-not-decoded": 1 } });
    expect(report.rows.map((r) => r.address)).toEqual(["Totals!C2"]);
    expect(report.sheets![2]!.wording).toBe("Formulas in WK3 files are not read yet. The stored results are kept as the file remembers them.");
  });

  it("DBF: no formulas and the as-read line", () => {
    const report = buildReport({ ...base, ...sheetsOf("fixtures/natural-earth-land/ne_110m_land.dbf") });
    const [table] = report.sheets!;
    // 381 values plus the 3 field names of the header row (differential test: 381 cells).
    expect(table).toMatchObject({ name: "Table", format: "dbf", asRead: 384, fields: ["featurecla", "scalerank", "min_zoom"] });
    expect(table!.wording).toBe("A dBase table has no formulas. 384 values shown as read.");
    expect(report.totals.formulas).toBe(0);
    expect(renderReportHtml(report)).toContain("384 values shown as read.");
  });

  it("escapes a hostile sheet name and field name in the HTML", () => {
    const v: SheetVerification = sheetsOf("fixtures/natural-earth-land/ne_110m_land.dbf").sheets[0]!.verification;
    const html = renderReportHtml(buildReport({ ...base, format: "dbf", sheets: [{ name: '<b>&"', verification: v, values: 1, fields: ["<i>x</i>"] }] }));
    expect(html).toContain("&lt;b&gt;&amp;&quot;");
    expect(html).toContain("&lt;i&gt;x&lt;/i&gt;");
    expect(html).not.toContain("<b>&");
    expect(html).not.toContain("<i>x</i>");
  });
});
