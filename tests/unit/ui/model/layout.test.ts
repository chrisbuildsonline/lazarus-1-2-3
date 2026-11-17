// LAYOUT (the window arithmetic) equals the grid custom properties of app.css, which are built from the
// spacing tokens (design.md "Grid", requirement 37).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LAYOUT } from "../../../../src/ui/model/layout.ts";

const tokens = new Map([...readFileSync("src/ui/tokens.css", "utf8").matchAll(/--(space-\d+):\s*(\d+)px;/g)].map((m) => [m[1]!, Number(m[2])]));

/** Pixels of a custom property of app.css: var(--space-n) replaced by its token, then the arithmetic. */
function px(name: string): number {
  const css = readFileSync("src/ui/styles/app.css", "utf8");
  const raw = new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1];
  if (!raw) throw new Error(`--${name} is not defined in app.css`);
  const expr = raw.replace(/var\(--(space-\d+)\)/g, (_, t: string) => String(tokens.get(t))).replace(/calc|px/g, "");
  if (!/^[\d\s+*/().-]+$/.test(expr)) throw new Error(`--${name} is not plain arithmetic: ${raw}`);
  return Function(`return (${expr});`)() as number;
}

describe("LAYOUT", () => {
  it("equals the grid custom properties built from the tokens", () => {
    expect(px("grid-row")).toBe(LAYOUT.rowHeight);
    expect(px("grid-head")).toBe(LAYOUT.headerHeight);
    expect(px("grid-col")).toBe(LAYOUT.colWidth);
    expect(px("grid-rowhead")).toBe(LAYOUT.rowHeaderWidth);
  });

  it("matches DESIGN.md: row 36, header 32, row number 48, and the column of design.md, 112", () => {
    expect(LAYOUT).toMatchObject({ rowHeight: 36, headerHeight: 32, rowHeaderWidth: 48, colWidth: 112 });
  });
});
