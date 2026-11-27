// The windowed sheet grid (DESIGN.md section 3, requirements 33 to 39). One scroll container; only the
// rows and columns inside the viewport plus the overscan, plus the focused cell, are in the DOM.
// Positions are set through the style property (transform), which a strict CSP allows.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { COPY } from "../copy.ts";
import { cellLabel, columnLetters, type GridModel } from "../model/grid-model.ts";
import { moveFocus, type GridPos } from "../model/grid-nav.ts";
import { LAYOUT } from "../model/layout.ts";
import { initialScrollLeft } from "../model/sweep.ts";
import { windowRange } from "../model/window.ts";

export type GridProps = {
  model: GridModel;
  /** The grid's accessible name (the file name). */
  label: string;
  focus: GridPos;
  /** The drawer's cell. */
  selected: GridPos | null;
  /** With a filter: the 0-based rows to show, ascending. */
  rowsShown?: readonly number[];
  /** The empty-filter sentence. */
  empty?: string | null;
  /** The size used before the first measurement (and in server markup). */
  viewport?: { width: number; height: number };
  onFocusCell: (pos: GridPos) => void;
  onOpenCell: (pos: GridPos) => void;
  /** Escape in the grid: closes the drawer, and focus stays on the cell. */
  onEscape?: () => void;
  /**
   * The verification sweep (seance-visuals requirement 18): formula cells whose verify-order rank is
   * `lit` or more show as unlit ghosts. Presentation only; labels keep the real status.
   */
  sweep?: { lit: number; rank: ReadonlyMap<string, number> };
  /** First and last column holding a formula: the grid opens scrolled to show them (requirement 26). */
  formulaCols?: { first: number; last: number } | null;
};

/** A cell whose value the ellipsis cuts, peeked by the pointer or by focus. */
type Peek = GridPos & { text: string; by: "hover" | "focus" };

/** The peek for a cell element, or null when its value fits. */
function peekOf(el: EventTarget | null, by: Peek["by"]): Peek | null {
  const cell = el instanceof Element ? el.closest<HTMLElement>("[data-col]") : null;
  const value = cell?.querySelector<HTMLElement>(".cell__value");
  if (!cell || !value || value.scrollWidth <= value.clientWidth) return null;
  return { col: Number(cell.dataset.col), row: Number(cell.dataset.row), text: value.textContent ?? "", by };
}

const range = (w: { start: number; end: number }) => Array.from({ length: Math.max(0, w.end - w.start) }, (_, i) => w.start + i);
const withIndex = (list: number[], i: number, count: number) => (i < 0 || i >= count || list.includes(i) ? list : [...list, i].sort((a, b) => a - b));
const sameCell = (a: GridPos | null, col: number, row: number) => a !== null && a.col === col && a.row === row;

