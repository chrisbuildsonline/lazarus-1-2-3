# Design: Seance UI (F8)

## Layout

```
src/workers/
  verify-protocol.ts     + RaiseRequest, RaiseProgress, RaiseResponse, RaisedFile, handleRaiseRequest, sheetToWire, sheetFromWire   (additive)
  raise.worker.ts        installs handleRaiseRequest on the worker scope; no logic
src/ui/
  tokens.css             copy of the DESIGN.md section 2 block (task 1)
  main.tsx               imports tokens.css and styles/app.css, mounts <App/>
  App.tsx                owns the reducer, the worker client and the screen switch
  copy.ts                every user-facing string (DESIGN.md section 7 plus the strings of this spec)
  model/                 pure view-model functions, no React, no DOM
    format-value.ts      formatNumber, formatValue, missingValueText
    totals.ts            percentVerified, proofSegments, headline, describeTotals
    file-names.ts        downloadName
    entries.ts           acceptEntry, planBatch (filter, sort, dedupe, caps), LIMITS
    classify-file.ts     classifyRaised: raised | unsupported | failed
    grid-model.ts        buildGridModel, cellLabel, columnLetters, usedRange
    status-groups.ts     groupByStatus, filterRows, statusCounts
    window.ts            windowRange
    grid-nav.ts          moveFocus
    batch-rows.ts        batchRow, worstStatus, rowLine
    drawer-model.ts      drawerModel
    app-state.ts         AppState, AppAction, appReducer
  io/                    the only code that touches the DOM, the File API, the worker or the network
    drop.ts              collectDropped(dataTransfer), collectFromEntries(entries): pure over entry-like objects
    sample.ts            loadSample(): the one fetch
    worker-client.ts     createRaiseClient(makeWorker)
    downloads.ts         buildDownload(kind, raised), saveBlob(doc, name, data, mime), lazy import of xlsx and report
  components/            presentational React components, props in, events out
    StatusPill.tsx  ProofBar.tsx  TotalsSurface.tsx  DropZone.tsx  SummonView.tsx  ProgressSurface.tsx
    ErrorPanel.tsx  SheetView.tsx  Grid.tsx  StatusList.tsx  Filters.tsx  Drawer.tsx  BatchList.tsx  Toast.tsx  TopBar.tsx
  hooks/                 useMatchMedia (phone), useRaise (client plus reducer), useFocusReturn
  styles/app.css         layout and states, tokens only
tests/unit/ui/            mirrors src/ui; component tests are *.test.tsx
tests/unit/workers/raise-protocol.test.ts
e2e/seance-*.spec.ts, e2e/fixtures/seance-files.ts
```

Dependency rules (structure.md, extended): `ui` imports `src/workers` (types and `sheetFromWire`), `src/parser` (types, `a1`), `src/verify` (types), and, by dynamic `import()` only, `src/xlsx` and `src/report`. `src/ui/model` imports no React and no DOM types. `src/workers` imports `src/parser`, `src/verify`, `src/report/sha256.ts`. Nothing in `src/ui` imports `src/cli`, `exceljs` or `node:*`. A purity test enforces this (task 2).

## Reused, not rebuilt

| Need | Reused function | From |
|---|---|---|
| Parse | `parseWk1` | `src/parser` (worker only) |
| Verify | `verifySheet` | `src/verify` (worker only) |
| Hash | `sha256Hex` | `src/report` (worker) |
| Workbook | `writeXlsx` | `src/xlsx` (lazy) |
| Report | `buildReport`, `renderReportHtml`, `serializeReportJson` | `src/report` (lazy) |
| Address text | `a1` | `src/parser` |
| Types | `Cell`, `Sheet`, `CellResult`, `SheetVerification`, `Totals`, `Value`, `Status`, `Reason`, `Tolerance`, `Diagnostic` | `src/parser`, `src/verify` |

