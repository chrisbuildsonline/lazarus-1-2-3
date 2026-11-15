import { describe, expect, it } from "vitest";
import { LAST_SERIAL, dateOf, serialOf } from "./serial-table.ts";

// The anchors from rules S19 and S20 (MAN 19-6, MEMB, WEIR), checked on the independent table.
const ANCHORS: [number, number, number, number][] = [
  [1, 1900, 1, 1],
  [2, 1900, 1, 2],
  [59, 1900, 2, 28],
  [60, 1900, 2, 29],
  [61, 1900, 3, 1],
  [367, 1901, 1, 1],
  [32509, 1989, 1, 1],
  [36525, 1999, 12, 31],
  [36526, 2000, 1, 1],
  [73050, 2099, 12, 31],
];

describe("serial table helper", () => {
  for (const [serial, y, m, d] of ANCHORS) {
    it(`S19/S20: serial ${serial} is ${y}-${m}-${d}`, () => {
      expect(serialOf(y, m, d)).toBe(serial);
      expect(dateOf(serial)).toEqual({ y, m, d });
    });
  }

  it("ends at 2099-12-31", () => {
    expect(LAST_SERIAL).toBe(73050);
    expect(dateOf(73051)).toBeNull();
    expect(serialOf(2100, 1, 1)).toBeNull();
  });

  it("has no 1901-02-29", () => {
    expect(serialOf(1901, 2, 29)).toBeNull();
  });
});
