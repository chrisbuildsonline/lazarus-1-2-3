// Keyboard movement in the grid (requirements 38, 39). Movement stops at the edges and never wraps.
// With a filter, rowsShown lists the visible 0-based rows and vertical keys move through that list.
export type GridPos = { col: number; row: number };
export type GridBounds = { cols: number; rows: number; page: number; rowsShown?: readonly number[] };

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));

/** The new position, or null when the key is not a grid key (the browser keeps it). */
export function moveFocus(pos: GridPos, key: string, ctrl: boolean, b: GridBounds): GridPos | null {
  const shown = b.rowsShown;
  const count = shown ? shown.length : b.rows;
  const rowAt = (i: number) => (count === 0 ? pos.row : shown ? shown[clamp(i, count - 1)]! : clamp(i, count - 1));
  const index = shown ? Math.max(0, shown.indexOf(pos.row)) : pos.row;
  const lastCol = b.cols - 1;
  switch (key) {
    case "ArrowUp":
      return { col: pos.col, row: rowAt(index - 1) };
    case "ArrowDown":
      return { col: pos.col, row: rowAt(index + 1) };
    case "PageUp":
      return { col: pos.col, row: rowAt(index - b.page) };
    case "PageDown":
      return { col: pos.col, row: rowAt(index + b.page) };
    case "ArrowLeft":
      return { col: clamp(pos.col - 1, lastCol), row: pos.row };
    case "ArrowRight":
      return { col: clamp(pos.col + 1, lastCol), row: pos.row };
    case "Home":
      return { col: 0, row: ctrl ? rowAt(0) : pos.row };
    case "End":
      return { col: lastCol, row: ctrl ? rowAt(count - 1) : pos.row };
    default:
      return null;
  }
}
