// Keyboard movement in the grid (requirements 38, 39): one cell per arrow, edges stop, never wrap.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { moveFocus } from "../../../../src/ui/model/grid-nav.ts";

const grid = { cols: 10, rows: 20, page: 7 };
const at = (col: number, row: number) => ({ col, row });

describe("moveFocus", () => {
  it("arrows move one cell", () => {
    expect(moveFocus(at(3, 3), "ArrowUp", false, grid)).toEqual(at(3, 2));
    expect(moveFocus(at(3, 3), "ArrowDown", false, grid)).toEqual(at(3, 4));
    expect(moveFocus(at(3, 3), "ArrowLeft", false, grid)).toEqual(at(2, 3));
    expect(moveFocus(at(3, 3), "ArrowRight", false, grid)).toEqual(at(4, 3));
  });

  it("arrows stop at every edge", () => {
    expect(moveFocus(at(0, 0), "ArrowUp", false, grid)).toEqual(at(0, 0));
    expect(moveFocus(at(0, 0), "ArrowLeft", false, grid)).toEqual(at(0, 0));
    expect(moveFocus(at(9, 19), "ArrowDown", false, grid)).toEqual(at(9, 19));
    expect(moveFocus(at(9, 19), "ArrowRight", false, grid)).toEqual(at(9, 19));
  });

  it("Home and End go to the first and last column of the row", () => {
    expect(moveFocus(at(4, 6), "Home", false, grid)).toEqual(at(0, 6));
    expect(moveFocus(at(4, 6), "End", false, grid)).toEqual(at(9, 6));
  });

  it("Ctrl+Home and Ctrl+End go to the first cell and the last used cell", () => {
    expect(moveFocus(at(4, 6), "Home", true, grid)).toEqual(at(0, 0));
    expect(moveFocus(at(4, 6), "End", true, grid)).toEqual(at(9, 19));
  });

  it("PageDown and PageUp move by one page of rows and clamp", () => {
    expect(moveFocus(at(2, 3), "PageDown", false, grid)).toEqual(at(2, 10));
    expect(moveFocus(at(2, 15), "PageDown", false, grid)).toEqual(at(2, 19));
    expect(moveFocus(at(2, 10), "PageUp", false, grid)).toEqual(at(2, 3));
    expect(moveFocus(at(2, 3), "PageUp", false, grid)).toEqual(at(2, 0));
  });

  it("with a filter, vertical keys move through the rows shown", () => {
    const filtered = { ...grid, rowsShown: [2, 5, 9] };
    expect(moveFocus(at(1, 2), "ArrowDown", false, filtered)).toEqual(at(1, 5));
    expect(moveFocus(at(1, 2), "ArrowUp", false, filtered)).toEqual(at(1, 2));
    expect(moveFocus(at(1, 9), "ArrowDown", false, filtered)).toEqual(at(1, 9));
    expect(moveFocus(at(1, 2), "PageDown", false, filtered)).toEqual(at(1, 9));
    expect(moveFocus(at(1, 9), "PageUp", false, filtered)).toEqual(at(1, 2));
    expect(moveFocus(at(4, 5), "Home", true, filtered)).toEqual(at(0, 2));
    expect(moveFocus(at(4, 5), "End", true, filtered)).toEqual(at(9, 9));
    expect(moveFocus(at(1, 2), "ArrowDown", false, { ...grid, rowsShown: [] })).toEqual(at(1, 2));
  });

  it("returns null for a key that is not a grid key", () => {
    for (const key of ["a", "Tab", "Enter"]) expect(moveFocus(at(1, 1), key, false, grid)).toBeNull();
  });

  it("property: any key sequence keeps the position inside the grid", () => {
    const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "x"];
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 300 }),
        fc.integer({ min: 1, max: 9000 }),
        fc.integer({ min: 1, max: 60 }),
        fc.array(fc.tuple(fc.constantFrom(...keys), fc.boolean()), { maxLength: 60 }),
        (cols, rows, page, steps) => {
          let pos = at(0, 0);
          for (const [key, ctrl] of steps) {
            pos = moveFocus(pos, key, ctrl, { cols, rows, page }) ?? pos;
            expect(pos.col).toBeGreaterThanOrEqual(0);
            expect(pos.col).toBeLessThan(cols);
            expect(pos.row).toBeGreaterThanOrEqual(0);
            expect(pos.row).toBeLessThan(rows);
          }
        },
      ),
    );
  });
});
