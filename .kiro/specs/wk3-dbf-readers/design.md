# Design: WK3 and DBF readers (F9)

## Layout

```
src/parser/
  sheet.ts        SheetFormat, Workbook, NamedSheet added; Wk1Format kept as an alias
  detect.ts       detectKind(bytes), isDbfHeader(bytes)  (moved out of src/cli/inventory.ts)
  float80.ts      float80ToDouble(bytes): { value, exact }  (10-byte extended precision, little-endian)
  wk3.ts          parseWk3(bytes): Wk3ParseResult
  dbf.ts          parseDbf(bytes): DbfParseResult
  workbook.ts     parseWorkbook(bytes): WorkbookParseResult  (dispatch, WK1 wrapper)
  diagnostics.ts  new codes added to DiagnosticCode
  index.ts        new exports
src/verify/
  workbook.ts     verifyWorkbook(workbook, name): SheetVerification[]
  value.ts        new reason code wk3-formula-not-decoded
src/workers/
  verify-protocol.ts   RaisedFile gets sheets[]; handleRaiseRequest uses parseWorkbook + verifyWorkbook
src/xlsx/
  index.ts, plan.ts, exceljs-adapter.ts   writeXlsx takes one or many sheets
  sheet-names.ts  excelSheetName(name, taken): { name, changed }
src/report/       per-sheet totals, wk3 and dbf wording (additive)
src/cli/          inventory.ts uses detectKind; export.ts and verify-summary.ts use parseWorkbook
src/ui/           copy.ts, model (entries, batch-rows, app-state, classify-file, file-names, grid-model callers),
                  components (SummonView, ErrorPanel, SheetView, SheetTabs, TotalsSurface)
scripts/lib/
  wk3-writer.ts   record encoders for the synthetic WK3 files (test input only)
  dbf-writer.ts   header, field and record encoder for the synthetic DBF files
  fixture-specs.ts, gen-fixtures.ts   two more synthetic specs
fixtures/
  wk3-sheets/wk3-sheets.wk3 + LICENSE.txt
  dbf-table/dbf-table.dbf + LICENSE.txt
  manifest.json   two new entries (wk3-sheets, dbf-table); ne_110m_land.dbf stays
tests/
  unit/parser/    float80, detect, wk3-*.test.ts, dbf-*.test.ts, workbook.test.ts
  unit/helpers/   wk3-scan.ts (new, independent of src/parser); dbf-scan.ts (extended); dbf-sample.ts as is
  property/parser/wk3.property.test.ts, dbf.property.test.ts, workbook.property.test.ts
  differential/parser/wk3-manifest.test.ts, dbf-manifest.test.ts, workbook-wk1.test.ts
e2e/
  seance-wk3-dbf.spec.ts, fixtures/seance-files.ts (two builders)
```

Dependency rule (structure.md) holds: `parser` imports nothing outside `src/parser`; `verify` imports `parser`; `cli` imports `parser`. The writers in `scripts/lib` and the walkers in `tests/unit/helpers` stay independent of `src/parser`.

## Model

```ts
export type SheetFormat = "wk1" | "wks" | "wk3" | "dbf" | "unknown";
export type Wk1Format = SheetFormat;                       // alias, no churn
export type NamedSheet = { name: string; sheet: Sheet };
export type Workbook = { format: SheetFormat; sheets: NamedSheet[] };

export type WorkbookParseResult =
  | { kind: "wk1"; workbook: Workbook; diagnostics: Diagnostic[]; stats: Wk1Stats }
  | { kind: "wk3"; workbook: Workbook; diagnostics: Diagnostic[]; stats: Wk3Stats }
  | { kind: "dbf"; workbook: Workbook; diagnostics: Diagnostic[]; stats: DbfStats; table: DbfTable };
```

`Sheet` keeps its shape (format, version, sawEof, declaredDimensions, cells). Widening `Wk1Format` to `SheetFormat` means the exhaustive tables that index by `"wk1" | "wks" | "unknown"` (`KIND` in `batch-rows.ts`, the CLI) get a TypeScript error, which is how the compiler lists every place to update. No `Cell` kind is added. Every consumer that already handles four cell kinds handles WK3 and DBF cells.

