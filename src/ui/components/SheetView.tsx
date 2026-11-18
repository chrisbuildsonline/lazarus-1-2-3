// The Sheet view (DESIGN.md 4.2, requirements 26 to 41): the title block with the report links, the
// batch list when there is one, the totals, the filters, and the grid (desktop and tablet) or the
// status list (phone).
import { useMemo, useState, type ReactNode } from "react";
import type { Status } from "../../verify/index.ts";
import type { RaisedFile } from "../../workers/verify-protocol.ts";
import { COPY } from "../copy.ts";
import type { FileItem } from "../model/batch-rows.ts";
import type { Skipped } from "../model/entries.ts";
import { formatNumber } from "../model/format-value.ts";
import { buildGridModel, columnLetters } from "../model/grid-model.ts";
import type { GridPos } from "../model/grid-nav.ts";
import { filterRows, statusCounts, type Filter } from "../model/status-groups.ts";
import { useFocusReturn } from "../hooks/useFocusReturn.ts";
import { drawerModel } from "../model/drawer-model.ts";
import { BatchList } from "./BatchList.tsx";
import { Drawer } from "./Drawer.tsx";
import { Filters } from "./Filters.tsx";
import { Grid } from "./Grid.tsx";
import { SheetTabs } from "./SheetTabs.tsx";
import { StatusList } from "./StatusList.tsx";
import { TotalsSurface } from "./TotalsSurface.tsx";

export type SheetViewProps = {
  file: RaisedFile;
  items: readonly FileItem[];
  skipped: readonly Skipped[];
  selectedId: number | null;
  phone: boolean;
  filter: Filter;
  /** The shown sheet of a multi-sheet workbook. */
  sheetIndex?: number;
  onSelectSheet?: (index: number) => void;
  /** The drawer's cell address. */
  cell: string | null;
  sample: boolean;
  /** Ref callback for the h1, which takes focus when the view appears. */
  titleRef: (el: HTMLHeadingElement | null) => void;
  /** The report links beside the title. */
  links: ReactNode;
  /** The step tabs on a phone, under the title (requirement 59 of the macro spec). */
  steps?: ReactNode;
  onSelectFile: (id: number) => void;
  onFilter: (f: Filter) => void;
  onOpenCell: (address: string) => void;
  onCloseCell: () => void;
  onCopy: (text: string) => void;
};

const address = (p: GridPos) => `${columnLetters(p.col)}${p.row + 1}`;

