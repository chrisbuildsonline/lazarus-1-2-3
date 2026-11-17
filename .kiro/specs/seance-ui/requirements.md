# Requirements: Seance UI (F8)

Goal: the browser app. A person drops one Lotus 1-2-3 file, several files or a whole folder, or presses "Summon the sample". The file is parsed and verified in a Web Worker. The app shows every formula cell as matched, mismatched or unverifiable, lets the person open one cell to see both formulas and both values, and downloads the XLSX and the provenance report. Nothing leaves the browser.

This feature does not build the Macros screen, the Report screen, the approval queue, DBF or WK3 reading, the lotus-oracle server, or any model call. It does not edit a cell, run a macro, or change a stored value. It reuses `src/parser`, `src/verify`, `src/xlsx` and `src/report` as they are.

Terms:

- A *raised file* is one input file after the worker has parsed and verified it: its `Sheet` (as a plain cell list), its `SheetVerification`, the parser diagnostics, the byte length and the SHA-256.
- A *formula cell* is a cell with a `CellResult`. Only formula cells carry a proof status. Constants and labels are plain (DESIGN.md section 1).
- A *status* is `matched`, `mismatched` or `unverifiable` (product.md).
- An *entry* is one input the person gave: a file with a name, a relative path and a size.
- A *batch* is two or more entries accepted in one summon.
- *Phone* is a viewport of 640px or less, *tablet* is 641 to 1023px, *desktop* is 1024px or more (DESIGN.md section 2).
- *The tokens* are the CSS custom properties in `src/ui/tokens.css`.
- *The worker* is the Web Worker built from `src/workers/raise.worker.ts`.
- *App origin* is the origin that serves `index.html`.

## EARS requirements

### Shell

1. The app SHALL show exactly one of two views at a time: Summon (including its progress, error and unsupported states) and Sheet. Each view SHALL hold exactly one `h1`, and SHALL set `document.title` to `<view title> · Lazarus 1-2-3` when it appears (the file name on the Sheet view).
2. The app SHALL run from static files only. It SHALL need no server, account, key, local model or browser permission.
3. The top bar SHALL sit on the canvas with the wordmark "Lazarus 1-2-3" at left and, on the Sheet view, the one primary pill at right. In this feature it SHALL show no step tabs, because the Macros and Report views do not exist yet (finding 3).

### Summon view

4. The Summon view SHALL follow DESIGN.md section 4.1: the `h1` "Raise a Lotus 1-2-3 file", one subtitle, the primary pill "Summon the sample", the drop zone, the privacy line and the limits line (requirement 62). At 1440x900 the `h1`, the pill, the drop zone and the privacy line SHALL be visible without scrolling. On phone the pill SHALL be sticky at the bottom with the safe-area inset (DESIGN.md section 4).
5. The subtitle SHALL NOT name WK3 or dBase as readable formats (finding 2).
6. The drop zone SHALL be one `<button>` showing "Drop a file or a whole folder here" (on phone "Tap to choose a file"). WHEN it is activated by click, Enter or Space, THEN the app SHALL open a file picker that accepts `.wk1` and `.wks` and allows several files.
7. The Summon view SHALL show the text buttons "Choose file" and, only WHERE the browser supports `webkitdirectory` on an `<input type="file">`, "Choose folder". WHERE it does not, the "Choose folder" control SHALL NOT be rendered. Both pickers SHALL be reachable by keyboard without drag and drop.
8. WHEN the person drops items on the drop zone, THEN the drop handler SHALL call `DataTransferItem.webkitGetAsEntry()` for every item synchronously, before its first `await`, because the browser invalidates the items after the event. WHERE `webkitGetAsEntry` is missing, THEN the handler SHALL use `dataTransfer.files`.
9. WHEN a dropped entry is a directory, THEN the app SHALL read it with `createReader().readEntries` repeated until it returns an empty list (Chromium returns at most 100 entries per call), SHALL visit sub-folders without recursion that depends on folder depth, and SHALL give each file its path relative to the dropped folder. IF reading one entry fails, THEN the app SHALL continue with the others and count the unreadable entry as skipped (requirement 61).
10. The app SHALL sort accepted entries by path (code-unit order), drop a second entry with an identical path, and keep that order for the whole session, so the same drop gives the same batch order.
11. An entry SHALL be accepted WHEN its name ends in `.wk1` or `.wks`, compared case-insensitively. Every other entry SHALL be counted as skipped and SHALL NOT be sent to the worker. Content is judged by the parser, not by the extension (requirement 20).
12. The app SHALL accept at most 500 entries per summon and at most 32 MiB per entry. IF a limit is exceeded, THEN the app SHALL say which limit, how many entries it dropped and why, and SHALL still process the rest. The limits are named constants in one module.
13. WHILE a drag carrying files is over the drop zone, the zone SHALL show the dashed accent outline of DESIGN.md section 3. The page SHALL cancel `dragover` and `drop` on `window` as well, so a file dropped beside the zone never makes the browser navigate to it.
14. The primary pill "Summon the sample" SHALL load the bundled sample, `fixtures/ksbase/KSBASE.WK1` (CC0-1.0, see its `LICENSE.txt`), as a build asset of the app, and then follow exactly the same path as a dropped file under the name `KSBASE.WK1`. It SHALL need no key, no model and no request except one GET of that asset from the app origin.
15. The Summon view SHALL hold exactly one primary pill. IF a file failed (requirement 20), THEN the pill SHALL read "Try another file" and open the picker. IF no accepted entry came in but entries were skipped, THEN the view SHALL show the unsupported-file state of DESIGN.md section 5, with the accepted extensions and the pill "Choose another file". The unsupported state SHALL NOT use the danger colour.