`DbfTable = { version: number; lastUpdate: { year: number; month: number; day: number }; declaredRecords: number; headerLength: number; recordLength: number; codePage: number; fields: { name: string; type: string; length: number; decimals: number }[] }`. `lastUpdate.year` is the raw byte plus 1900, not validated and not turned into a date object.

## Detection (`detect.ts`)

```
detectKind(bytes):
  if first record is BOF (opcode 0, length >= 2) and version in WK3_VERSIONS  -> "wk3"
  if isDbfHeader(bytes)                                                          -> "dbf"
  else                                                                           -> "wk1"
```

`isDbfHeader` is the check now in `src/cli/inventory.ts` (`fromBytes`), moved without change, so the CLI and the parser agree. `inventory.ts` keeps only the BOF map for `wk1`/`wks` and calls `detectKind` for the rest, and adds the `wk3` format. A DBF starts with a non-zero byte and a WK file starts `00 00`, so the two checks cannot both pass.

The fall-through to `"wk1"` is deliberate. It keeps today's behaviour for noise, a BOF with an unknown version and a truncated file: `parseWk1` returns `format: "unknown"` and the app shows its "not a file this version can read" panel, as it does now.

`WK3_VERSIONS` is a constant filled by task 1 from sources. Until then the table is empty and `detectKind` never returns `"wk3"`.

## WK3 reader

### What is known and what is not

The framing is the same as WK1: `opcode u16, length u16, body`. Everything below the framing is a candidate until task 1 has sourced it. The reader reads its table from one file, `src/parser/wk3-records.ts`, in which every entry has a `source` comment, as `src/formula/opcodes.ts` does. An opcode without a source line SHALL NOT be added.

Candidate layout, to be confirmed or corrected by task 1 (from memory of public format notes and of other readers; none of it is verified here):

| Item | Candidate |
|---|---|
| BOF version | 0x1000 for 1-2-3 release 3 (WK3); later releases use other 0x10xx words and are out of scope |
| BOF body | 26 bytes, version first |
| Cell address | row u16, sheet u8, column u8 (so the sheet index sits between row and column) |
| LABEL | format u8, address, prefix byte, text up to NUL |
| NUMBER | format u8, address, 10-byte IEEE extended precision |
| SMALLNUM | format u8, address, packed 16-bit value |
| FORMULA | format u8, address, 10-byte cached value, status word, RPN length u16, RPN |
| Sheet or range names | one or more records, not confirmed |

The extended-precision number and the sheet byte are the two facts that differ from WK1 in ways that change the model. Both are handled below. If task 1 shows that a candidate is wrong, only `wk3-records.ts`, the writer and the walker change.

### Record loop

The same loop as `parseWk1`, in `wk3.ts`, with the same checks (`truncated-record`, `missing-bof`, `short-record`, EOF handling, `skipped-opcode` once per opcode). It shares `ByteReader` and `DiagnosticSink`. The decoders are table-driven: a record-table entry names the decoder (`label`, `number80`, `small`, `formula80`, `names`), so adding a confirmed record is a table line and a test.

Sheets are created on first use in a `Map<number, Sheet>` keyed by sheet index, then emitted in ascending index order. All sheets get `format: "wk3"`, the BOF version and `sawEof`. `declaredDimensions` stays `null` unless a confirmed record carries it.

Names: a name record fills `names: Map<number, string>`. Unnamed sheets are named from the index with the bijective base-26 function that `a1` already uses for columns (0 is `A`, 255 is `IV`). Duplicates get ` 2`, ` 3` and a `duplicate-sheet-name` warning (requirement 5).

### Extended precision to double (`float80.ts`)

A 10-byte value is a 64-bit significand with an explicit integer bit, a 15-bit exponent (bias 16383) and a sign bit, little-endian. `float80ToDouble(bytes)` returns `{ value, exact }`:

