// The grid renders only the rows and columns in view plus an overscan (requirement 37).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { windowRange } from "../../../../src/ui/model/window.ts";

describe("windowRange", () => {
  it("starts at 0 at the top and adds the overscan after the viewport", () => {
    // 360 / 36 = 10 visible rows, plus 5 overscan.
    expect(windowRange({ scroll: 0, viewport: 360, size: 36, count: 1000, overscan: 5 })).toEqual({ start: 0, end: 15 });
  });

  it("adds the overscan on both sides in the middle", () => {
    // floor(720 / 36) = 20, ceil((720 + 360) / 36) = 30.
    expect(windowRange({ scroll: 720, viewport: 360, size: 36, count: 1000, overscan: 5 })).toEqual({ start: 15, end: 35 });
  });

  it("clamps to a count smaller than the viewport", () => {
    expect(windowRange({ scroll: 0, viewport: 900, size: 36, count: 3, overscan: 5 })).toEqual({ start: 0, end: 3 });
  });

  it("clamps the start to count - 1 at most when scrolled past the end", () => {
    const r = windowRange({ scroll: 100_000, viewport: 360, size: 36, count: 10, overscan: 5 });
    expect(r.start).toBeLessThanOrEqual(9);
    expect(r.end).toBe(10);
  });

  it("gives an empty range for no rows", () => {
    expect(windowRange({ scroll: 0, viewport: 360, size: 36, count: 0, overscan: 5 })).toEqual({ start: 0, end: 0 });
  });

  it("property: the visible range is inside the window, and the window is bounded", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400_000 }),
        fc.integer({ min: 1, max: 3000 }),
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 0, max: 10 }),
        (scroll, viewport, size, count, overscan) => {
          const { start, end } = windowRange({ scroll, viewport, size, count, overscan });
          const first = Math.min(count, Math.floor(scroll / size));
          const last = Math.min(count, Math.ceil((scroll + viewport) / size));
          expect(start).toBeGreaterThanOrEqual(0);
          expect(end).toBeLessThanOrEqual(count);
          if (last > first) {
            expect(start).toBeLessThanOrEqual(first);
            expect(end).toBeGreaterThanOrEqual(last);
          }
          expect(end - start).toBeLessThanOrEqual(Math.ceil(viewport / size) + 2 * overscan + 1);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it("keeps a full 8,192 by 256 sheet under 2,000 cells at 900 by 1000", () => {
    // Rows 36px with overscan 5, columns 112px with overscan 2 (design.md "Grid").
    for (const [top, left] of [[0, 0], [150_000, 10_000], [8192 * 36, 256 * 112]] as const) {
      const rows = windowRange({ scroll: top, viewport: 1000, size: 36, count: 8192, overscan: 5 });
      const cols = windowRange({ scroll: left, viewport: 900, size: 112, count: 256, overscan: 2 });
      expect((rows.end - rows.start) * (cols.end - cols.start)).toBeLessThan(2000);
    }
  });
});
