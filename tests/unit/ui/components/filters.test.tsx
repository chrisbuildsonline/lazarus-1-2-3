// The status filters: pill tabs with counts and a roving tabindex (requirement 39).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Filters } from "../../../../src/ui/components/Filters.tsx";

const COUNTS = { all: 7, matched: 3, mismatched: 3, unverifiable: 1 };
const tabs = (html: string) =>
  [...html.matchAll(/<button([^>]*role="tab"[^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({ attrs: m[1]!, text: m[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() }));

describe("Filters", () => {
  it("is a tablist of four tabs with counts", () => {
    const html = renderToStaticMarkup(<Filters counts={COUNTS} value="all" onChange={() => {}} />);
    expect(html).toMatch(/role="tablist"/);
    expect(tabs(html).map((t) => t.text)).toEqual(["All 7", "Matched 3", "Mismatched 3", "Unverifiable 1"]);
  });

  it("the chosen tab is selected and the only tab stop", () => {
    const t = tabs(renderToStaticMarkup(<Filters counts={COUNTS} value="mismatched" onChange={() => {}} />));
    expect(t.map((x) => /aria-selected="(\w+)"/.exec(x.attrs)![1])).toEqual(["false", "false", "true", "false"]);
    expect(t.map((x) => /tabindex="(-?\d)"/.exec(x.attrs)![1])).toEqual(["-1", "-1", "0", "-1"]);
  });

  it("counts are grouped", () => {
    const html = renderToStaticMarkup(<Filters counts={{ all: 1204, matched: 1180, mismatched: 3, unverifiable: 21 }} value="all" onChange={() => {}} />);
    expect(tabs(html)[0]!.text).toBe("All 1,204");
  });
});
