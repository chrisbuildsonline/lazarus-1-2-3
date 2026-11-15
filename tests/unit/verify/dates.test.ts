import { describe, expect, it } from "vitest";
import { dateSerial } from "../../../src/verify/dates.ts";
import { LAST_SERIAL, dateOf } from "../helpers/serial-table.ts";

// dateSerial takes the Lotus year (years since 1900, S18), month and day.

describe("dateSerial against the day-by-day table", () => {
  it("S18-S20: agrees with the independent table for every day from serial 1 to 73050", () => {
    expect(LAST_SERIAL).toBe(73050);
    const wrong: string[] = [];
    for (let serial = 1; serial <= LAST_SERIAL; serial++) {
      const { y, m, d } = dateOf(serial)!;
      const got = dateSerial(y - 1900, m, d);
      if (got !== serial && wrong.length < 5) wrong.push(`${y}-${m}-${d}: expected ${serial}, got ${got}`);
    }
    expect(wrong).toEqual([]);
  });

  it("S19: the anchors (MAN 19-6, MEMB)", () => {
    expect(dateSerial(0, 1, 1)).toBe(1);
    expect(dateSerial(0, 1, 2)).toBe(2);
    expect(dateSerial(1, 1, 1)).toBe(367);
    expect(dateSerial(89, 1, 1)).toBe(32509);
    expect(dateSerial(99, 12, 31)).toBe(36525);
    expect(dateSerial(100, 1, 1)).toBe(36526);
    expect(dateSerial(199, 12, 31)).toBe(73050);
  });

  it("S18: a month outside 1..12 is null", () => {
    expect(dateSerial(83, 0, 8)).toBeNull();
    expect(dateSerial(83, 13, 8)).toBeNull();
    expect(dateSerial(83, 14, 8)).toBeNull();
  });

  it("S18: a day that is not in the month is null", () => {
    expect(dateSerial(83, 4, 0)).toBeNull();
    expect(dateSerial(83, 1, 32)).toBeNull();
    expect(dateSerial(83, 4, 31)).toBeNull();
    expect(dateSerial(83, 2, 30)).toBeNull();
  });

  it("S20: 29 February is 60 in 1900, null in 1901, 36585 in 2000", () => {
    expect(dateSerial(0, 2, 29)).toBe(60);
    expect(dateSerial(1, 2, 29)).toBeNull();
    // 2000-01-01 is 36526 (S19); + 31 days of January + 28 = 36585, which dates.wk1 stores too.
    expect(dateSerial(100, 2, 29)).toBe(36585);
  });

  it("a non-integer argument is null", () => {
    expect(dateSerial(82.5, 9, 27)).toBeNull();
    expect(dateSerial(82, 9.5, 27)).toBeNull();
    expect(dateSerial(82, 9, 27.25)).toBeNull();
    expect(dateSerial(NaN, 1, 1)).toBeNull();
  });

  it("a year before 1900 is null", () => {
    expect(dateSerial(-1, 12, 31)).toBeNull();
  });

  it("S20: 59 is 1900-02-28, 60 the nonexistent 1900-02-29, 61 is 1900-03-01 (WEIR)", () => {
    expect(dateSerial(0, 2, 28)).toBe(59);
    expect(dateSerial(0, 2, 29)).toBe(60);
    expect(dateSerial(0, 3, 1)).toBe(61);
  });
});