### Worker and raising

16. Parsing, verification and hashing SHALL run in the worker. No file under `src/ui` SHALL import or call `parseWk1`, `verifySheet`, `verifyBytes` or `classifySheet`, and the worker SHALL call the existing `parseWk1`, `verifySheet` and `sha256Hex` and no copy of them.
17. `src/workers/verify-protocol.ts` SHALL gain, additively, the types `RaiseRequest`, `RaiseProgress`, `RaiseResponse` and `RaisedFile`, and the pure function `handleRaiseRequest(request, post)`. A request SHALL carry an integer `id`, the file `name` and the bytes as a transferred `ArrayBuffer`. Every message SHALL hold structured-clone data only, with no `Map`, function or class instance, so `RaisedFile.sheet.cells` is an array. `src/workers/raise.worker.ts` SHALL only install the handler. The existing `handleVerifyRequest` and its tests SHALL NOT change.
18. A `RaisedFile` SHALL hold `name`, `byteLength`, `sha256` (`string`, or `null` when Web Crypto is missing), `diagnostics`, `sheet` (the `Sheet` fields except `cells`, plus `cells: Cell[]` in row-major order) and `verification`. `sheetFromWire(wire): Sheet` SHALL rebuild the parser's `Sheet` so that it deep-equals `parseWk1(bytes).sheet`.
19. WHILE a file is being raised, the app SHALL show the progress surface of DESIGN.md section 5 with the file name and a 4px accent progress bar, and SHALL announce each stage in an `aria-live="polite"` region. The worker SHALL post one `progress` message after parsing (`read`) and one after verification (`check`). The stages shown SHALL be only the two the worker can observe: "Reading records" and "Recalculating and comparing" (finding 5).
20. After the worker answers, the app SHALL classify the file by one pure function: `unsupported` WHEN `verification.format` is `unknown`; `failed` WHEN the format is `wk1` or `wks` and the sheet holds no cell and the parser reported an `error` diagnostic; otherwise `raised`.
21. A `failed` file SHALL show the inline error panel of DESIGN.md section 3: the title "This file could not be raised.", a danger pill "Could not raise", the reason, a diagnostics block with one line per parser diagnostic (`offset 0x01A4  <message>`), and the text button "Copy diagnostics". An `unsupported` file SHALL show "This is not a WK1 or WKS file this version can read." with the accepted extensions.
22. IF the worker cannot be created, fails to load its script, raises `error` or `messageerror`, answers with an `error` response, or the handler throws, THEN the app SHALL show an inline error panel with `role="alert"`, the message, and "Copy diagnostics". The app SHALL NOT show a blank screen, a spinner that never ends, or only a console message. Other files of a batch SHALL still be processed WHERE the worker is still alive.
23. WHILE the worker runs, the main thread SHALL stay responsive: the progress bar SHALL keep updating, and for a generated sheet of 5,000 formulas no main-thread task SHALL run longer than 200 ms between the drop and the first rendered grid row.
24. The app SHALL raise entries one at a time in the worker, in batch order. WHEN a new summon starts while an older one is still running, THEN the app SHALL ignore every later message of the older summon by its id and SHALL NOT mix its files into the new batch.
25. Each of these SHALL be a pure function with a unit test: file classification (requirement 20), entry filtering (11, 12), batch ordering (10), and the state reducer that moves the app between views.