The worker calls `parseWk1` and `verifySheet` itself instead of `verifyBytes`, because it needs the `Sheet` that `verifyBytes` drops. Those two calls are the whole body of `verifyBytes`; the handler adds the hash and the progress messages.

## Worker protocol

```ts
export type RaiseRequest = { type: "raise"; id: number; name: string; bytes: ArrayBuffer }; // bytes transferred
export type RaiseProgress = { type: "progress"; id: number; step: "read" | "check" };

export type WireSheet = Omit<Sheet, "cells"> & { cells: Cell[] }; // row-major; no Map
export type RaisedFile = {
  name: string;
  byteLength: number;
  sha256: string | null;           // null when crypto.subtle is missing
  diagnostics: Diagnostic[];
  sheet: WireSheet;
  verification: SheetVerification;
};
export type RaiseResponse =
  | RaiseProgress
  | { type: "raised"; id: number; file: RaisedFile }
  | { type: "error"; id: number | null; message: string };

export function handleRaiseRequest(request: unknown, post: (m: RaiseResponse) => void, deps?: Deps): Promise<void>;
```

`handleRaiseRequest` validates the shape (same rules as `handleVerifyRequest`: integer id, `type` "raise", an `ArrayBuffer`, a string name), parses, posts `read`, verifies with `name` set, posts `check`, hashes, and posts `raised`. Any exception becomes an `error` response with the id. It is async only because of the hash. `deps` (`parse`, `verify`, `hash`) default to the real functions so tests can inject a throwing one. `sheetToWire(sheet)` sorts cells in row-major order (`cellsInRowMajorOrder`). `sheetFromWire(wire)` rebuilds the `Map` with `cellKey`, and a test shows `sheetFromWire(sheetToWire(s))` deep-equals `s` for every fixture.

`rpn: Uint8Array` inside formula cells clones as a typed array. Only the formula cells' `rpn` is needed by the UI, and only for `writeXlsx` through `Sheet`; the grid reads `verification.cells`.

### Client

```ts
export type RaiseClient = {
  raise(file: { name: string; bytes: ArrayBuffer }, on: (m: RaiseResponse) => void): Promise<void>; // resolves when answered
  dispose(): void;
};
export function createRaiseClient(makeWorker: () => WorkerLike): RaiseClient;
```

The client creates the worker on first use, assigns increasing ids, transfers the buffer, runs one request at a time (a FIFO), and turns `worker.onerror` (including a failed script load), `onmessageerror` and a throwing `makeWorker` into an `error` response for the request in flight and for every queued one. `dispose()` terminates the worker and drops the queue. `WorkerLike` is `{ postMessage(m, transfer): void; terminate(): void; onmessage; onerror; onmessageerror }`, so a Node test uses a fake. The app builds the real one with `new Worker(new URL("../workers/raise.worker.ts", import.meta.url), { type: "module" })`, which Vite emits as a hashed file under `/assets/`.

A summon calls `dispose()` on the old client and makes a new one, so a worker still busy with an old batch cannot delay the new one, and its late messages carry ids nobody waits for (requirement 24). The reducer also keeps `batchId` and ignores actions with another one.

## State

```ts
type Phase = "queued" | "reading" | "checking" | "raised" | "failed" | "unsupported";
type FileItem = {
  id: number; name: string; path: string; size: number; phase: Phase;
  raised?: RaisedFile;               // phase raised, or failed with a sheet
  failure?: { reason: string; lines: string[] };
};
type Skipped = { path: string; why: "extension" | "too-large" | "unreadable" | "over-limit" };
type AppState = {
  view: "summon" | "sheet";
  batchId: number;
  items: FileItem[];
  skipped: Skipped[];
  selectedId: number | null;
  userPicked: boolean;                // the person chose a file; stops auto-open
  filter: "all" | Status;
  cell: { address: string } | null;   // drawer target; row and column come from the model
  panel: null | { kind: "unsupported" | "failed" | "worker"; lines: string[] };
  toasts: Toast[];
};
```