1. Zero significand: signed zero, exact.
2. Exponent 0x7FFF: significand fraction 0 gives signed infinity, anything else gives NaN. Both are exact in the sense of "same class". (The ERR, NA and STRING patterns of WK1 are doubles. Whether WK3 stores them as these extended values is an open point for task 1.)
3. Otherwise value = significand x 2^(exp - 16383 - 63). Round to 53 bits, ties to even, using `BigInt` for the significand so the result is exact and does not depend on the runtime's float arithmetic. Exponents above the double range give infinity, below it give subnormals (rounded) or zero. `exact` is false when any bit was lost or the value overflowed or underflowed.

`BigInt` keeps this in pure TypeScript with no `node:*`. The encoder used by the tests (`scripts/lib/wk3-writer.ts`) builds a 10-byte value from a double, so doubles round-trip exactly, and a second test helper builds values with more than 53 significant bits to test rounding.

A rounded number is still a `number` cell holding the double. The `value-rounded` diagnostic (one per file, first address, count in stats) tells the report that the stored 80-bit value was not representable. The verification engine treats the double as the oracle, as it does for WK1. This cannot create a false `mismatched` on a value that is only a rounding of the stored one, because the oracle and the engine both start from the same double.

## DBF reader

### Header and fields

```
offset 0      version byte (see isDbfHeader)
offset 1..3   last update: year-1900, month, day
offset 4..7   record count u32
offset 8..9   header length u16
offset 10..11 record length u16
offset 29     code page (language driver id)
offset 32..   field descriptors, 32 bytes each, until a 0x0D byte
              name  [0..10]   NUL padded
              type  [11]      'C' 'N' 'F' 'D' 'L' 'M' ...
              length[16]
              decimals[17]
after header  records, each: 1 deletion byte (0x20 live, 0x2A deleted) + field bytes
then          optional 0x1A
```

These offsets are the ones `tests/unit/helpers/dbf-scan.ts` already reads and `ne_110m_land.dbf` confirms (the manifest was built from the same bytes). Field offsets inside a record accumulate from 1.

The reader steps record by record at `headerLength + i * recordLength`. If the field lengths plus 1 do not equal `recordLength`, it warns (requirement 31) and still steps by the header's `recordLength`; a field that would cross the record end gets a `bad-field` warning and no cells.

### Sheet layout

One sheet `Table`, format `dbf`, `version` the version byte, `sawEof` true when the 0x1A was present, `declaredDimensions` null. Row 0 is the header row of label cells (`'` prefix, field name). Data rows follow, one per live record. The reader writes rows directly into `Map` with `cellKey`. A table of 1,048,575 records x 10 fields is 10 million cells, which the Map handles but which would stress a browser tab; the 32 MiB file limit of the app keeps real inputs far below that, and the row cap (requirement 40) is the hard stop.

### Values

| Type | Bytes to cell |
|---|---|
| `C` | `label`, prefix `'`, Latin-1, trailing space and NUL removed |
| `N`, `F` | trim, strict decimal regex `^[+-]?(\d+\.?\d*\|\.\d+)([eE][+-]?\d+)?$`, then `Number(text)`; blank gives no cell; no match gives a `label` with the text and `invalid-number` |
| `D` | `label` with the 8 characters as stored; blank gives no cell |
| `L` | `label` with `T`, `F`, `Y`, `N`, `?` as stored; blank gives no cell |
| `M` | `label` with the block number text as stored, one `memo-not-read` warning per file |
| other | no cell, one `unsupported-field-type` warning per field, counted in `unreadableCells` |

`Number(text)` is the only conversion. It is exact for the decimal text (the nearest double), and the reader never rounds to the `decimals` field. A value like `0.10` is `0.1`. The walker `scanDbf` uses the same `Number(trimmed)` call, so the two agree on every fixture; they share the rule and not the code.

Choosing `label` for D, L and M follows requirement 16: the text is stored exactly as read. A date as text cannot be mistaken for a number and can be sorted as text, since DBF dates are `YYYYMMDD`. The cost is that Excel sees text. The alternative (an Excel date) needs a date cell kind and a decision on time zones, so it is a follow-up.

