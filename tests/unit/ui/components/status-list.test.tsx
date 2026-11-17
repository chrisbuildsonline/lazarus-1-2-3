// The phone status list (requirements 40, 41): groups Mismatched, Unverifiable, Matched; Matched collapsed.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusList } from "../../../../src/ui/components/StatusList.tsx";
import type { Status } from "../../../../src/verify/index.ts";
import { cellResult } from "../../helpers/raised.ts";

const CELLS = [
  cellResult(0, 0, "A1", "matched", 1),
  cellResult(1, 2, "B3", "mismatched", 18330, { lotusFormula: "@SUM(B5..B9)" }),
  cellResult(2, 3, "C4", "unverifiable", 2),
  cellResult(3, 4, "D5", "matched", 3),
];
const noop = () => {};
const render = (cells = CELLS, expanded: Set<Status> = new Set(), filter: "all" | Status = "all") =>
  renderToStaticMarkup(<StatusList cells={cells} expanded={expanded} filter={filter} selected={null} onToggle={noop} onOpen={noop} />);

const rowButtons = (html: string) => [...html.matchAll(/<button([^>]*class="status-row[^"]*"[^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({ attrs: m[1]!, inner: m[2]! }));
const label = (attrs: string) => /aria-label="([^"]*)"/.exec(attrs)?.[1];
const groupOrder = (html: string) => [...html.matchAll(/data-status="(\w+)"/g)].map((m) => m[1]);

describe("StatusList", () => {
  it("groups appear Mismatched, Unverifiable, Matched", () => {
    expect(groupOrder(render())).toEqual(["mismatched", "unverifiable", "matched"]);
  });

  it("the Matched group is a collapsed button and renders no rows", () => {
    const html = render();
    const head = /<button([^>]*aria-expanded="(true|false)"[^>]*)>([\s\S]*?)<\/button>/.exec(html)!;
    expect(head[2]).toBe("false");
    expect(head[3]!.replace(/<[^>]+>/g, "")).toBe("Matched 2 · Show all");
    expect(rowButtons(html).map((r) => label(r.attrs)!.split(",")[0])).toEqual(["B3", "C4"]);
  });

  it("expanding Matched renders its rows", () => {
    const html = render(CELLS, new Set(["matched"]));
    expect(html).toMatch(/aria-expanded="true"/);
    expect(rowButtons(html).map((r) => label(r.attrs)!.split(",")[0])).toEqual(["B3", "C4", "A1", "D5"]);
  });

  it("each row is a button named address, formula, value, status, with the pill text and the 64px row class", () => {
    const b3 = rowButtons(render()).find((r) => label(r.attrs)!.startsWith("B3"))!;
    expect(label(b3.attrs)).toBe("B3, @SUM(B5..B9), 18,330, Mismatched");
    expect(b3.attrs).toMatch(/class="status-row\b/);
    expect(b3.inner).toContain(">Mismatched<");
    expect(b3.inner).toContain("@SUM(B5..B9)");
    expect(b3.inner).toContain("18,330");
  });

  it("a group of 0 is absent", () => {
    const html = render([cellResult(0, 0, "A1", "matched", 1)]);
    expect(groupOrder(html)).toEqual(["matched"]);
    expect(html).not.toContain("Mismatched");
  });

  it("a filter shows only its group, expanded", () => {
    const html = render(CELLS, new Set(), "matched");
    expect(groupOrder(html)).toEqual(["matched"]);
    expect(rowButtons(html)).toHaveLength(2);
  });

  it("an empty filter shows its sentence", () => {
    const html = render([cellResult(0, 0, "A1", "matched", 1)], new Set(), "mismatched");
    expect(html).toContain("No mismatched cells on this sheet.");
    expect(rowButtons(html)).toHaveLength(0);
  });
});
