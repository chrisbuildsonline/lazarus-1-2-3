// The windowed grid (requirements 33 to 35, 37). Expected values come from the manifest (O3) and the
// model built from the worker's answer, never from the markup.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import type { Cell } from "../../../../src/parser/index.ts";
import { Grid } from "../../../../src/ui/components/Grid.tsx";
import { buildGridModel, type GridModel } from "../../../../src/ui/model/grid-model.ts";
import { LAYOUT } from "../../../../src/ui/model/layout.ts";
import { cellResult, handBuilt, raiseFixture } from "../../helpers/raised.ts";

const VIEW = { width: 1200, height: 600 };
const noop = () => {};

const gridcells = (html: string) => [...html.matchAll(/<div([^>]*role="gridcell"[^>]*)>/g)].map((m) => m[1]!);
const attr = (attrs: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(attrs)?.[1];
const cellAt = (html: string, label: RegExp) => gridcells(html).find((a) => label.test(attr(a, "aria-label") ?? ""));

let ksbase: GridModel;
beforeAll(async () => {
  ksbase = buildGridModel(await raiseFixture("fixtures/ksbase/KSBASE.WK1"));
});

const render = (model: GridModel, more: Partial<Parameters<typeof Grid>[0]> = {}) =>
  renderToStaticMarkup(<Grid model={model} label="KSBASE.WK1" focus={{ col: 0, row: 0 }} selected={null} viewport={VIEW} onFocusCell={noop} onOpenCell={noop} {...more} />);

describe("Grid on KSBASE", () => {
  it("is a grid whose row and column counts are the model's plus the header", () => {
    const html = render(ksbase);
    const grid = /<div([^>]*role="grid"[^>]*)>/.exec(html)![1]!;
    expect(attr(grid, "aria-rowcount")).toBe(String(ksbase.rows + 1));
    expect(attr(grid, "aria-colcount")).toBe(String(ksbase.cols + 1));
  });

  it("every cell carries aria-rowindex and aria-colindex, starting after the header", () => {
    const cells = gridcells(render(ksbase));
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) {
      expect(Number(attr(c, "aria-rowindex"))).toBeGreaterThanOrEqual(2);
      expect(Number(attr(c, "aria-colindex"))).toBeGreaterThanOrEqual(2);
    }
    const a1 = cellAt(render(ksbase), /^A1, /)!;
    expect([attr(a1, "aria-rowindex"), attr(a1, "aria-colindex")]).toEqual(["2", "2"]);
  });

  it("exactly one cell is a tab stop: the focused one", () => {
    const html = render(ksbase, { focus: { col: 14, row: 2 } });
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(attr(cellAt(html, /^O3, /)!, "tabindex")).toBe("0");
  });

  it("O3 reads 0.25153768659966846, Matched (manifest), and carries the matched class", () => {
    const html = render(ksbase, { focus: { col: 14, row: 2 } });
    const o3 = cellAt(html, /^O3, /)!;
    expect(attr(o3, "aria-label")).toBe("O3, 0.25153768659966846, Matched");
    expect(attr(o3, "class")).toMatch(/\bcell--matched\b/);
  });

  it("labels and numbers carry their alignment class, and plain cells no status", () => {
    const html = render(ksbase);
    const a1 = cellAt(html, /^A1, OBSERV$/)!;
    expect(attr(a1, "class")).toMatch(/\bcell--left\b/);
    expect(attr(a1, "class")).not.toMatch(/cell--(matched|mismatched|unverifiable)/);
    expect(attr(cellAt(html, /^B3, 35,249$/)!, "class")).toMatch(/\bcell--right\b/);
  });

  it("column headers are columnheaders with letters, row numbers are rowheaders", () => {
    const html = render(ksbase);
    // The first columnheader is the corner above the row numbers; the letters follow.
    const heads = [...html.matchAll(/role="columnheader"[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(heads.slice(1, 4)).toEqual(["A", "B", "C"]);
    const rows = [...html.matchAll(/role="rowheader"[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(rows.slice(0, 3)).toEqual(["1", "2", "3"]);
  });

  it("renders only the window: fewer cells than the bound, and fewer than the used range", () => {
    const html = render(ksbase);
    // Rows: ceil(viewport / row) + 2 * overscan + 1, plus the focused row; columns likewise.
    const rows = Math.ceil(VIEW.height / LAYOUT.rowHeight) + 2 * LAYOUT.overscanRows + 2;
    const cols = Math.ceil(VIEW.width / LAYOUT.colWidth) + 2 * LAYOUT.overscanCols + 2;
    const n = gridcells(html).length;
    expect(n).toBeLessThanOrEqual(rows * cols);
    expect(n).toBeLessThan(ksbase.rows * ksbase.cols);
  });

  it("holds no colour literal in an inline style", () => {
    expect(render(ksbase)).not.toMatch(/style="[^"]*(#|rgb|hsl)/i);
  });
});

describe("Grid states on hand-built cells", () => {
  const formula = (col: number, row: number, cached: number): Cell => ({ kind: "formula", col, row, cached, rpn: new Uint8Array([3]) });
  const model = buildGridModel(
    handBuilt(
      [formula(0, 0, 6), formula(1, 0, 2), formula(2, 4, 1)],
      [cellResult(0, 0, "A1", "mismatched", 6), cellResult(1, 0, "B1", "unverifiable", 2), cellResult(2, 4, "C5", "matched", 1)],
    ),
  );

  it("a mismatched cell has the mismatched class and a name ending Mismatched", () => {
    const a1 = cellAt(render(model), /^A1, /)!;
    expect(attr(a1, "class")).toMatch(/\bcell--mismatched\b/);
    expect(attr(a1, "aria-label")).toMatch(/, Mismatched$/);
  });

  it("an unverifiable cell has the ring class", () => {
    const b1 = cellAt(render(model), /^B1, /)!;
    expect(attr(b1, "class")).toMatch(/\bcell--unverifiable\b/);
    expect(attr(b1, "aria-label")).toBe("B1, 2, Unverifiable");
  });

  it("the selected cell carries the selected class", () => {
    expect(attr(cellAt(render(model, { selected: { col: 0, row: 0 } }), /^A1, /)!, "class")).toMatch(/\bis-selected\b/);
  });

  it("a filter keeps only its rows, with their real aria-rowindex", () => {
    const html = render(model, { rowsShown: [4], focus: { col: 2, row: 4 } });
    const rowIndexes = new Set(gridcells(html).map((c) => attr(c, "aria-rowindex")));
    expect([...rowIndexes]).toEqual(["6"]);
  });

  it("an empty filter shows its sentence and no rows", () => {
    const html = render(model, { rowsShown: [], empty: "No mismatched cells on this sheet." });
    expect(gridcells(html)).toHaveLength(0);
    expect(html).toContain("No mismatched cells on this sheet.");
  });
});

describe("Grid during the verification sweep (seance-visuals requirements 18, 21)", () => {
  const formula = (col: number, row: number, cached: number): Cell => ({ kind: "formula", col, row, cached, rpn: new Uint8Array([3]) });
  const results = [cellResult(0, 0, "A1", "mismatched", 6), cellResult(1, 0, "B1", "unverifiable", 2), cellResult(2, 4, "C5", "matched", 1)];
  const model = buildGridModel(handBuilt([formula(0, 0, 6), formula(1, 0, 2), formula(2, 4, 1)], results));
  const rank = new Map(results.map((r, i) => [r.address, i]));
  const root = (html: string) => /<div([^>]*role="grid"[^>]*)>/.exec(html)![1]!;

  it("without the sweep prop the markup has no trace of it", () => {
    const html = render(model);
    expect(html).not.toMatch(/data-sweep|data-lit|cell--unlit/);
  });

  it("an unlit formula cell is a ghost with no status class, and its label still carries the real status", () => {
    const html = render(model, { sweep: { lit: 1, rank } });
    expect(attr(root(html), "data-sweep")).toBe("running");
    expect(attr(root(html), "data-lit")).toBe("1");
    const a1 = cellAt(html, /^A1, /)!;
    expect(attr(a1, "class")).toMatch(/\bcell--mismatched\b/);
    expect(attr(a1, "data-sweep")).toBe("lit");
    for (const [label, status] of [[/^B1, /, "Unverifiable"], [/^C5, /, "Matched"]] as const) {
      const c = cellAt(html, label)!;
      expect(attr(c, "class")).toMatch(/\bcell--unlit\b/);
      expect(attr(c, "class")).not.toMatch(/\bcell--(matched|mismatched|unverifiable)\b/);
      expect(attr(c, "data-sweep")).toBe("unlit");
      expect(attr(c, "aria-label")).toMatch(new RegExp(`, ${status}$`));
    }
  });

  it("once every cell is lit the grid says done and every cell shows its status", () => {
    const html = render(model, { sweep: { lit: 3, rank } });
    expect(attr(root(html), "data-sweep")).toBe("done");
    expect(attr(root(html), "data-lit")).toBe("3");
    expect(html).not.toMatch(/cell--unlit/);
    expect(attr(cellAt(html, /^C5, /)!, "class")).toMatch(/\bcell--matched\b/);
  });
});
