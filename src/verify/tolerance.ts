// The one place a numeric comparison tolerance exists (requirement 26). Provisional: set in
// task 3, signed off in task 50 from the largest difference measured on the real fixtures.
// Why these numbers: design.md, "Tolerance".

export const TOLERANCE = { relative: 1e-12, absolute: 1e-12 } as const;

export type Tolerance = typeof TOLERANCE;

/**
 * True when the doubles are identical (-0 equal to 0), or both finite and
 * |a - b| <= max(relative * max(|a|, |b|), absolute). False for any NaN, and for an infinity
 * unless the other side is the same infinity.
 */
export function withinTolerance(a: number, b: number): boolean {
  if (a === b) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= Math.max(TOLERANCE.relative * Math.max(Math.abs(a), Math.abs(b)), TOLERANCE.absolute);
}