Actions: `summoned(entries, skipped)`, `progress(id, step)`, `raised(id, file)`, `workerFailed(message)`, `selectFile(id)`, `setFilter`, `openCell`, `closeCell`, `toast`, `dismissToast`, `reset`. The reducer is pure and has no timers; the 4 s toast timeout lives in the component.

View rules: `view` is `sheet` once some item is `raised`; until then `summon`. A single `failed` or `unsupported` item with nothing raised keeps `view: "summon"` with `panel` set. A batch with at least one raised item shows the sheet; failed items stay as rows.

## Pure model

All of these have a unit test first. Examples are from this repository's data.

```ts
// format-value.ts
formatNumber(n: number): string          // shortest round-trip digits; thousands separators when |n| < 1e15 and no exponent
formatValue(v: Value | null, missing: "cached" | "recalculated"): string   // ERR, NA, quoted string, or the missing-value copy
```

`formatNumber` takes `String(n)`, and when it has no `e`, groups the integer part by three. `formatNumber(0.25153768659966846)` is `0.25153768659966846` (KSBASE O3, manifest). `formatNumber(35249)` is `35,249`. `formatNumber(1e100)` is `1e+100`. `-0` is `0`. A property test: removing commas and `Number()` gives the same double for any finite double (`Object.is` except `-0`).

```ts
// totals.ts
percentVerified(t: Totals): { kind: "none" } | { kind: "pct"; tenths: number }   // floor(matched*1000/formulas)
headline(t: Totals): string              // "98.0%" or "No formulas"
proofSegments(t: Totals): { status: Status; fraction: number }[]                 // no entry for a zero count; fractions sum to 1 within 1e-12
describeTotals(t: Totals): string        // "160 matched, 0 mismatched, 0 unverifiable"
```

Integer arithmetic: `Math.floor((matched * 1000) / formulas)` is exact for any realistic count, because the division of two integers below 2^53 rounds correctly and a non-integer quotient cannot land on an integer. Property: `tenths === 1000` if and only if `matched === formulas`. Examples: 1180 of 1204 is 98.0 (floor of 980.07). 999 of 1000 is 99.9. 99,999 of 100,000 is 99.9.

```ts
// file-names.ts
downloadName(entryName: string, kind: "xlsx" | "report-html" | "report-json"): string
```

Rules in requirement 54. Examples: `KSBASE.WK1` gives `KSBASE.xlsx`; `a.b.wk1` gives `a.b.xlsx`; `C:\old\BOOK.WKS` gives `BOOK.xlsx`; `nul.wk1` gives `_nul.xlsx`; `...wk1` gives `workbook.xlsx`; `a:b?.wk1` gives `a_b_.xlsx`. Property: the output has no character from the forbidden set, is at most 100 + the longest suffix long, and never lone-surrogate-ends the base.

```ts
// entries.ts
export const LIMITS = { maxEntries: 500, maxBytes: 32 * 1024 * 1024 } as const;
planBatch(found: FoundFile[]): { accepted: FoundFile[]; skipped: Skipped[] }
```

`FoundFile` is `{ path: string; name: string; size: number }` plus an opaque `file` handle. `planBatch` skips non-`.wk1`/`.wks` (case-insensitive), drops duplicate paths, sorts by path in code-unit order, then enforces `maxBytes` (skip with `too-large`) and `maxEntries` (the rest are `over-limit`). Property: result order is independent of input order.

```ts
// classify-file.ts
classifyRaised(file: RaisedFile): { kind: "raised" } | { kind: "unsupported" } | { kind: "failed"; lines: string[] }
```

`failed` lines are `offset 0x01A4  <message>` from the parser diagnostics of severity `error`, in order, capped at 50 with a final "and N more" line.

