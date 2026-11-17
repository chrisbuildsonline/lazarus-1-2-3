// Which rows or columns of the grid are rendered (requirement 37): fixed sizes, so the window is
// computed from the scroll offset, never measured.
export function windowRange(args: { scroll: number; viewport: number; size: number; count: number; overscan: number }): { start: number; end: number } {
  const { scroll, viewport, size, count, overscan } = args;
  const end = Math.min(count, Math.ceil((scroll + viewport) / size) + overscan);
  const start = Math.min(Math.max(0, count - 1), Math.max(0, Math.floor(scroll / size) - overscan));
  return { start, end };
}
