import { describe, expect, it } from "vitest";
import { a1, parseA1 } from "../../../src/parser/address.ts";

describe("a1", () => {
  it("names the requirement examples", () => {
    expect(a1(0, 0)).toBe("A1");
    expect(a1(25, 0)).toBe("Z1");
    expect(a1(26, 0)).toBe("AA1");
    expect(a1(255, 8191)).toBe("IV8192");
  });
});

describe("parseA1", () => {
  it("accepts addresses in either case", () => {
    expect(parseA1("a1")).toEqual({ col: 0, row: 0 });
    expect(parseA1("A1")).toEqual({ col: 0, row: 0 });
    expect(parseA1("IV8192")).toEqual({ col: 255, row: 8191 });
    expect(parseA1("AA10")).toEqual({ col: 26, row: 9 });
  });

  it("rejects text that is not an address", () => {
    for (const text of ["", "A0", "1A", "A-1", "A", "12", "A01", " A1", "A1 ", "A1B"]) {
      expect(parseA1(text), text).toBeNull();
    }
  });

  it("rejects a column above 65535 or a row above 65536", () => {
    expect(parseA1(`${a1(65535, 0).slice(0, -1)}65536`)).toEqual({ col: 65535, row: 65535 });
    expect(parseA1(`${a1(65536, 0).slice(0, -1)}1`)).toBeNull();
    expect(parseA1("A65537")).toBeNull();
  });

  it("round trips sample cells", () => {
    for (const [col, row] of [
      [0, 0],
      [25, 0],
      [26, 1],
      [51, 2],
      [52, 3],
      [701, 99],
      [702, 100],
      [255, 8191],
      [65535, 65535],
    ] as const) {
      expect(parseA1(a1(col, row)), `${col},${row}`).toEqual({ col, row });
    }
  });
});