```ts
// grid-model.ts
buildGridModel(file: RaisedFile): GridModel
type GridModel = {
  rows: number; cols: number;                       // used range, 1-based counts
  at(col: number, row: number): DisplayCell;        // O(1); empty cells are shared
  rowsWithStatus(s: Status): number[];              // ascending 0-based rows
  formulaCells: CellResult[];                       // verify order
};
type DisplayCell = {
  col: number; row: number; address: string;
  kind: "empty" | "number" | "label" | "formula";
  text: string;                                      // display text
  align: "left" | "right" | "center";
  status: Status | null;                             // formula cells only
};
cellLabel(c: DisplayCell): string                    // "B3, 18,330, Mismatched"
columnLetters(col: number): string                   // 0 gives "A", 25 gives "Z", 26 gives "AA", 255 gives "IV"
```

A formula cell's `text` is its cached value through `formatValue`. The model is built once per raised file and memoised. It indexes `verification.cells` by `cellKey` and the wire cells by `cellKey`; a label cell with prefix `\` or `|` aligns left (requirement 34).

```ts
// window.ts
windowRange(args: { scroll: number; viewport: number; size: number; count: number; overscan: number }): { start: number; end: number }
```

Pure arithmetic: `start = max(0, floor(scroll/size) - overscan)`, `end = min(count, ceil((scroll+viewport)/size) + overscan)`. Row size 36, column width a fixed multiple of the spacing tokens (112px), header 32.

```ts
// grid-nav.ts
moveFocus(pos: {col:number;row:number}, key: string, ctrl: boolean, b: { cols:number; rows:number; page:number; rowsShown?: number[] }): {col:number;row:number} | null
```

`null` means the key is not a grid key (let the browser have it). With a filter active, `rowsShown` lists the visible 0-based rows, and Up, Down, PageUp and PageDown move through that list.

```ts
// status-groups.ts
groupByStatus(cells: CellResult[], expanded: Set<Status>): { status: Status; count: number; expanded: boolean; rows: CellResult[] }[]
```

Order is mismatched, unverifiable, matched. Groups with count 0 are left out. `matched` is collapsed unless it is in `expanded` or the filter is `matched`. Rows keep verify order inside a group. Property: concatenating the groups' rows and sorting by `(row, col)` gives the input.

```ts
// batch-rows.ts
batchRow(item: FileItem): { name: string; kind: "WK1" | "WKS" | "-"; line: string; pill: Status | "failed" | "raising" }
worstStatus(t: Totals): Status                       // mismatched > unverifiable > matched
```

`line` examples: `98.6% verified, 2 mismatched`; `100.0% verified`; `No formulas`; `Could not raise: <first reason>`. Wording for the zero-mismatch case drops the clause.

```ts
// drawer-model.ts
drawerModel(r: CellResult, tol: Tolerance): {
  address: string; status: Status; sentence: string;
  remembered: string; raised: string;              // formatted, or missing-value copy
  difference: string | null;                       // "Differs by 0.01. Tolerance 1e-12 relative, 1e-12 absolute."
  lotus: string; excel: string;                    // or "The formula could not be read."
  inputs: { address: string; kind: string; value: string; cached: string }[]; inputsOmitted: number;
  diagnostics: string[];                           // reason code, rule, candidate opcodes
}
```

`difference` is `null` unless both values are numbers. The subtraction `raised - remembered` is done in the model only to be shown; no status depends on it, and the status always comes from `CellResult.status` (AI rule: no number in the UI decides matched).

## Screens and components

Layout comes from DESIGN.md sections 3 and 4. Only deviations and decisions are listed.

**TopBar.** Wordmark left (not a heading). Sheet view: the primary pill "Download XLSX" at right. On phone the bar is 56px with the wordmark and the view name, and the primary is sticky at the bottom.