export function Grid({ model, label, focus, selected, rowsShown, empty, viewport, onFocusCell, onOpenCell, onEscape, sweep, formulaCols }: GridProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [size, setSize] = useState(viewport ?? { width: 1200, height: 600 });
  const keyed = useRef(false);
  // Values solidify once per file (DESIGN.md section 3); scrolling later mounts cells without the effect.
  const [fresh, setFresh] = useState(true);
  // The full value of a cut cell, on hover and on focus (F19): a tooltip under the cell, outside the
  // scroll box so nothing clips it, kept on the cell while the grid or the page scrolls.
  const tip = useRef<HTMLDivElement>(null);
  const tipId = useId();
  const [peek, setPeek] = useState<Peek | null>(null);
  const showPeek = (next: Peek | null) => setPeek((old) => (old && next && old.col === next.col && old.row === next.row && old.by === next.by ? old : next));

  const place = useCallback(() => {
    const el = tip.current;
    if (!el || !peek) return;
    const cell = ref.current?.querySelector<HTMLElement>(`[data-col="${peek.col}"][data-row="${peek.row}"]`);
    if (!cell) {
      setPeek(null);
      return;
    }
    const r = cell.getBoundingClientRect();
    const { clientWidth: vw, clientHeight: vh } = document.documentElement;
    const edge = 8;
    const gap = 4;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // Numbers line up with the cell's right edge, text with its left edge; above it near the bottom.
    const x = cell.classList.contains("cell--right") ? r.right - w : r.left;
    el.style.left = `${Math.max(edge, Math.min(x, vw - edge - w))}px`;
    el.style.top = `${r.bottom + gap + h <= vh - edge ? r.bottom + gap : r.top - gap - h}px`;
  }, [peek]);
  useLayoutEffect(place);
  useEffect(() => {
    if (!peek) return;
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [peek, place]);

  const count = rowsShown ? rowsShown.length : model.rows;
  const rowAt = (i: number) => (rowsShown ? rowsShown[i]! : i);
  const indexOf = (row: number) => (rowsShown ? rowsShown.indexOf(row) : row);
  const bodyHeight = Math.max(0, size.height - LAYOUT.headerHeight);
  const bodyWidth = Math.max(0, size.width - LAYOUT.rowHeaderWidth);
  const page = Math.max(1, Math.floor(bodyHeight / LAYOUT.rowHeight));

  // The tab stop: the focused cell, or the first shown row when a filter hid the focused one.
  const at: GridPos = count === 0 || indexOf(focus.row) >= 0 ? focus : { col: focus.col, row: rowAt(0) };

  const rowWindow = windowRange({ scroll: scroll.top, viewport: bodyHeight, size: LAYOUT.rowHeight, count, overscan: LAYOUT.overscanRows });
  const colWindow = windowRange({ scroll: scroll.left, viewport: bodyWidth, size: LAYOUT.colWidth, count: model.cols, overscan: LAYOUT.overscanCols });
  const indices = withIndex(range(rowWindow), indexOf(at.row), count);
  const cols = withIndex(range(colWindow), at.col, model.cols);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Open on the proof: once per sheet, before the first paint, scroll just far enough to show the
  // formula columns. Under reduced motion too: it is a starting position, not motion.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !formulaCols) return;
    const left = initialScrollLeft(formulaCols.first, LAYOUT.colWidth, el.clientWidth - LAYOUT.rowHeaderWidth, formulaCols.last);
    if (left <= 0) return;
    el.scrollLeft = left;
    setScroll({ top: el.scrollTop, left: el.scrollLeft });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per model (sheet), never on a later render
  }, [model]);

  useLayoutEffect(() => {
    if (!keyed.current) return;
    keyed.current = false;
    const cell = ref.current?.querySelector<HTMLElement>(`[data-col="${at.col}"][data-row="${at.row}"]`);
    cell?.focus({ preventScroll: true });
    // reveal() scrolled the grid; this brings the cell into the page's viewport too (requirement 38).
    cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [at.col, at.row]);

  /** Scrolls just enough to bring a cell inside the viewport. */
  const reveal = (pos: GridPos) => {
    const el = ref.current;
    if (!el) return;
    const top = indexOf(pos.row) * LAYOUT.rowHeight;
    const left = pos.col * LAYOUT.colWidth;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + LAYOUT.rowHeight > el.scrollTop + bodyHeight) el.scrollTop = top + LAYOUT.rowHeight - bodyHeight;
    if (left < el.scrollLeft) el.scrollLeft = left;
    else if (left + LAYOUT.colWidth > el.scrollLeft + bodyWidth) el.scrollLeft = left + LAYOUT.colWidth - bodyWidth;
    setScroll({ top: el.scrollTop, left: el.scrollLeft });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Escape dismisses the peek without moving focus (WCAG 1.4.13), and closes the drawer as before.
    if (e.key === "Escape") setPeek(null);
    if (e.key === "Escape" && onEscape) {
      e.preventDefault();
      onEscape();
      return;
    }
    if (e.key === "Enter") {
      if (model.at(at.col, at.row).kind === "formula") {
        e.preventDefault();
        onOpenCell(at);
      }
      return;
    }
    const next = moveFocus(at, e.key, e.ctrlKey || e.metaKey, { cols: model.cols, rows: model.rows, page, rowsShown });
    if (!next) return;
    e.preventDefault();
    keyed.current = true;
    reveal(next);
    onFocusCell(next);
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-col]");
    if (!cell) return;
    const pos = { col: Number(cell.dataset.col), row: Number(cell.dataset.row) };
    onFocusCell(pos);
    if (model.at(pos.col, pos.row).kind === "formula") onOpenCell(pos);
  };

  const width = LAYOUT.rowHeaderWidth + model.cols * LAYOUT.colWidth;
  const sweeping = sweep !== undefined && sweep.lit < sweep.rank.size;
  const sweepAttrs = sweep && { "data-sweep": sweeping ? "running" : "done", "data-lit": sweep.lit };
  const x = (col: number) => `translateX(${LAYOUT.rowHeaderWidth + col * LAYOUT.colWidth}px)`;

  return (
    <div className="grid-frame">
      <div
        ref={ref}
        className={fresh ? "grid is-fresh" : "grid"}
        role="grid"
        aria-label={label}
        aria-rowcount={model.rows + 1}
        aria-colcount={model.cols + 1}
        onScroll={(e) => setScroll({ top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft })}
        onKeyDown={onKeyDown}
        onClick={onClick}
        onMouseOver={(e) => showPeek(peekOf(e.target, "hover"))}
        onMouseLeave={() => setPeek((old) => (old?.by === "hover" ? null : old))}
        onFocus={(e) => showPeek(peekOf(e.target, "focus"))}
        onBlur={() => setPeek((old) => (old?.by === "focus" ? null : old))}
        onAnimationEnd={() => setFresh(false)}
        {...sweepAttrs}
      >
        <div className="grid__head" role="row" aria-rowindex={1} style={{ width }}>
          <div className="grid__corner" role="columnheader" aria-colindex={1}>
            <span className="visually-hidden">{COPY.rowHeader}</span>
          </div>
          {cols.map((c) => (
            <div key={c} className="grid__colhead" role="columnheader" aria-colindex={c + 2} style={{ transform: x(c) }}>
              {columnLetters(c)}
            </div>
          ))}
        </div>
        <div className="grid__body" style={{ width, height: count * LAYOUT.rowHeight }}>
          {indices.map((i) => {
            const row = rowAt(i);
            return (
              <div key={row} className="grid__row" role="row" aria-rowindex={row + 2} style={{ transform: `translateY(${i * LAYOUT.rowHeight}px)` }}>
                <div className="grid__rowhead" role="rowheader" aria-colindex={1}>
                  {row + 1}
                </div>
                {cols.map((col) => {
                  const cell = model.at(col, row);
                  const address = `${columnLetters(col)}${row + 1}`;
                  const classes = ["cell", `cell--${cell.align}`];
                  if (cell.kind === "formula") classes.push("cell--formula");
                  const rank = sweeping && cell.status ? sweep.rank.get(address) : undefined;
                  const unlit = rank !== undefined && rank >= sweep!.lit;
                  if (unlit) classes.push("cell--unlit");
                  else if (cell.status) classes.push(`cell--${cell.status}`);
                  if (sameCell(selected, col, row)) classes.push("is-selected");
                  return (
                    <div
                      key={col}
                      className={classes.join(" ")}
                      role="gridcell"
                      aria-rowindex={row + 2}
                      aria-colindex={col + 2}
                      aria-label={cellLabel(address, cell)}
                      aria-selected={sameCell(selected, col, row) || undefined}
                      aria-describedby={sameCell(peek, col, row) ? tipId : undefined}
                      tabIndex={sameCell(at, col, row) ? 0 : -1}
                      data-col={col}
                      data-row={row}
                      data-sweep={rank === undefined ? undefined : unlit ? "unlit" : "lit"}
                      style={{ transform: x(col) }}
                    >
                      <span className="cell__value">{cell.text}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {count === 0 && empty && <p className="grid__empty">{empty}</p>}
      {peek && (
        <div ref={tip} id={tipId} role="tooltip" className="cell-peek">
          {peek.text}
        </div>
      )}
    </div>
  );
}
