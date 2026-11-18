// Sheet tabs (requirement 55) and the DBF as-read totals (requirement 56).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SheetTabs } from "../../../../src/ui/components/SheetTabs.tsx";
import { TotalsSurface } from "../../../../src/ui/components/TotalsSurface.tsx";

const noop = () => {};
const tabs = (names: string[], selected = 0) => renderToStaticMarkup(<SheetTabs names={names} selected={selected} onSelect={noop} />);
const ZERO = { formulas: 0, matched: 0, mismatched: 0, unverifiable: 0, exact: 0, withinTolerance: 0, byReason: {} };

describe("SheetTabs", () => {
  it("renders nothing for one sheet", () => {
    expect(tabs(["Sheet1"])).toBe("");
  });

  it("is a tablist with one tab per sheet, the name as text", () => {
    const html = tabs(["A", "B", "Totals"], 1);
    expect(html).toMatch(/role="tablist"/);
    expect(html).toContain('aria-label="Sheets in this workbook"');
    const found = [...html.matchAll(/<button[^>]*role="tab"[^>]*>([^<]*)<\/button>/g)];
    expect(found.map((m) => m[1])).toEqual(["A", "B", "Totals"]);
  });

  it("marks the selected tab and gives only it a tab stop (roving tabindex)", () => {
    const html = tabs(["A", "B", "Totals"], 2);
    const found = [...html.matchAll(/<button([^>]*)>/g)].map((m) => m[1]!);
    expect(found.map((a) => /aria-selected="(\w+)"/.exec(a)![1])).toEqual(["false", "false", "true"]);
    expect(found.map((a) => /tabindex="(-?\d)"/.exec(a)![1])).toEqual(["-1", "-1", "0"]);
  });

  it("escapes a hostile sheet name", () => {
    expect(tabs(["<b>x</b>", "B"])).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

describe("TotalsSurface for a DBF sheet", () => {
  const html = renderToStaticMarkup(<TotalsSurface totals={ZERO} asRead={381} />);

  it("shows No formulas and the as-read line", () => {
    expect(html).toContain("No formulas");
    expect(html).toContain("381 values shown as read");
  });

  it("has no proof bar and no status pill", () => {
    expect(html).not.toMatch(/proof/i);
    expect(html).not.toMatch(/class="[^"]*\bpill\b/);
  });

  it("without asRead it is the WK1 surface, unchanged", () => {
    expect(renderToStaticMarkup(<TotalsSurface totals={ZERO} />)).toMatch(/proof/i);
  });
});