**SummonView.** Column 640px. The pill sits between subtitle and drop zone as in 4.1. The drop zone is a `<button>`; the two text buttons beside it are separate `<button>`s that click hidden `<input type="file">` elements (`accept=".wk1,.wks" multiple`, and `webkitdirectory`). `useMemo(() => "webkitdirectory" in document.createElement("input"))` gates "Choose folder". The candle glow is a `::before` on the zone's wrapper with the gradient from DESIGN.md section 3; reduced motion only drops the scale.

States inside the same view: idle, drag-over, `ProgressSurface` (file name, two steps with the current one in `--text` and the other muted, 4px `--accent` bar), `ErrorPanel` (failed, worker), and the unsupported panel. The `ProgressSurface` bar is determinate by stages: 0%, 50%, 100% on `read`, `check`; a batch shows `n of N`.

**SheetView.** Order in the DOM: `h1`, header line, downloads, `BatchList` (when a batch), totals, filters, grid or status list, drawer. The drawer follows the grid in DOM order for tab order (requirement 48). Desktop CSS places the drawer `position: fixed`.

**Grid.** `role="grid"` with a `role="row"` header and rows of `role="gridcell"`, `aria-rowindex` and `aria-colindex` starting at 1 (header is row 1, so cell rows start at 2 and `aria-rowcount = rows + 1`). The scroll container is the one `div` that scrolls; a spacer gives it its full size and an absolutely positioned layer holds the windowed rows (`transform: translateY`, set through the style property, which a strict CSP allows). Only the focused cell has `tabindex="0"`. Keydown calls `moveFocus`, sets state, scrolls if the target leaves the window, and focuses the target after render (`useLayoutEffect`). Click selects and, for a formula cell, opens the drawer.

Cell states are CSS classes `cell--matched`, `cell--mismatched`, `cell--unverifiable` with markers as pseudo-elements, as in DESIGN.md section 3. Each marker also has a visually hidden text through the accessible name, so the status is never colour alone for a screen reader. The solidify effect is a one-shot animation on first paint of a cell value (`opacity .35, blur(1px)` to `1, 0` over `--dur-slow`); it runs once per file and is off under reduced motion.

Column width and row height in CSS: `--grid-row: calc(var(--space-8) + var(--space-1))` (36px), `--grid-col: calc(var(--space-14) * 2)` (112px), header `var(--space-8)`. These are local custom properties built from tokens, not new tokens, so `tokens.css` stays identical to DESIGN.md. The window code reads the same numbers from one `LAYOUT` constant that a test compares with the computed values in e2e (task 30).

**StatusList (phone).** Native `<button>` per group header with `aria-expanded`, and `<ul>` of rows, each row a `<button>` (name: "B3, @SUM(B5..B9), 18,330, Mismatched"). Rows use `content-visibility: auto` with an intrinsic size of 64px so 8,000 rows stay cheap without a JS window. The grid is not rendered on phone, so axe sees one structure. `useMatchMedia("(max-width: 640px)")` chooses; the first render reads `matchMedia` synchronously to avoid a flash.

**Filters.** A `role="tablist"` of four pill tabs (roving tabindex, arrow keys) with counts. On desktop it filters grid rows (requirement 39). On phone it chooses a group.

**Drawer.** One component, two modes by `useMatchMedia`. Desktop and tablet: `<aside role="complementary" aria-label="Cell B12">`. Phone: `<div role="dialog" aria-modal="true" aria-label="Cell B12">` with a focus trap (Tab and Shift+Tab loop between the first and last focusable; focus moves to the close button on open; `inert` on the rest of the page via the `inert` attribute on the sibling root). Escape is handled by one keydown handler on a wrapper that contains both the grid and the drawer, so it works from either. Close always calls `focusCell(address)`; the grid exposes `focusCell` through a ref.

The `useFocusReturn` hook stores the opener element (the cell or the list row) at open and focuses it at close. If the opener is no longer in the DOM (the window scrolled it away), the grid focuses the cell by address after scrolling it into the window.

**BatchList.** `role="listbox"` of `role="option"` rows with `aria-selected`. Up and Down move, Enter selects. Phone: shown as its own block above the totals, and a file's sheet has the ghost button "Back to files".

