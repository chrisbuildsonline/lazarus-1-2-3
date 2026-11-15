// Test-only: an independent Lotus date serial table. It walks the real calendar one day at a time
// with JS Date in UTC (no month-length or leap-year arithmetic of its own), starting at serial 1 =
// 1900-01-01, and inserts the nonexistent 1900-02-29 as serial 60 (rule S20). It shares nothing
// with src/verify/dates.ts. Ends at 2099-12-31, the last date the Lotus year range 0..199 reaches.

export type Ymd = { y: number; m: number; d: number };

const dates: Ymd[] = [{ y: 0, m: 0, d: 0 }]; // index = serial; index 0 unused
const serials = new Map<string, number>();
const key = (y: number, m: number, d: number) => `${y}-${m}-${d}`;

const add = (date: Ymd) => {
  serials.set(key(date.y, date.m, date.d), dates.length);
  dates.push(date);
};

for (let t = Date.UTC(1900, 0, 1); ; t += 86_400_000) {
  const day = new Date(t);
  const date = { y: day.getUTCFullYear(), m: day.getUTCMonth() + 1, d: day.getUTCDate() };
  if (date.y === 2100) break;
  add(date);
  if (date.y === 1900 && date.m === 2 && date.d === 28) add({ y: 1900, m: 2, d: 29 });
}

export const LAST_SERIAL = dates.length - 1;

/** Serial of a full-year date, or null when the table has no such day. */
export function serialOf(y: number, m: number, d: number): number | null {
  return serials.get(key(y, m, d)) ?? null;
}

export function dateOf(serial: number): Ymd | null {
  return serial >= 1 && serial <= LAST_SERIAL ? dates[serial]! : null;
}