### Counting

For one table with `F` fields and `R` complete records of which `X` are deleted:

```
positions = (R - X) * F
cells + blankCells + unreadableCells = positions          (invariant, a property test)
cells = labels + numbers + otherTyped
```

`labels` counts cells from `C` fields only, `numbers` cells from `N`/`F` fields only. A `D` or `L` cell, or an `N` cell with bad text, is in `otherTyped`. The manifest's `counts` are positions over all declared records, so the differential test rebuilds them (see below).

## Dispatch (`workbook.ts`)

```ts
export function parseWorkbook(bytes: Uint8Array): WorkbookParseResult {
  switch (detectKind(bytes)) {
    case "wk3": return { kind: "wk3", ...parseWk3(bytes) };
    case "dbf": return { kind: "dbf", ...parseDbf(bytes) };
    default: { const r = parseWk1(bytes); return { kind: "wk1", workbook: { format: r.sheet.format, sheets: [{ name: "Sheet1", sheet: r.sheet }] }, diagnostics: r.diagnostics, stats: r.stats }; }
  }
}
```

A WK1 or noise input always yields one sheet, so the unsupported and failed classification in the UI keeps working through `workbook.format === "unknown"` and `sheets[0].sheet.cells.size === 0`. `workbook.sheets` is never empty for `wk1`. For `wk3` and `dbf` it may hold zero sheets when the file has no cells and no names (a header-only DBF has the header row, so one sheet).

## Verification

`verifyWorkbook(workbook, name)` returns `SheetVerification[]`, one per sheet:

- `wk1`, `wks`, `unknown`: `[verifySheet(sheet, name)]`, unchanged.
- `wk3`: for each sheet, a `CellResult` for every formula cell with status `unverifiable`, reason `wk3-formula-not-decoded`, `cached` as stored, no Lotus or Excel text, no recalculated value. Message: "Formulas in WK3 files are not read yet. The stored result is kept as the file remembers it." Non-formula cells give no result, as in WK1.
- `dbf`: no results. `totals.formulas` is 0.

`classifySheet` is not called for WK3 (it would decode the RPN with the WK1 table and give wrong answers or false `decode-error`s). This is the one place where the proof-first promise needs care: a WK3 formula is never `matched` in this feature, so a WK3 file cannot produce a green headline. The new reason code is added to `REASON_CODES` (the report and the totals `byReason` already iterate it), with a unit test that the code list and the report's reason table agree.

`verifyBytes(bytes, name)` keeps its signature and result for WK1. A new `verifyWorkbookBytes(bytes, name)` returns `{ diagnostics, verifications }` for the CLI and the worker.

## Pipeline changes

### Worker protocol

```ts
export type RaisedSheet = { name: string; sheet: WireSheet; verification: SheetVerification };
export type RaisedFile = {
  name: string; byteLength: number; sha256: string | null;
  format: SheetFormat;                 // workbook format
  diagnostics: Diagnostic[];
  sheets: RaisedSheet[];               // at least one for wk1/wks/unknown, as before
  table?: DbfTable;                    // dbf only, for the meta line and the report
  stats: WorkbookStats;                // the reader's stats, structured-clone safe
};
```

`RaisedSheet.verification.name` stays the file name (as today); `RaisedSheet.name` is the sheet name. `handleRaiseRequest` calls `parseWorkbook` and `verifyWorkbook`. `RaiseDeps` gains no new members; the `parse` and `verify` hooks change type with the new functions. The wire message has no `Map`, as before.

This change is done first and alone (task 11) as a behaviour-preserving refactor: every consumer of `file.sheet` and `file.verification` moves to `file.sheets[0]`, and the whole unit and e2e suites must pass before the new formats are visible. That keeps WK1 regressions separate from WK3 and DBF bugs.

### XLSX and report