### Sheet view

26. The Sheet view SHALL follow DESIGN.md section 4.2: the `h1` with the file name (32px), a muted line `WK1 · 160 formulas · 24,291 bytes`, the totals surface, the status filters, and the grid surface. It SHALL omit the sheet count and the "raised hh:mm" time of the mock-up, because a WK1 file has one unnamed sheet and the view takes no clock reading (finding 10).
27. The totals surface SHALL show, as large tabular numbers with muted labels: Verified (the percentage, `--text-display`), Matched, Mismatched and Unverifiable (`--text-display-sm`). Each count SHALL be followed by its status pill, and SHALL be the matching `SheetVerification.totals` count, not a recount of the cells in the page.
28. Verified SHALL be `floor(matched / formulas * 1000) / 10`, written with one decimal and a percent sign, computed with integer arithmetic. It SHALL never read 100.0% while a formula cell is not matched. WHEN `formulas` is 0, the headline SHALL read "No formulas" and the three counts SHALL read 0.
29. The proof bar SHALL be 8px tall with segments for matched, mismatched and unverifiable in that order, 2px apart, with widths proportional to the counts and no segment for a count of 0. It SHALL carry a text description ("160 matched, 0 mismatched, 0 unverifiable") through `aria-describedby`, and SHALL NOT be the only carrier of any figure.
30. WHEN `unverifiable` is greater than 0, the totals surface SHALL show the line "Unverifiable cells are not wrong; we could not prove them. The report lists each one and why."
31. WHEN the parser reported diagnostics, the header line SHALL show their count and a text button "Show reading notes" that reveals them in a sunken mono block, one per line, with severity. The notes SHALL NOT be hidden when any has severity `error`.
32. The primary pill on the Sheet view SHALL read "Download XLSX" (finding 3). "Download report (HTML)" and "JSON" SHALL be text buttons beside the title block.

### Grid

