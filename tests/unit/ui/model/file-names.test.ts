// Deterministic, safe download names (requirement 54).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { downloadName } from "../../../../src/ui/model/file-names.ts";

const KINDS = ["xlsx", "report-html", "report-json"] as const;
const SUFFIX = { xlsx: ".xlsx", "report-html": ".report.html", "report-json": ".report.json" } as const;
const FORBIDDEN = /[\\/:*?"<>|\u0000-\u001f]/;

describe("downloadName", () => {
  it("KSBASE.WK1 gives the three names", () => {
    expect(downloadName("KSBASE.WK1", "xlsx")).toBe("KSBASE.xlsx");
    expect(downloadName("KSBASE.WK1", "report-html")).toBe("KSBASE.report.html");
    expect(downloadName("KSBASE.WK1", "report-json")).toBe("KSBASE.report.json");
  });

  it("the examples of design.md", () => {
    expect(downloadName("a.b.wk1", "xlsx")).toBe("a.b.xlsx");
    expect(downloadName("C:\\old\\BOOK.WKS", "xlsx")).toBe("BOOK.xlsx");
    expect(downloadName("books/old/BOOK.wks", "xlsx")).toBe("BOOK.xlsx");
    expect(downloadName("nul.wk1", "xlsx")).toBe("_nul.xlsx");
    expect(downloadName("COM3.wk1", "xlsx")).toBe("_COM3.xlsx");
    expect(downloadName("lpt9.WK1", "report-json")).toBe("_lpt9.report.json");
    expect(downloadName("...wk1", "xlsx")).toBe("workbook.xlsx");
    expect(downloadName("a:b?.wk1", "xlsx")).toBe("a_b_.xlsx");
    expect(downloadName("", "xlsx")).toBe("workbook.xlsx");
  });

  it("only the final .wk1 or .wks goes, any case", () => {
    expect(downloadName("book.wk1.wk1", "xlsx")).toBe("book.wk1.xlsx");
    expect(downloadName("book.Wk1", "xlsx")).toBe("book.xlsx");
    expect(downloadName("book.wk3", "xlsx")).toBe("book.wk3.xlsx");
  });

  it("control characters become _ and dots and spaces at the ends are trimmed", () => {
    expect(downloadName("led\u0007ger.wk1", "xlsx")).toBe("led_ger.xlsx");
    expect(downloadName("  .book. .wk1", "xlsx")).toBe("book.xlsx");
  });

  it("a 300-character name is cut to 100 units", () => {
    expect(downloadName(`${"x".repeat(300)}.wk1`, "xlsx")).toBe(`${"x".repeat(100)}.xlsx`);
  });

  it("a cut that would split an emoji drops the whole pair", () => {
    const name = `${"x".repeat(99)}\u{1F47B}tail.wk1`; // the ghost is units 100 and 101
    expect(downloadName(name, "xlsx")).toBe(`${"x".repeat(99)}.xlsx`);
    expect(downloadName(`${"x".repeat(98)}\u{1F47B}tail.wk1`, "xlsx")).toBe(`${"x".repeat(98)}\u{1F47B}.xlsx`);
  });

  it("property: safe, right suffix, bounded, no lone surrogate at the end of the base, deterministic", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 400 }), fc.constantFrom(...KINDS), (name, kind) => {
        const out = downloadName(name, kind);
        expect(out).toBe(downloadName(name, kind));
        expect(out.endsWith(SUFFIX[kind])).toBe(true);
        const base = out.slice(0, -SUFFIX[kind].length);
        expect(FORBIDDEN.test(base)).toBe(false);
        expect(base.length).toBeGreaterThan(0);
        expect(base.length).toBeLessThanOrEqual(101);
        const last = base.charCodeAt(base.length - 1);
        expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
        expect(/^[ .]|[ .]$/.test(base)).toBe(false);
      }),
      { numRuns: 2000 },
    );
  });
});