- `XlsxInput` stays (one sheet). A new `XlsxWorkbookInput = { sheets: { name: string; sheet: Sheet; verification: SheetVerification }[] }` is added and `writeXlsx` accepts either (a one-sheet input is a workbook with one sheet named `Sheet1`, which is what the adapter writes now, so the bytes do not change).
- `exceljs-adapter.ts` loops over sheets. `excelSheetName(name, taken)` makes names valid and unique and returns whether it changed one, so `plan.ts` adds a `sheet-name-changed` writer note.
- For WK3, a formula cell is written as its stored value with no formula, plus note `wk3-formula-not-translated`. For DBF, labels and numbers are written as they are.
- The report gains `sheets: [{ name, format, totals, asRead?: number }]` and wording lines per format. `report.totals` stays the sum over sheets, which for one sheet is the same object as before.
- The HTML report stays self-contained and keeps its escape rules (names of sheets and DBF field names come from the file and go through the same escaper).

### CLI

`inventory.ts` calls `detectKind`; `lazarus --verify` calls `verifyWorkbookBytes` and prints the counts per file (summed over sheets). `export.ts` accepts `wk3` and `dbf`. The exit codes stay as they are.

## UI

The model and views change as little as the requirements allow.

- `entries.ts`: `acceptEntry` matches `/\.(wk1|wks|wk3|dbf)$/i`. `skipWhy.extension` reads "not a Lotus or dBase file".
- `copy.ts`: the strings of requirements 53 and 54, plus `sheetTabs: "Sheets in this workbook"`, `asRead: (n) => "${n} values shown as read"`, `wk3FormulaNote`, and `kind` names. The summon test that says the subtitle has no "WK3" or "dBase" is replaced by one that says it has both (red first).
- `batch-rows.ts`: `KIND` gains `wk3` and `dbf`; the line sums `totals` over all sheets with a small `sumTotals(list)` in `src/ui/model/totals.ts`. `percentVerified` for a summed total with 0 formulas stays `none`.
- `classify-file.ts`: `unsupported` when `file.format === "unknown"`; `failed` when no sheet has cells and an error diagnostic exists (same rule, over all sheets).
- `app-state.ts`: `sheetIndex: number` in the state. Actions: `selectSheet(index)` (closes the drawer, clamps to range), reset to 0 on `selectFile`, `raised` of the first file and `reset`. Late actions with an old batch id still change nothing.
- `SheetTabs.tsx` (new): `role="tablist"`, roving tabindex, arrow keys, Home and End, same pattern as `Filters.tsx`, uses the same CSS tokens (no new colour). Only rendered when `sheets.length > 1`. On a phone the tab list scrolls sideways inside its own box (the page itself never scrolls sideways, per the layout spec).
- `SheetView.tsx`: passes `file.sheets[sheetIndex]` to the grid, totals, filters and status list; the meta line gets the format and sheet count.
- `TotalsSurface.tsx`: when `verification.format === "dbf"`, shows "No formulas" and the as-read line. There is no proof bar and no pill, and the primary Download pill stays.
- `ErrorPanel.tsx`: `EXTENSIONS` lists four; `SummonView.tsx`: `accept=".wk1,.wks,.wk3,.dbf"`.
- `file-names.ts`: strips a final `.wk3` or `.dbf`.
- Downloads: `buildDownload` passes all sheets (xlsx and report), unchanged otherwise.

The drawer needs no change: a WK3 formula cell has `status: "unverifiable"` and a reason, which the drawer already prints, and `cached` is not null.

## Fixtures

Two synthetic fixtures, built by the generator from constant specs (no clocks, no randomness):

`wk3-sheets/wk3-sheets.wk3`: three sheets.

| Sheet | Content |
|---|---|
| A | labels with `'`, `"`, `^`; an empty label |
| B | small numbers (an integer 0, 1, -1, 32767), doubles `0.1` and `-2.5`, one extended-precision value that is exactly a double and one that needs rounding |
| C (named `Totals`) | three numbers and a formula cell with a stored result and a short RPN |