33. On tablet and desktop the grid SHALL be `role="grid"` inside a `--radius-lg` surface with `aria-rowcount`, `aria-colcount`, `aria-rowindex` and `aria-colindex`, a sticky header row (32px) with column letters, a row-number column (48px), 36px rows and 1px `--hairline` lines, and no zebra stripes. It SHALL cover columns A to the last used column and rows 1 to the last used row, taken from the cells and not from the declared dimensions.
34. Each formula cell SHALL show its remembered (cached) value and one state, taken from its `CellResult.status`:
    - matched: value in `--text`, a 6px filled dot `--status-matched-mark` at the leading edge, no fill (finding 4);
    - mismatched: `--status-mismatched-bg` fill and a 2px inset bar `--status-mismatched-mark` at the leading edge, value in `--text`, and no animation;
    - unverifiable: value in `--ghost-ink`, a 1px dotted underline `--status-unverifiable-mark`, transparent fill and a 6px hollow ring.
    Constants and labels SHALL show no marker. Labels SHALL keep the alignment of their prefix (`'` left, `"` right, `^` centre, `\` and `|` left). Numbers SHALL be right-aligned.
35. A selected cell SHALL show a 2px inset `--accent` ring (`--radius-xs`) and the `--accent-soft` fill, except a mismatched cell, which keeps its rose fill. The accessible name of a cell SHALL read "B3, 18,330, Mismatched" for a formula cell, "A1, OBSERV" for a label, "C4, 12" for a number and "D9, empty" for an empty cell, and for a formula cell with no stored value "B2, no stored value, Unverifiable".
36. Number text SHALL be the shortest decimal that reads back to the same double, with thousands separators when the magnitude is below 1e15 and `String(n)` form otherwise. A stored ERR SHALL show "ERR" and NA "NA". The app SHALL NOT round a value for display.
37. The grid SHALL render only the cells inside the scrolled viewport plus an overscan of 5 rows and 2 columns, plus the focused cell, so a sheet of 8,192 rows and 256 columns keeps the DOM under 2,000 cell nodes. Row heights and column widths SHALL be fixed so the window is computed, not measured.
38. The grid SHALL be one tab stop (roving tabindex). WHEN it holds focus, ArrowUp, ArrowDown, ArrowLeft and ArrowRight SHALL move one cell, Home and End SHALL move to the first and last used column of the row, Ctrl+Home and Ctrl+End to the first cell and the last used cell, and PageUp and PageDown by one viewport of rows. Movement SHALL stop at the edges, never wrap, and SHALL scroll the cell into view.
39. WHEN a status filter other than All is chosen, THEN the grid SHALL show only the rows that hold at least one formula cell of that status, keeping each row's real number in `aria-rowindex`. IF no row remains, THEN the grid surface SHALL read "No mismatched cells on this sheet." (or the matching word), muted and centred. The filter tabs SHALL show counts ("Mismatched 3") and move with arrow keys (roving tabindex).
40. On phone the grid SHALL be replaced by a status list (DESIGN.md section 4.2). Rows SHALL be grouped Mismatched, then Unverifiable, then Matched, each group in verify order, and the Matched group SHALL start collapsed behind a button "Matched 1,180 · Show all" with `aria-expanded`. A group with 0 rows SHALL NOT be shown. A row SHALL be at least 64px tall, show the address and the short Lotus formula at left and the value and the status pill at right, and open the drawer on tap. The grouping SHALL NOT change the downloaded report or workbook, whose rows stay in verify order (xlsx-writer requirement 32).
41. WHEN a status filter is chosen on phone, THEN only that group SHALL show, expanded.

### Cell drawer

42. WHEN the person clicks a formula cell, or presses Enter on a focused formula cell, or taps a status-list row, THEN the app SHALL open the drawer for that cell. Enter on a constant, a label or an empty cell SHALL do nothing.
43. The drawer SHALL follow DESIGN.md section 4.3 and show: the label "Cell", the address in `--text-mono` at 32px, the status pill, one plain sentence, the two values "Remembered (cached in the file)" and "Raised (recalculated)", the difference line, a sunken block with the Lotus formula and the Excel formula, the inputs of a mismatched cell, the diagnostics, and the text button "Copy Excel formula".
44. The sentence SHALL be "Raised value matches what the file remembers." for matched, "The numbers disagree." for mismatched, and `CellResult.reason.message` for unverifiable.
45. A value that does not exist SHALL read "Not stored in the file" (cached `null`) or "Could not be calculated" (recalculated `null`), in muted body text, never a bare dash. WHERE both values are numbers, the difference line SHALL read "Differs by <recalculated minus remembered>." with the tolerance in words ("Tolerance 1e-12 relative, 1e-12 absolute."), read from `verification.tolerance`. A matched cell with reason `within-tolerance` SHALL show the reason message. A cell whose Lotus or Excel formula is `null` SHALL say "The formula could not be read." in that slot.
46. The diagnostics section SHALL show the reason code and rule id, and the opcodes in `candidateOpcodes` as `0x08` with the line "Read by this program but not yet confirmed against a real file."
47. On desktop the drawer SHALL be a floating non-modal panel, 440px wide, inset 16px, `role="complementary"` labelled "Cell B12", with `--radius-lg`, `--shadow-raised` and `z-index: var(--z-drawer)`. The grid SHALL reflow to leave room. WHILE the drawer is open, the arrow keys SHALL keep moving through cells in the grid and the drawer SHALL follow the focused formula cell. On tablet the same panel SHALL overlay the grid.
48. WHEN the drawer opens, THEN focus SHALL stay on the grid cell and a polite live region SHALL announce "Cell B3 details open, Mismatched". The drawer SHALL come directly after the grid in tab order, so Tab from the grid reaches its close button.
49. WHEN the person presses Escape inside the grid or the drawer, or activates the close button (aria-label "Close cell details"), THEN the drawer SHALL close and focus SHALL be on the cell it described. This SHALL also hold after the person moved through other cells.
50. On phone the drawer SHALL be a full-screen modal sheet (`role="dialog"`, `aria-modal="true"`, labelled "Cell B12"), with a scrim at `z-index` one below `--z-drawer`, focus moved into it on open, focus trapped while it is open, a sticky ghost button "Back to list", and Escape closing it. On close, focus SHALL return to the list row that opened it.
51. Drawer open and close SHALL slide 16px and fade over `--dur-slow` and SHALL be instant under `prefers-reduced-motion: reduce`.

### Downloads

52. The Sheet view SHALL offer three downloads for the selected file: the workbook (`writeXlsx({ sheet, verification })`), the report as HTML (`renderReportHtml(buildReport(...))`) and the report as JSON (`serializeReportJson(report)`). The page SHALL call these functions unchanged and SHALL NOT format, round or replace any value itself. The report input SHALL be `fileName` (the entry name), `sha256` and `byteLength` from the raised file, and `toolVersion` from `package.json` at build time.
53. WHERE `sha256` is `null`, the two report downloads SHALL be disabled with the visible reason "This browser cannot fingerprint the file here. Use https or localhost." The XLSX download SHALL still work.
54. Download names SHALL be deterministic: the base name of the entry with its final `.wk1` or `.wks` removed, then `.xlsx`, `.report.html` or `.report.json`. Characters that are not allowed in a file name (`\ / : * ? " < > |`, control characters) SHALL become `_`, leading and trailing dots and spaces SHALL be trimmed, a Windows reserved device name (`CON`, `PRN`, `AUX`, `NUL`, `COM1` to `COM9`, `LPT1` to `LPT9`, any case) SHALL get a leading `_`, an empty base SHALL become `workbook`, and the base SHALL be cut to 100 UTF-16 units without splitting a surrogate pair. `KSBASE.WK1` SHALL give `KSBASE.xlsx`, `KSBASE.report.html` and `KSBASE.report.json`.
55. The app SHALL create each download as a `Blob`, give it to the browser through an object URL on an anchor with the `download` attribute, and revoke the URL afterwards. The writer and report modules SHALL be loaded by dynamic `import()` on the first download, so the Summon view does not load them.
56. WHILE a download is being built, its button SHALL show "Preparing…" and `aria-disabled="true"`. WHEN it starts, the app SHALL show an info toast "Download started: KSBASE.xlsx" (`role="status"`, 4 s, paused on hover and focus). IF building fails, THEN the app SHALL show an error toast with `role="alert"` and a "Dismiss" button that does not auto-dismiss.
57. For the same raised file, two downloads in one browser session SHALL give byte-identical XLSX, HTML and JSON.

### Batch

58. WHEN a summon holds two or more entries, THEN the Sheet view SHALL show a 320px batch surface at the left, titled "12 files", with one row per entry in batch order. WHEN a summon holds one entry, no batch surface SHALL show.
59. A batch row SHALL follow the anatomy of DESIGN.md section 3: the file name (strong), the kind ("WK1" or "WKS"), the line "98.6% verified, 2 mismatched" (muted; "No formulas" when none), and at right the worst status present (mismatched, then unverifiable, then matched) as a status pill. A raising row SHALL show a not-yet-raised ghost bar, and a failed row SHALL show a danger "Failed" pill and a one-line reason.
60. WHEN a row is chosen (click, or Enter in the list), THEN its sheet SHALL open, the row SHALL use `--accent-soft`, and the drawer SHALL close. The list SHALL be a `listbox` with a roving tabindex. The first raised file SHALL open on its own when the batch starts, unless the person already chose another.
61. IF some files fail or are unsupported, THEN the other files SHALL open normally. The batch surface SHALL end with the line "3 files skipped: not WK1 or WKS." when entries were skipped. On phone the batch surface SHALL be its own list above the totals, with a ghost button "Back to files" on a file's sheet.

### Copy

62. The Summon view SHALL show this limits line: "This version reads WK1 and WKS worksheets only. dBase and WK3 files are not read yet, and macros are not translated yet." It SHALL show this privacy line: "Files never leave this browser. No upload, no account." All user-facing strings SHALL live in `src/ui/copy.ts`, and a test SHALL compare the strings of DESIGN.md section 7 with it. Tone follows DESIGN.md section 7: plain words, no exclamation marks, no jokes about death. The words "correct" and "100% accurate" SHALL NOT appear.

### Privacy

63. The app SHALL NOT send file bytes, file names, cell values, formulas or hashes to any network address, and SHALL NOT call `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon` or `importScripts` except one `fetch` of the bundled sample asset in `src/ui/io/sample.ts`. A test SHALL scan `src/ui` and `src/workers` and fail on any other use.
64. `index.html` SHALL carry a `Content-Security-Policy` meta tag in production builds that allows only the app origin for scripts, workers, styles, connections and fonts, allows `data:` and `blob:` where the app needs them (images, downloads), and forbids objects, forms and a `base` element. An e2e test SHALL show that a `fetch` to another origin from the page is blocked.
65. WHEN the app runs a session (sample, dropped file, batch, downloads), every request the browser makes SHALL be a GET to the app origin, with no request body and no query string, whose path is the page, a file under `/assets/` or the bundled sample. No `WebSocket` SHALL open and no service worker SHALL register. An e2e test SHALL assert this for every request of the whole run.
66. The app SHALL NOT write file content to `localStorage`, `sessionStorage`, `IndexedDB`, cookies or the Cache API.

### Accessibility

67. An axe scan (rules `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `best-practice`) SHALL report zero violations of impact `serious` or `critical` on the Summon view, the Summon error view, the Sheet view (desktop and phone), the Sheet view with the drawer open, and the batch view. Lesser findings SHALL be printed by the test.
68. Every interactive control, cell, tab and list item SHALL show `box-shadow: var(--focus-ring)` on `:focus-visible`. Status SHALL be conveyed by the pill text and the glyph shape as well as colour, in the grid, the list, the drawer and the batch rows (DESIGN.md section 3).
69. The page SHALL work with the keyboard alone: summon, choose files, move through the grid, open and close the drawer, and download.
70. Touch targets on phone SHALL be at least 44px high (the primary pill 48px).
71. Errors SHALL use `role="alert"`, progress and drawer announcements `role="status"` or `aria-live="polite"`.
72. The page SHALL honour `prefers-reduced-motion: reduce`: every duration token is 0 (tokens.css) and the candle glow stays a static gradient. No animation SHALL loop.

### Design tokens and layout

73. `src/ui/tokens.css` SHALL exist, SHALL be imported once in `src/ui/main.tsx`, and SHALL equal the CSS block in `design/DESIGN.md` section 2 name for name and value for value. `src/report/tokens.ts` SHALL stay equal to both (the writer spec's tokens test then compares against this file).
74. Components SHALL use the tokens only. Under `src/ui` no CSS or inline style SHALL hold a colour literal (`#rrggbb`, `rgb(`, `rgba(`, `hsl(`), a literal `border-radius`, `box-shadow`, `font-family` or `font` value, a transition or animation duration, or a literal `padding`, `margin` or `gap` length other than `0`. Sizes that DESIGN.md names (row 36px, header 32px, row number 48px, drawer 440px, batch 320px, pills 24, 44 and 48px, bars 4 and 8px, the 640px and 1024px breakpoints, content width 1360px) MAY appear as literals.
75. At 1440x900 and at 390x844 the page SHALL have no horizontal scroll (`documentElement.scrollWidth <= clientWidth`) on the Summon view, the Sheet view and the Sheet view with the drawer open. The grid MAY scroll inside its own surface on desktop and tablet.
76. The page SHALL log no console error and raise no page error during a run of the sample, a dropped file, a batch, the drawer and the downloads.

### Acceptance

77. Unit tests (Vitest) SHALL cover the pure view-model functions: value formatting, totals and percentage, proof bar widths, download file names, entry filtering and ordering, directory traversal over fake entries, status grouping and filtering, the grid model and accessible names, the window range, grid keyboard movement, batch rows, file classification, the app reducer, the drawer view-model, and the raise protocol with `sheetFromWire`.
78. Component tests (Vitest, `react-dom/server` markup) SHALL cover the status pill, totals, drop zone, error panels, grid, status list, drawer and batch list.
79. Playwright e2e tests SHALL cover: the sample click shows statuses; a dropped file; several files; a folder through the folder picker; an unsupported and a corrupt file; the drawer shows both formulas and both values for a cell whose expected values come from the manifest; keyboard movement, Enter and Escape with focus return; XLSX and report downloads re-read with exceljs and `JSON.parse`; the worker failing to load; the network assertion; axe; and screenshots at 1440x900 and 390x844 with the overflow and console checks.
80. The e2e tests SHALL include a file with a mismatched cell and one with an unverifiable cell, because no fixture in `fixtures/manifest.json` holds a mismatch (finding 6). The mismatched file SHALL be built in the test from `scripts/lib/wk1-writer.ts` and SHALL NOT be added to the manifest.
81. `bun run test`, `bun run typecheck`, `bun run build` and `bun run e2e` SHALL pass, and the existing tests SHALL pass unchanged except `e2e/smoke.spec.ts` (finding 7).

## Findings from reading the repository

These shape the requirements. Items marked **Decision** need your answer; the spec follows the stated default until you give one.

1. **`src/ui/tokens.css` does not exist.** `src/ui` holds `App.tsx` and `main.tsx`. DESIGN.md section 2 has the block, and the xlsx-writer spec's token test says it will compare against the file once it exists. Requirement 73 and task 1 create it as a copy of the block.
2. **DESIGN.md 4.1 lists "WK1, WKS, WK3 and dBase" in the Summon subtitle.** This version reads WK1 and WKS only, so that text would promise too much. Requirements 5 and 62 use the honest limits line instead. **Decision:** if you want DESIGN.md corrected, it needs a one-line edit outside this spec.
3. **DESIGN.md gives the Sheet view the primary "Open report" and three step tabs, but F8 has no Report or Macros view.** A pill that opens nothing would be wrong, and DESIGN.md 4.5 already makes "Download XLSX" the Report primary. Requirements 3 and 32 put "Download XLSX" on the Sheet view and show no step tabs. **Decision:** keep this until the Report view exists, then switch the pill to "Open report" and move the downloads.
4. **You asked for "matched = green tint". DESIGN.md 3 specifies a 6px green dot with no fill for a matched cell**, and a rose fill only for a mismatched one. A filled green grid of 1,000 cells would also drown the mismatched rose. Requirement 34 follows DESIGN.md. **Decision:** to tint instead, change one line: use `--status-matched-bg` as the cell fill. The pill and the dot stay either way.
5. **DESIGN.md 5 lists four progress steps ("Reading records", "Rebuilding formulas", "Recalculating", "Comparing").** `verifySheet` runs those as one call, so the worker can only report two real stages. Requirement 19 shows two and never fakes a step.
6. **No fixture has a mismatched cell.** `tests/differential/verify/golden.json` records 0 mismatched for every real file, and the synthetic ones all match (27 of 27). The mismatched state cannot be shown from the manifest. Requirement 80 builds one in the e2e test. It stays out of `fixtures/manifest.json`, because the verification spec's acceptance 1 says every synthetic fixture matches.
7. **`e2e/smoke.spec.ts` expects an `h1` named "Lazarus 1-2-3".** The Summon `h1` is "Raise a Lotus 1-2-3 file", and the wordmark is not a heading. Task 28 updates that one test first.
8. **Test tooling is thin.** `vitest.config.ts` runs `tests/**/*.test.ts` in a Node environment (no DOM, no `.tsx`), `playwright.config.ts` has one desktop Chromium project, and there is no axe package. Requirement 78 uses `react-dom/server` markup so no DOM library is needed, tasks 20 and 36 widen the include pattern and add `@axe-core/playwright`, and phone runs use `page.setViewportSize`.
9. **`verify-protocol.ts` returns `VerifyBytesResult`, which has no cell list.** The grid needs constants and labels, and `writeXlsx` needs a `Sheet`. Requirement 17 adds a raise message additively rather than changing `handleVerifyRequest`. The verification spec forbids `Map` in worker messages (its requirement 9), so cells travel as an array.
10. **The mock-up header shows "3 sheets" and "raised 14:02".** A WK1 file has one sheet, and a clock reading makes screenshots and tests differ run to run. Requirement 26 leaves both out.
11. **Folder drops cannot be fully automated.** A page cannot build a `DataTransferItem` that wraps a directory entry, so Playwright cannot drop a real folder. Requirements 9 and 79 test traversal with fake entries in Vitest and the folder path with `webkitdirectory` file inputs in e2e. Task 3 probes what Chromium and Playwright allow before the tests depend on it.
12. **The report HTML page rounds Verified down to a whole percent (xlsx-writer design); DESIGN.md 4.2 asks for one decimal here.** Both floor, so 98.0% in the app is 98% in the file, never a higher number. Requirement 28 follows DESIGN.md.
13. **Hashing needs Web Crypto, which browsers expose on https and localhost only.** Requirements 18 and 53 handle its absence instead of failing the whole file.
14. **The 500-entry and 32 MiB limits (requirement 12) are my choices.** A full WK1 sheet (8,192 rows by 256 columns) is below 32 MiB in the worst case. **Decision:** raise or drop the limits if you want.
15. **DESIGN.md 5 says the toast reads "ledger-1987.xlsx saved."** A page cannot know the person saved the file. Requirement 56 says "Download started".