**Toast.** Info and error toasts as in DESIGN.md section 3, in a `role="region"` labelled "Notifications" at the bottom centre.

## Downloads

```ts
buildDownload(kind: "xlsx" | "report-html" | "report-json", raised: RaisedFile, version: string): Promise<{ name: string; data: Uint8Array | string; mime: string }>
saveBlob(doc: Document, url: URL-like, name: string, data: BlobPart, mime: string): void
```

`buildDownload` does `const sheet = sheetFromWire(raised.sheet)`, then dynamic `import("../../xlsx/index.ts")` or `import("../../report/index.ts")`, and calls the existing functions. The report path needs `raised.sha256` and returns a typed failure when it is `null`. MIME types: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `text/html;charset=utf-8`, `application/json;charset=utf-8`. `saveBlob` creates the object URL, clicks an anchor with `download`, and revokes the URL in a `setTimeout(0)`; it takes `doc` and `URL` as arguments so Node tests pass fakes.

`version` is `__LAZARUS_VERSION__`, defined in `vite.config.ts` from `package.json` (`define`), declared in `src/ui/env.d.ts`. A test in Node reads it through the same `buildDownload`, and the e2e JSON download shows `tool.version` equal to `package.json`.

The first download loads exceljs (about a megabyte minified) as a separate chunk under `/assets/`. `writeXlsx` runs on the main thread. For a 24 KB sheet that is a few milliseconds. For a sheet of 100,000 cells it may block the page for a moment; the button says "Preparing…" first (the state change is painted before the call by awaiting a `requestAnimationFrame`). Moving the export into the worker is a later option (open question 2).

## Sample

`import sampleUrl from "../../../fixtures/ksbase/KSBASE.WK1?no-inline"` (Vite) gives a hashed URL under `/assets/`. `loadSample()` is the one `fetch`: `fetch(sampleUrl)`, checks `response.ok`, and returns `{ name: "KSBASE.WK1", bytes }` and the bytes enter the same path as a dropped file. Task 3 confirms `?no-inline` is honoured by the installed Vite (small files are otherwise inlined as `data:` URLs) and that an uppercase `.WK1` extension is accepted as an asset. If `?no-inline` is not supported, the fallback is `new URL("...KSBASE.WK1", import.meta.url).href`, which Vite also emits as an asset.

The licence note in `fixtures/ksbase/LICENSE.txt` says CC0-1.0 and redistribution allowed, so shipping the file in `dist/` is allowed. The Summon view shows a muted line "Sample: KSBASE.WK1, soil survey, CC0 (openpreserve format-corpus)" only when the sample is raised, in the Sheet header.

## Dropping files

`collectDropped(dt: DataTransfer): Promise<FoundFile[]>`:

1. Synchronously: `const entries = [...dt.items].filter(i => i.kind === "file").map(i => i.webkitGetAsEntry?.() ?? null)` and `const flat = [...dt.files]` as fallback. Nothing awaits before this.
2. Then `collectFromEntries(entries)`: a work stack of entries; for a file entry `entry.file(cb)` wrapped in a promise; for a directory `reader.readEntries` repeated until it returns `[]`; push children onto the stack (iterative). The path is `entry.fullPath` without the leading slash.
3. A rejected entry adds `{ why: "unreadable" }` to the skipped list and the loop continues.
4. If `entries` has no non-null element, use `flat` with `file.webkitRelativePath || file.name`.

`collectFromEntries` takes the structural types `EntryLike` (`isFile`, `isDirectory`, `name`, `fullPath`, `file(cb, err)`, `createReader()`), so Vitest drives it with fakes, including a reader that returns 100, 100 and 7 entries over three calls, a failing entry, and a folder 1,000 levels deep (no stack overflow).