It is written through `scripts/lib/wk3-writer.ts`, whose layout comes from task 1's table. `tests/unit/helpers/wk3-scan.ts` is a second, separate reading of the same layout (written in the test tree, without importing the writer or the parser).

`dbf-table/dbf-table.dbf`: dBase III, fields `NAME C(10)`, `PRICE N(8,2)`, `QTY N(4,0)`, `ADDED D(8)`, `PAID L(1)`, `NOTE M(10)`. Records: four live, one deleted (`*`), one with blank `PRICE` and `QTY`, one with `NAME` holding leading spaces and a high byte (0xE9). Ends with 0x1A.

Both get `LICENSE.txt` in the fixed 4-key form, with "Source: generated by scripts/gen-fixtures.ts" and `License: MIT`. The generator test (`gen-fixtures.test.ts`) compares committed bytes with `buildAll()`.

Manifest entries use the existing shape. WK3 adds `sheets: [{ name, counts }]` and `format: "wk3"`; `cell` is `"Totals!C2"`. For DBF the entry is the existing form; its `counts` are positions: `cells` = declared records x fields, `labels` = records x `C` fields, `numbers` = records x (`N` + `F`) fields, which is what `scanDbf` computes. `manifest.test.ts` extends its `wk3` branch with `scanWk3` and checks the sheet list.

The existing manifest test treats unlisted files and PII the same way for new files (the PII scan runs on the new bytes: the DBF `NAME` values are product words, no email or phone shaped text).

## Tests

Every test is written red first (tech.md).

### Unit

- `float80.test.ts`: zero, -0, 1, -2.5, 0.1 (as a double widened to 80 bits), the largest finite double, the smallest subnormal, infinity, NaN, a value with 64 significant bits (rounding down, up, and the tie to even case), overflow to infinity, underflow to zero and to a subnormal, `exact` flag in each.
- `detect.test.ts`: BOF 0x0404 and 0x0406 give `wk1`; a WK3 version gives `wk3` (once sourced); `SAMPLE_DBF` and `ne_110m_land.dbf` give `dbf`; empty, noise, header-only and a BOF with version 0x1234 give `wk1`; a file that is both a valid DBF header and starts with `00 00` cannot exist (byte 0 differs).
- `wk3-*.test.ts` (bof-eof, cells, sheets, formula, skip, robustness): one file per behaviour, as the WK1 spec does. Cases: version in and out of the table; two sheets with interleaved records; a cell for sheet 255; sheet names, default names (`A`, `Z`, `AA`, `IV`), duplicate names; label prefixes and high bytes; a small number; a double; an extended number that is exact and one that is rounded (diagnostic and `roundedNumbers`); a formula with exact cached bits and an RPN copy; duplicates; out-of-range address; an unknown opcode skipped by length; a truncated record; a record body shorter than its layout.
- `dbf-header.test.ts`, `dbf-fields.test.ts`, `dbf-records.test.ts`, `dbf-types.test.ts`, `dbf-robustness.test.ts`: header fields read, bad terminator, 256 descriptors, field length sum mismatch, code page 0x03 quiet and 0x65 diagnosed, `C` trimming, `N` with sign, point, exponent, leading and trailing spaces, `N` blank, `N` with `abc`, `D`, `L`, `M` with its warning, type `I` unsupported, deleted record skipped and counted, partial last record, fewer records than declared, missing 0x1A, trailing bytes, the 1,048,575-row cap (a synthetic header that declares more records than are present gives `truncated-table`; the cap is tested with a stubbed limit parameter, not with a million rows).
- `workbook.test.ts`: dispatch for each kind; the WK1 path equals `parseWk1`.
- `tests/unit/verify/workbook.test.ts`: WK3 formula cell is `unverifiable` with the new code and the stored `cached`; no WK3 cell is ever `matched`; a DBF gives zero results; the new reason code is in `REASON_CODES` and the report table.
- `tests/unit/xlsx/`: a three-sheet workbook reads back (via `xlsx-readback`) with three worksheets, names, every cell value, no extra cell; a name with `[`, a 40-character name and two names that differ only by case are made valid and noted; a one-sheet WK1 workbook is byte-identical to the committed golden bytes or the pre-change output (compare against `writeXlsx` of the previous release, recorded as a hash in the test).
- `tests/unit/report/`: per-sheet totals, the DBF "as read" line, WK3 wording, HTML escaping of a sheet name `<b>&"`.
- UI unit tests (render with `renderToStaticMarkup`): `entries.test.ts` (accepts `.WK3`, `.Dbf`; still skips `.wk2`, `.txt`, `.wk1.bak`), `copy.test.ts`, `summon-view.test.tsx` (subtitle, hint, accept attribute), `error-panel.test.tsx`, `sheet-tabs.test.tsx` (roles, `aria-selected`, roving tabindex, not rendered for one sheet), `totals-surface.test.tsx` (the DBF as-read variant has no proof bar and no pill), `batch-rows.test.ts` (kind `WK3`/`DBF`, summed totals, no formulas gives the neutral pill), `app-state.test.ts` (`selectSheet`), `file-names.test.ts` (`.wk3`, `.dbf`). `purity.test.ts` stays green.

