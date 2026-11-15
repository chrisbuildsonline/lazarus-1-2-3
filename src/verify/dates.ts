// Lotus date serials (rules S18 to S20), by arithmetic only. Serial 1 is 1900-01-01, and 1900
// counts as a leap year, so serial 60 is the nonexistent 1900-02-29.

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** The S20 quirk: 1900 is a leap year; otherwise the Gregorian rule. */
const leap = (y: number) => y === 1900 || (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0));

/** Leap years from 1900 up to y - 1: real ones after 1899 (460 up to 1899), plus 1900 itself. */
const leapsBefore = (y: number) =>
  y === 1900 ? 0 : Math.floor((y - 1) / 4) - Math.floor((y - 1) / 100) + Math.floor((y - 1) / 400) - 460 + 1;

const monthLength = (y: number, month: number) => (month === 2 && leap(y) ? 29 : MONTH_DAYS[month - 1]!);

/**
 * year counts from 1900 (S18). Null for a non-integer argument, a year before 1900, or a month or
 * day that does not exist; the caller turns those into ERR or U06. No upper year limit here: the
 * 0..199 range is DATE's check.
 */
export function dateSerial(year: number, month: number, day: number): number | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 0 || month < 1 || month > 12) return null;
  const y = 1900 + year;
  if (day < 1 || day > monthLength(y, month)) return null;
  let before = 0;
  for (let m = 1; m < month; m++) before += monthLength(y, m);
  return 365 * year + leapsBefore(y) + before + day;
}