`webkitdirectory` input results go through `planBatch` using `file.webkitRelativePath`. Files are read with `file.arrayBuffer()` just before they are sent to the worker, one at a time, so a 500-file batch never holds more than one buffer on the main thread.

## Styling

`src/ui/styles/app.css` holds all layout. Rules:

- Colours, radii, shadows, fonts, durations, paddings, margins and gaps come from `var(--...)`. Sizes named in DESIGN.md are literal (requirement 74). A test scans every `.css` file and every `style={{...}}` string under `src/ui` (task 27).
- No `!important`. Focus ring: one rule `:focus-visible { box-shadow: var(--focus-ring); outline: 2px solid transparent; }` so forced-colours mode still shows an outline.
- Breakpoint media queries use the literal 640px and 1024px of DESIGN.md.
- Animations: `drawer-in`, `solidify` and the glow scale, all using `--dur-slow` and `--ease-out`, none with `infinite`.
- Phone: `.primary-sticky { position: sticky; bottom: var(--space-4); padding-bottom: env(safe-area-inset-bottom); }`.

## Content Security Policy

`vite.config.ts` gets a small plugin with `apply: "build"` and `transformIndexHtml` that adds:

```
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'">
```

Dev builds skip it because Vite's HMR needs inline scripts and a WebSocket. Points to confirm in task 34: that Vite's production `index.html` has no inline script (the module preload polyfill is external in Vite 8, to check), that React's `style` property writes are allowed (they set `element.style.x`, which CSP does not block, unlike an inline `style` attribute in HTML), that `blob:` anchor downloads still work (downloads are navigations of a `blob:` URL created by the page, which `default-src` does not govern, and the e2e download test proves it), and that the `data:,` favicon link is allowed by `img-src data:`. The CSP is defence in depth. The real guarantees are the code scan (requirement 63) and the request assertion (requirement 65).

## Privacy and the network assertion

`e2e/fixtures/network.ts` exports `watchNetwork(page, baseURL)`. It records every `request` event, every `websocket` event and every `serviceworker` registration, and `expectOnlyStatic()` asserts for each recorded request: method `GET`, `postData() === null`, same origin as `baseURL`, no `search`, no `hash`, and a path equal to `/` , `/index.html`, or starting with `/assets/`. It also asserts that no request URL contains the file's name or its SHA-256, and that no websocket or service worker appeared. A second check calls `page.evaluate(() => fetch("https://example.invalid/x"))` and expects the CSP to reject it, with a `securitypolicyviolation` event or a TypeError, and no request leaving.

`data:` URLs (the favicon) are not network requests. If Playwright reports one, the helper allows exactly `data:,`.

## Accessibility notes

- One `h1` per view, set from a `ViewTitle` that also sets `document.title`.
- Live region: one visually hidden `role="status"` element at the app root receives the stage names, "Cell B3 details open, Mismatched", "Filter: Mismatched, 3 cells" and "Download started". The error panels use `role="alert"` and move no focus except where listed.
- When the Sheet view first appears, focus moves to its `h1` (`tabindex="-1"`) so keyboard and screen-reader users start at the title, not at the top of a removed Summon view. When the person goes back to Summon, focus moves to its `h1`.
- Grid cell names follow requirement 35. Column headers are `role="columnheader"`, and row numbers `role="rowheader"`.
- The proof bar is `role="img"` with `aria-label` equal to `describeTotals`, and the same text is visible as the three counts.
- axe runs with `page.emulateMedia({ reducedMotion: "reduce" })` so the solidify animation cannot produce a transient low-contrast reading, and a second run without it on the Sheet view after `animationend`.
- Contrast: only token pairs from the DESIGN.md contrast table are used. A new pair would need a computed ratio in the evidence file.

## Test strategy