### Property (fast-check)

- `wk3.property.test.ts`: arbitrary bytes behind a valid BOF never throw; framed garbage keeps `bytesRead` and offsets in range; mutated `wk3-sheets` bytes never throw; writer round trip with random cells over random sheet indexes (exact doubles through the 80-bit encoder, labels, formulas with random RPN) gives the same cells; `float80ToDouble(encode80(d))` is `d` for every double (`Object.is`, NaN excepted, which is its own example); for a random 64-bit significand and exponent, the result equals the correctly rounded double computed by a slow BigInt oracle in the test.
- `dbf.property.test.ts`: arbitrary bytes never throw; arbitrary bytes behind a valid header (random declared counts, lengths) never throw and `bytesRead` stays in range; generated tables (random fields of supported types, random live and deleted records) satisfy the count invariant and every cell equals the cell the generator wrote; `N` text generated from doubles with `toFixed` or `toExponential` parses back to `Number(text)`; mutated `dbf-table` and `ne_110m_land` bytes never throw.
- `workbook.property.test.ts`: arbitrary bytes never throw in `parseWorkbook`, `workbook.sheets` has unique names, every cell address in a `wk1` result is below 65536.

### Differential

- `wk3-manifest.test.ts`: for each `wk3` manifest entry (guard: at least one), parse, assert no `error` diagnostic, the stats equal `counts`, the sheet names and per-sheet counts equal `sheets`, every `expectedValues` entry, and the cells equal `scanWk3`. The test title says whether the file is synthetic or real, so the output shows how much of this is self-consistency (requirement 64).
- `dbf-manifest.test.ts`: for each `dbf` entry: no `error` diagnostic; rebuild the manifest positions from `table.fields` (`records x fieldCount`, `records x C-fields`, `records x (N+F)-fields`) and compare them with the manifest; compare the cells with `scanDbf` for every non-deleted record (a position `scanDbf` calls blank must have no cell; one with a value must have the same kind and value); check the invariant of requirement 42; for `ne_110m_land.dbf` assert 127 records, 3 fields, 381 cells, 127 labels, 254 numbers, 0 deleted, 0 blank, 0 unreadable.
- `workbook-wk1.test.ts`: for every wk1 and wks manifest entry, `parseWorkbook(bytes).workbook.sheets[0].sheet` deep-equals `parseWk1(bytes).sheet`, the diagnostics and stats are equal, and `verifyWorkbook` totals equal `tests/differential/verify/golden.json` (read, never regenerated).

### e2e

One spec, `e2e/seance-wk3-dbf.spec.ts`, two tests plus one axe scan, using builders in `e2e/fixtures/seance-files.ts` that build the files through `scripts/lib` (so expected values come from the bytes written, not from the UI):

