// Fixed grid sizes in pixels (DESIGN.md section 3, requirements 33 and 37). The window is computed from
// these, never measured; styles/app.css builds the same numbers from the spacing tokens.
export const LAYOUT = {
  /** --grid-row: calc(var(--space-8) + var(--space-1)) */
  rowHeight: 36,
  /** --grid-head: var(--space-8) */
  headerHeight: 32,
  /** --grid-col: calc(var(--space-14) * 2) */
  colWidth: 112,
  /** --grid-rowhead: calc(var(--space-10) + var(--space-2)) */
  rowHeaderWidth: 48,
  overscanRows: 5,
  overscanCols: 2,
} as const;