| Kind | Where | What |
|---|---|---|
| Probe | `tests/unit/ui/browser-probe` (e2e spec `e2e/seance-probe.spec.ts`) | `?no-inline` asset, worker bundle path, `setInputFiles` on a `webkitdirectory` input, `DataTransfer` drop of a `File` |
| Unit | `tests/unit/ui/*.test.ts` | every pure function above |
| Protocol | `tests/unit/workers/raise-protocol.test.ts` | `handleRaiseRequest`, `sheetToWire`, `sheetFromWire` over the fixtures |
| Client | `tests/unit/ui/worker-client.test.ts` | a fake worker: FIFO, ids, failures, dispose |
| Component | `tests/unit/ui/components/*.test.tsx` | `renderToStaticMarkup` of each component |
| Guard | `tests/unit/ui/purity.test.ts`, `css-tokens.test.ts`, `tokens-css.test.ts` | import and network scan, token-only CSS, `tokens.css` equals DESIGN.md |
| e2e | `e2e/seance-*.spec.ts` | the flows listed in requirement 79 |

Expected values never come from what the UI printed. Counts come from `fixtures/manifest.json` and `golden.json`, cell values from `parseWk1`, hashes from the manifest, and mismatch values from the bytes the test wrote. The e2e re-reads downloads with `readXlsx` (the existing helper) and with `JSON.parse`.

Test files for the e2e fixtures: `e2e/fixtures/seance-files.ts` builds, with `scripts/lib/wk1-writer.ts`:

- `mismatch.wk1`: A1 = 2, B1 = 3, C1 = `+A1+B1` with cached 6 (the engine computes 5), plus a few more matching formulas. Expected: C1 mismatched, cached 6, raised 5, difference -1.
- `mixed-status.wk1`: the same plus one formula that uses an opcode absent from `src/formula/opcodes.ts` (unverifiable, reason `unknown-opcode`). The helper's own unit test decodes the bytes with `decodeRpn` and asserts the opcode really is unknown, so the file cannot silently turn into a matched one.
- `corrupt.wk1`: 200 bytes of a fixed pseudo-random sequence with no valid BOF, so `format` is `unknown`.
- `not-lotus.txt`: for the skipped path.
- Unverifiable from a real file: `fixtures/libreoffice-wks-functions/gnome647171-1.wks` (A5, `string-result`).

## Decisions taken in this design

1. **Cells travel as an array, exports run on the main thread.** Keeps the verification spec's no-`Map` rule and keeps `src/workers` free of exceljs. Alternative: build the downloads in the worker and transfer the bytes. Heavier protocol, no gain at the fixture sizes.
2. **One worker, one request at a time.** A batch of 500 small files is quick. A pool of workers would raise memory and ordering questions for no measured need.
3. **Two honest progress steps** instead of the four in DESIGN.md (finding 5 in requirements).
4. **Row-level filter** in the grid: it shows every row that holds a cell of the chosen status. DESIGN.md names the filter and its empty text but not its effect; hiding individual cells would break the sheet's shape.
5. **Window instead of a table library.** About 150 lines of pure arithmetic plus one component, no dependency, easy to unit test.
6. **`renderToStaticMarkup` for component tests.** No new DOM dependency. Behaviour that needs a real DOM (focus, keyboard, drag) is e2e only.

## Open questions

1. **Matched tint** (finding 4 in requirements): dot only, or dot plus `--status-matched-bg`.
2. **Where exports run** for very large sheets. Defer until a measured freeze.
3. **Clipboard.** "Copy Excel formula" and "Copy diagnostics" use `navigator.clipboard.writeText`, which needs a secure context. If it is missing the button reveals the text in a selectable block instead. Say if you want these two controls dropped to keep the first version smaller.
4. **Sample choice.** KSBASE (real, 160 formulas, all matched) shows only Matched. The `functions` fixture (synthetic, 16 formulas) is smaller but also all matched. Neither shows the other states. If the demo should show a mismatch, a deliberately wrong synthetic sample would be needed, and it would have to be labelled as such in the UI. Not done here.
5. **Phone batch** is a minimal list-then-sheet flow because DESIGN.md calls batch a desktop feature.