1. Drop `wk3-sheets.wk3` on the zone (synthetic `drop` event with a page-built `DataTransfer`, as `seance-files.spec.ts` does). Expect the `h1` `wk3-sheets.wk3`, a tablist with three tabs named `A`, `B`, `Totals`, the grid of sheet A showing its first label, click `B`, the grid shows `0.1` at its address, click `Totals`, the formula cell's accessible name ends with "Unverifiable", its drawer shows the stored result and the sentence of requirement 46. Totals show 0 matched, 0 mismatched, 1 unverifiable.
2. Drop `dbf-table.dbf`. Expect the `h1`, no tablist, "No formulas", "values shown as read" with the count from the manifest, the grid header row (`NAME`, `PRICE`, ...), a numeric cell right aligned, no proof bar, no element with the status pills' text "Matched".
3. Both tests assert the Summon subtitle before the drop contains "WK3" and "dBase", and an axe scan (same tags as `seance-a11y.spec.ts`, zero serious or critical) of each result view at 1440 and at 390.

Download of the WK3 workbook is covered by a unit test through `buildDownload`; the e2e does not repeat it.

Existing e2e specs that assert old behaviour are updated in task 15 and named there: `seance-files.spec.ts` case (c) (the DBF file in the fixtures folder is no longer skipped, so the folder yields one row per wk1, wks, wk3 and dbf fixture), and every place that counts rows or skipped files.

## Decisions and trade-offs

- **One cell model, no new kinds.** DBF dates and logicals as text means no change in the engine, writer, report and grid. Cost: Excel sees text. Alternative (a date kind) touches 5 modules and needs a date policy.
- **`parseWorkbook` as the only entry for the app, `parseWk1` untouched.** The 1,464 existing tests keep their meaning. The cost is one thin wrapper.
- **WK3 formulas are `unverifiable`, not translated.** The WK1 token table is not the WK3 table, and a wrong translation is worse than none. The cached result is kept and shown. The honest limit is stated in the UI limits line and the report.
- **Candidate WK3 layout, evidence first.** The reader is written after the sources are recorded (task 1). The spec gives candidates only to show what must be confirmed. This follows lotus-format.md ("do not hard-code the opcode table from memory").
- **Deleted DBF records are skipped and reported**, not shown. dBase users treat them as gone, and an exported XLSX that resurrects deleted rows would mislead. The diagnostic and the stat keep the fact visible.
- **Header row as sheet row 0 for DBF.** A table without field names is unreadable. The count is kept apart (`headerCells`) so `stats.cells` matches the manifest.
- **Tabs only for more than one sheet.** The WK1 view and its tests stay as they are.
- **Row cap equal to the Excel limit.** Beyond it the XLSX could not hold the data. A cap with an `error` diagnostic is better than a silent truncation or a crash.
- **`BigInt` for the 80-bit conversion.** Exact and runtime independent. Requires ES2020, which the build target already has (check `tsconfig.json` target in task 3).

## Risks

- **No real WK3 file in the corpus.** The writer, the walker and the reader share one author and one reading of the layout, so they can share a mistake. Mitigation: task 1 hunts for a redistributable file; requirement 64 forbids a "verified" claim without one; the test titles say "synthetic". If a real file turns up and disagrees, the sources win and the layout table is corrected.
- **The sheet-index position in the cell address and the 10-byte number are the two layout facts that most change results.** Both are in `wk3-records.ts` only, with a source line.
- **Large DBF files** (up to 32 MiB, millions of cells) can slow the main thread when the grid builds its model. The grid is windowed, parsing runs in the worker, and the `seance-responsive` e2e (5,000 formulas) keeps running; add a one-off check with a 100,000-record generated table in the unit tests (parse time and `Map` size only, not a CI timing assertion).
- **Wider `SheetFormat`** can break code that switches on the three old values. The compiler finds them; the task list names the known ones.
- **Moving `RaisedFile` to `sheets[]`** touches many UI tests. It is done as a separate, behaviour-preserving step with the whole suite as the safety net.
- **Latin-1 for DBF text** can show wrong characters for DOS code pages (437, 850). The code page byte is kept and diagnosed, never silently converted.