export function SheetView(p: SheetViewProps) {
  const { file, phone, filter } = p;
  const sheetIndex = Math.min(p.sheetIndex ?? 0, file.sheets.length - 1);
  const current = file.sheets[sheetIndex]!;
  const model = useMemo(() => buildGridModel(file, sheetIndex), [file, sheetIndex]);
  const counts = useMemo(() => statusCounts(current.verification.cells), [current]);
  const [focus, setFocus] = useState<GridPos>({ col: 0, row: 0 });
  const [expanded, setExpanded] = useState<ReadonlySet<Status>>(new Set());
  const selected = useMemo(() => {
    const r = p.cell === null ? undefined : model.formulaCells.find((c) => c.address === p.cell);
    return r ? { col: r.col, row: r.row } : null;
  }, [model, p.cell]);
  const rowsShown = useMemo(() => (filter === "all" ? undefined : model.rowsWithStatus(filter)), [model, filter]);
  const empty = filterRows(current.verification.cells, filter).empty;
  const batch = p.items.length > 1;
  const formulas = file.sheets.reduce((n, s) => n + s.verification.totals.formulas, 0);
  const sheetCount = file.sheets.length > 1 ? [COPY.sheetCount(formatNumber(file.sheets.length))] : [];
  const meta = [file.format.toUpperCase(), ...sheetCount, `${formatNumber(formulas)} formulas`, `${formatNumber(file.byteLength)} bytes`].join(" · ");
  // A DBF sheet has no formulas: its values are shown as read (header row included).
  const asRead = file.format === "dbf" ? current.sheet.cells.length : undefined;
  // A DBF has no formulas: no status filters, and the grid on every screen size (it scrolls in its box).
  const filters = asRead === undefined ? <Filters counts={counts} value={filter} onChange={p.onFilter} /> : null;
  const statusList = phone && asRead === undefined;
  const toggle = (s: Status) =>
    setExpanded((old) => {
      const next = new Set(old);
      if (!next.delete(s)) next.add(s);
      return next;
    });

  const result = p.cell === null ? undefined : current.verification.cells.find((c) => c.address === p.cell);
  const details = useMemo(() => (result ? drawerModel(result, current.verification.tolerance) : null), [result, current]);
  useFocusReturn(details?.address ?? null, (a) => {
    if (phone) return document.querySelector<HTMLElement>(`.status-row[data-address="${a}"]`);
    const r = model.formulaCells.find((c) => c.address === a);
    return r ? document.querySelector<HTMLElement>(`[role="grid"] [data-col="${r.col}"][data-row="${r.row}"]`) : null;
  });
  // While the drawer is open it follows the focused formula cell (requirement 47).
  const focusCell = (pos: GridPos) => {
    setFocus(pos);
    if (p.cell !== null && model.at(pos.col, pos.row).kind === "formula") p.onOpenCell(address(pos));
  };
  const drawer = details && <Drawer model={details} mode={phone ? "phone" : "desktop"} onClose={p.onCloseCell} onCopyExcel={p.onCopy} />;
  const classes = ["sheet", batch && "sheet--batch", details && !phone && "has-drawer"].filter(Boolean).join(" ");

  return (
    <main className={classes}>
      {/* Two rows so the grid starts high enough for 14 rows above the fold at 1440x900:
          the title with the filters, then the meta line with the report links. */}
      <div className="sheet__top">
        <div className="sheet__row">
          <h1 ref={p.titleRef} className="title" tabIndex={-1}>
            {file.name}
          </h1>
          {!phone && filters}
        </div>
        {p.steps}
        <div className="sheet__row">
          <p className="sheet__meta">
            {meta}
            {p.sample && ` · ${COPY.sampleLine}`}
          </p>
          <div className="sheet__links">{p.links}</div>
        </div>
      </div>
      <div className="sheet__body">
        {batch && <BatchList items={p.items} skipped={p.skipped} selectedId={p.selectedId} onSelect={p.onSelectFile} />}
        <div className="sheet__main">
          <SheetTabs names={file.sheets.map((s) => s.name)} selected={sheetIndex} onSelect={(i) => p.onSelectSheet?.(i)} />
          <TotalsSurface totals={current.verification.totals} asRead={asRead} />
          {statusList ? (
            <>
              {filters}
              <section className="surface">
                <StatusList cells={current.verification.cells} expanded={expanded} filter={filter} selected={p.cell} onToggle={toggle} onOpen={p.onOpenCell} />
              </section>
            </>
          ) : (
            <section className="surface grid-surface" aria-label={COPY.sheetLabel}>
              <Grid
                model={model}
                label={file.name}
                focus={focus}
                selected={selected}
                rowsShown={rowsShown}
                empty={empty}
                onFocusCell={focusCell}
                onOpenCell={(pos) => p.onOpenCell(address(pos))}
                onEscape={p.cell === null ? undefined : p.onCloseCell}
              />
            </section>
          )}
          {/* Right after the grid or the list in tab order (requirement 48). */}
          {drawer}
          {/* Phone: the list sits above, so a long sheet ends with a way back to it (requirement 61). */}
          {phone && batch && (
            <p className="sheet__back">
              <button type="button" className="btn-ghost" onClick={() => document.querySelector<HTMLElement>(".batch-row.is-selected")?.focus()}>
                {COPY.backToFiles}
              </button>
            </p>
          )}
        </div>
      </div>
      <p className="visually-hidden" aria-live="polite">
        {details ? COPY.cellOpen(details.address, COPY.status[details.status]) : ""}
      </p>
    </main>
  );
}
