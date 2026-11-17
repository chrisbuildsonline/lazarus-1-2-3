# Design: XLSX writer and provenance report

## Layout

```
src/formula/
  print-lotus.ts       printLotus(ast): string                      (new, requirement 45)
src/verify/
  classify.ts          CellResult gains lotusFormula                (changed, requirement 45)
src/xlsx/
  plan.ts              planWorkbook(input): { cells: CellPlan[]; notes: WriterNote[] }   (pure, no exceljs)
  labels.ts            alignmentFor(prefix), sanitizeXmlText(text)
  exceljs-adapter.ts   the only exceljs import: buildWorkbookBytes(plans): Promise<Uint8Array>
  zip-normalize.ts     normalizeZipTimestamps(bytes): Uint8Array | null
  index.ts             writeXlsx, types
src/report/
  types.ts             ReportInput, ProvenanceReport, ReportRow
  build.ts             buildReport
  features.ts          unknown opcodes and unsupported features from reason messages
  sha256.ts            sha256Hex (Web Crypto)
  json.ts              serializeReportJson
  escape.ts            escapeHtml
  tokens.ts            the DESIGN.md section 2 values used by the page
  html.ts              renderReportHtml
  index.ts             public exports
src/cli/
  args.ts              parseArgs(argv): ParsedArgs | UsageError
  export.ts            exportFile(...): builds workbook and report in memory (imports xlsx, report, verify)
  lazarus.ts           calls args.ts, keeps the inventory and --verify paths
tests/unit/xlsx/ tests/unit/report/ tests/unit/cli/ tests/unit/formula/
tests/differential/xlsx/ (fixture round trip), tests/differential/report/ (fixture totals)
tests/property/xlsx/ tests/property/report/
tests/unit/helpers/xlsx-readback.ts   reads bytes back with exceljs (tests may import exceljs; src may not)
```

Dependency rule (structure.md, extended): `cli` -> `xlsx`, `report`, `verify`; `xlsx` -> `verify` (types), `parser`; `report` -> `verify` (types). `xlsx` and `report` do not import each other. `parser`, `formula` and `verify` import neither. `ui` and `workers` may import `xlsx` and `report` later. `.kiro/steering/structure.md` does not list `src/report` yet; task 23 adds it.

The one exception to "tests do not import exceljs" is the read-back helper in `tests/`. The confinement rule (requirement 2) covers `src/`, `scripts/` and `mcp/`.

## Reused types

| Type | From | Used for |
|---|---|---|
| `Sheet`, `Cell`, `cellsInRowMajorOrder`, `a1` | `src/parser` | the cells to write and their addresses |
| `SheetVerification`, `Totals`, `CellResult`, `Status`, `Reason`, `ReasonCode`, `Value`, `InputRow`, `Tolerance` | `src/verify` | formulas, cached values, statuses, totals, tolerance |
| `Expr` | `src/formula` | input of `printLotus` |
| `translateFormula` | `src/formula` | **not called by the writer.** `CellResult.formula` already holds its `excel` text, and calling it again could drift from what the report shows. |

`FormulaTranslation.excel` has no leading `=`, which is the form exceljs wants for `formula` (see the API table).

## Pipeline

```
Sheet + SheetVerification
   |
   v  planWorkbook          pure: one CellPlan per Lotus cell inside the grid, plus WriterNotes
   |
   v  buildWorkbookBytes    exceljs: Workbook, one worksheet, cells in row-major order, fixed dates, writeBuffer
   |
   v  normalizeZipTimestamps  fixed DOS date in every ZIP header
   |
   v  Uint8Array

SheetVerification + (fileName, sha256, byteLength, toolVersion)
   |
   v  buildReport  --> ProvenanceReport --> serializeReportJson  --> string
                                       \--> renderReportHtml     --> string
```

Splitting plan from adapter keeps almost all the logic testable without exceljs, and keeps the exceljs surface to one file that can be swapped (tech.md: "wrap it in `src/xlsx` so it can be swapped").

## Cell plan

```ts
export type PlannedValue =
  | { kind: "number"; value: number }
  | { kind: "text"; value: string }
  | { kind: "error"; code: "#VALUE!" | "#N/A" }
  | { kind: "none" };

export type CellPlan = {
  address: string;                 // a1(col, row)
  col: number;                     // 0-based, inside the grid
  row: number;
  value: PlannedValue;             // for a formula cell: the stored result
  formula: string | null;          // Excel text without "="; null for a plain cell
  alignment: "left" | "right" | "center" | "fill" | null;
  note: string | null;
};

export type WriterNote = {
  address: string;
  code: "non-finite-number" | "label-prefix" | "xml-characters-replaced" | "untranslatable-formula"
      | "no-stored-result" | "no-verification-result" | "outside-excel-grid" | "zip-not-normalised";
  message: string;
};
```

Mapping, per Lotus cell, in row-major order:

| Lotus cell | `value` | `formula` | `alignment` | `note` |
|---|---|---|---|---|
| `integer`, `number`, finite | `number` as given | null | null | null |
| `integer`, `number`, `+Infinity` | `error #VALUE!` | null | null | "Lotus stored ERR here." |
| `integer`, `number`, `-Infinity` | `error #N/A` | null | null | "Lotus stored NA here." |
| `integer`, `number`, `NaN` | `none` | null | null | "Lotus stored a marker that is not a number." |
| `label`, prefix `'` `"` `^` `\` | `text` (sanitised) | null | left, right, center, fill | only if characters were replaced |
| `label`, prefix `\|` or unknown | `text` | null | null | "Label prefix X ..." |
| `formula`, result has `formula` text | cached as number, or error, or none | `CellResult.formula` | null | only for a NaN cache |
| `formula`, `CellResult.formula` null | cached as above | null | null | the untranslatable note |

The cached-value step is one function, `storedValue(cached: Value | null): PlannedValue`, used for both formula rows. `num` gives `number`, `err` gives `#VALUE!`, `na` gives `#N/A`, `str` cannot occur for a cached value (the parser only yields doubles) and gives `none`, `null` gives `none`.

`planWorkbook` reads `CellResult.cached`, `.formula`, `.lotusFormula`, `.reason` and nothing else. It never reads `.recalculated` (requirement 16). A test reads the source text of `plan.ts` and fails on the word `recalculated`.

The ERR mapping is a judgement. Lotus ERR is one generic error. `#VALUE!` is the closest Excel error that does not claim a cause (`#DIV/0!` would). If you prefer `#NUM!`, change the one constant in `labels.ts`.

### Label prefix and alignment

Lotus prefixes are in `.kiro/steering/lotus-format.md`: `'` left, `"` right, `^` centre, `\` repeat the text across the cell, `|` non-printing. The prefix is a model property, so the text excludes it (`Cell.text` already does) and only the alignment survives. `\` maps to Excel's `fill` horizontal alignment, which also repeats the text across the cell. This was chosen by meaning; the repeat is not checked against real data, because no fixture holds a `\` label (check in task 7 with `grep` over `fixtures/manifest.json` and state the result in the test header).

### XML-safe text

XML 1.0 allows `#x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]`. `sanitizeXmlText` walks code points and replaces every other one, including lone surrogates, with U+FFFD, and returns the count. Labels are written otherwise unchanged, so `=SUM(A1)` stays a string: exceljs writes a plain string as a shared string, and only an object with `formula` becomes a formula cell.

## exceljs usage

Every call below goes through `src/xlsx/exceljs-adapter.ts`. Citations are to the exceljs README (https://github.com/exceljs/exceljs#readme) by section title.

| Need | Call | README section |
|---|---|---|
| Create workbook | `new ExcelJS.Workbook()` | "Create a Workbook" |
| Fixed document properties | `workbook.creator`, `workbook.lastModifiedBy`, `workbook.created`, `workbook.modified` (JS `Date`) | "Set Workbook Properties" |
| Leave calculate-on-load off | do not set `workbook.calcProperties.fullCalcOnLoad` | "Set Workbook Properties" |
| Add the sheet | `workbook.addWorksheet("Sheet1")` | "Add a Worksheet" |
| Number or text value | `cell.value = 3.5` or `"text"` | "Cells", value types "Number Value", "String Value" |
| Formula with stored result | `cell.value = { formula: "SUM(A1:A3)", result: 7 }` | "Cells", value type "Formula Value" |
| Error value | `cell.value = { error: "#N/A" }`; formula result `{ formula, result: { error: "#N/A" } }` | "Cells", value type "Error Value" |
| Alignment | `cell.alignment = { horizontal: "left" \| "right" \| "center" \| "fill" }` | "Styles", "Alignment" |
| Cell note | `cell.note = "text"` | "Cell Comments" (notes) |
| Write | `await workbook.xlsx.writeBuffer()` | "Writing XLSX" |
| Read back (tests only) | `await workbook.xlsx.load(buffer)`; `worksheet.getCell(address).value`, `.alignment`, `.note` | "Reading XLSX" |

**Verification status of these citations.** The documentation was not reachable when this spec was written. Task 1 writes a probe test that exercises every row of this table against the installed version, and fails if one behaves differently. When it passes, open each README section and fix any wrong section title here.

Points to confirm in the probe:

1. `writeBuffer` returns a `Buffer` in Node/bun and an `ArrayBuffer`-like value in browsers. The adapter always returns `new Uint8Array(buffer)`, which copies from either.
2. A formula result of `0` is kept (not dropped as falsy), and a formula with no `result` reads back with `result` undefined.
3. A string cell starting with `=` reads back as a string.
4. `-0` as a cell value: XLSX stores it as text `-0` or `0`. If it reads back as `0`, requirement 7 (`Object.is`) cannot hold for `-0`. In that case change requirement 7 to compare with `===` and say so in the test; do not hide it.
5. Shortest round-trip number text: exceljs writes JavaScript's `String(n)`. A double such as `0.1` must survive. The fixture round trip (task 12) is the real test.
6. A note on a cell with a value does not change the value.
7. Worksheet rows added in row-major order produce stable XML.

## ZIP timestamps

The adapter fixes `created` and `modified`, which controls `docProps/core.xml`. exceljs builds the archive with a ZIP library that stamps each entry with the current time unless told otherwise, so two runs more than two seconds apart (DOS time has 2-second resolution) probably differ in header bytes. `normalizeZipTimestamps` fixes that without touching content:

1. Find the end-of-central-directory record (signature `0x06054b50`) by scanning back from the end (at most 65 557 bytes).
2. Read the central directory offset and entry count. For each central header (signature `0x02014b50`) set the DOS time (offset +12) to `0x0000` and the DOS date (offset +14) to `0x0021` (1980-01-01). Read the local header offset (+42).
3. At each local header (signature `0x04034b50`) set time (+10) and date (+12) the same way.
4. Return a copy. Return `null` on any bounds or signature failure, so `writeXlsx` can add `zip-not-normalised` and return the original bytes (requirement 25).

The CRC-32 covers file content, not the header time, so the archive stays valid. If the probe finds the ZIP library also writes extended-timestamp extra fields (`0x5455`), step 2 zeroes those too and the test covers it. The test sets the system clock with `vi.setSystemTime` to two instants more than a day apart and compares the output bytes.

Byte equality is promised within one runtime only (requirement 26). Different zlib builds can compress the same data to different bytes.

## Report model

```ts
export type ReportInput = {
  fileName: string;     // may include a path; buildReport keeps the base name
  sha256: string;       // 64 lowercase hex
  byteLength: number;
  toolVersion: string;
  verification: SheetVerification;
};

export type ReportRow = {
  address: string;
  lotusFormula: string | null;
  excelFormula: string | null;
  cached: Value | null;
  recalculated: Value | null;
  status: Status;
  reason: Reason;                   // { code, rule?, message }
  candidateOpcodes?: string[];      // "0x08", only when non-empty
  inputs?: InputRow[];
  inputsOmitted?: number;
};

export type UnknownOpcodeEntry = { opcode: string | null; count: number; addresses: string[] };
export type UnsupportedFeatureEntry = { code: ReasonCode; rule: string | null; name: string | null; count: number; addresses: string[] };

export type ProvenanceReport = {
  schemaVersion: 1;
  tool: { name: "lazarus-1-2-3"; version: string };
  source: { fileName: string; sha256: string; byteLength: number; format: Wk1Format };
  tolerance: Tolerance;
  totals: Totals;
  unsupportedFeatures: UnsupportedFeatureEntry[];
  unknownOpcodes: UnknownOpcodeEntry[];
  rows: ReportRow[];
};
```

`Value` is reused as is, so a number stays `{ "t": "num", "v": 3.5 }`, and ERR and NA stay `{ "t": "err" }` and `{ "t": "na" }`. JSON cannot hold `Infinity` or `NaN`, and the verify layer never puts one in a `Value` (`valueFromDouble` maps infinities to `err` and `na` and NaN to `null`), so every value serialises. A test asserts `JSON.parse(serialize(r))` deep-equals `r` for every fixture.

`buildReport` copies. It does not hold references to `verification`, so later changes to the input do not change the report.

### Features and opcodes from messages

`CellResult` holds no structured opcode or function name; both are inside `reason.message`. `src/verify/value.ts` writes them in fixed forms:

- `unknownOpcode`: `(opcode 0x%02X at offset N)`
- `unsupportedFunction` and `volatileFunction`: `uses @NAME,`

`features.ts` reads them with two patterns, `/opcode (0x[0-9A-F]{2}) at offset \d+/` and `/uses @([^\s,]+)/`. This is a contract between two modules, so task 15 builds each message with the verify helper and asserts the pattern finds the value. If the verify messages are reworded, that test fails first. The cleaner fix is a structured `detail` field on `Reason`; that is a larger change to `src/verify` and is left as a follow-up (open question 3).

`decode-error` reasons carry no opcode in a fixed form, so they are listed under `unsupportedFeatures` with `name: null`.

### Verified percentage

`percentVerified = matched / formulas`, shown by the HTML renderer only, computed from `totals`, rounded down to a whole percent (so 99.7% never shows as 100%). The JSON holds the counts, not the percentage, so the number has one source.

## HTML page

One document, built by string templates in `html.ts`. Structure:

```
<!doctype html>
<html lang="en">
<head> meta charset, CSP meta, viewport, <title>, one <style> </head>
<body>
  <main>
    <header>  wordmark, file name, sha256, tool version, tolerance </header>
    <section id="summary">   big matched count + "% verified", three pills with counts, "Stored values were not changed." </section>
    <section id="features">  unsupported features, unknown opcodes (or "None") </section>
    <section id="cells">     <table> one <tr> per row </table> </section>
  </main>
</body></html>
```

Rules for the renderer:

- Every dynamic string goes through `escapeHtml` inside one helper `t(x: string): string`. There is no other function that appends report text. Numbers are formatted by `showValue(Value | null)` which yields `String(v)`, `ERR`, `NA`, a quoted string, or the word "none" for null, and its output also goes through `escapeHtml`.
- Attribute values are fixed strings from the template (class names such as `pill pill-matched`), never report text. No attribute carries report text, so attribute-context escaping is not needed. `id` anchors use the row index, not the address.
- No element or attribute from the forbidden list in requirement 39 appears in the template.
- Status pill: `<span class="pill pill-matched">Matched</span>`, so the word is part of the page.
- Mismatched rows add a nested list of `inputs` (address, kind, value, cached) under the reason.

**Tokens.** `tokens.ts` exports a `TOKENS` record of the DESIGN.md section 2 names and values the page uses (canvas, surface, surface-sunken, text, text-muted, hairline, accent, status pairs, radii, shadow, spacing, font stacks, type shorthands). `html.ts` writes `:root { --name: value; ... }` from it and uses only `var(--name)` below. The tokens test parses the first ```` ```css ```` block under "## 2. Tokens" in `design/DESIGN.md` and checks every key and value in `TOKENS`. Missing or different means failure. When `src/ui/tokens.css` appears, the same test compares against it too.

Page-level style choices come from `.kiro/steering/design.md`: soft canvas, white surface with `--radius-lg` and `--shadow-surface`, large numbers for the matched count and the percentage, small muted labels, tabular figures (`font-variant-numeric: tabular-nums`), one accent colour, pills with text. No candle glow or ghost-cell fade on this page: it is a document people may print and keep. Reduced motion is satisfied by having no motion.

A very large sheet (8192 rows by 256 columns with all formulas) makes a large page. No row cap, because the promise is "every formula is accounted for". `renderReportHtml` appends to an array of strings and joins once, so it is linear.

## escapeHtml

```ts
const MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => MAP[c]);
```

Also strip nothing else: control characters in text are not an HTML injection risk, and the page declares UTF-8. The property test treats the output as text and checks tags, so a stray control character cannot hide a tag.

**Property test design (requirement 56).** Arbitrary strings come from `fc.string({ unit: "binary" })` plus a tagged generator that mixes in `<script>`, `<img src=x onerror=1>`, `"><svg/onload=1>`, `&lt;` and `]]>`. The check is structural, not "does not contain `<script>`":

1. Collect every match of `/<[^>]*>/g` plus every `<` not followed by a closing `>` anywhere in the output.
2. Each `<` must begin one of the tags in the template's allow list (`html head meta title style body main header section table thead tbody tr th td span ul li code p h1 h2 div` and closing forms), with attributes that match the template's fixed attribute set.
3. The count of `<` in the output must equal the count of `<` that the template itself contains, computed by rendering the same report with every string field replaced by `"x"` (same shape, same row count). Escaped payloads add zero.

Step 3 is the sharp one: any unescaped `<` from data adds to the count and fails.

## Report totals

`buildReport` copies `verification.totals`. It does not call `totals()` from `src/verify/report.ts`. The acceptance test recomputes counts by walking `rows` and compares both ways, so a bug in either shows.

## CLI

```
lazarus <path> [--json] [--verify] [--xlsx <out.xlsx>] [--report <out.json|out.html>]
```

`args.ts` parses argv into `{ path, json, verify, xlsx, report }` or a usage error. Flags with values consume the next token. A flag followed by another flag or nothing is a usage error. `--xlsx=out.xlsx` form is not accepted (usage error), to keep one spelling.

`lazarus.ts` flow when `xlsx` or `report` is set:

1. `stat(path)`; a folder is a usage error (exit 2).
2. Resolve each output path with `node:path.resolve` and compare with `resolve(path)` using `realpath` where the file exists, so a symlink to the input is caught. Same file: exit 2.
3. Read bytes, run `verifyBytes`. IF `verification.format === "unknown"`: print `lazarus: <file>: not a Lotus 1-2-3 worksheet (format: <detected>)`, exit 1. The detected format comes from the existing `detectFormat` in `inventory.ts`, so a DBF is named as a DBF.
4. `export.ts` builds the workbook (`writeXlsx`) and the report (`buildReport` after `sha256Hex(bytes)`), in memory.
5. Write all requested files with `node:fs/promises.writeFile`. Stdout gets one line per file written plus the totals line from `formatSummary`.
6. Stderr gets the `VERIFY_NOTICE`.

`tool.version` comes from `package.json` (`version`), read in `export.ts` with `readFile` and `JSON.parse`, not `import ... with { type: "json" }`, so the same code stays valid under bun and the Vitest runner.

Exit codes stay as documented in the CLI header: 0 ok, 1 file problem, 2 usage.

`src/cli` is the only place with `node:*` in this feature. `src/xlsx` and `src/report` stay portable.

## Test strategy

| Kind | Where | What |
|---|---|---|
| Probe | `tests/unit/xlsx/exceljs-probe.test.ts` | every row of the exceljs table against the installed version |
| Unit | `tests/unit/xlsx/*` | plan mapping, labels, XML sanitising, zip normaliser, determinism |
| Unit | `tests/unit/report/*` | build, features, JSON, escape, HTML, tokens |
| Unit | `tests/unit/formula/print-lotus.test.ts` | the Lotus printer |
| Round trip | `tests/differential/xlsx/roundtrip.test.ts` | every fixture in the manifest set: written then re-read with exceljs |
| Differential | `tests/differential/report/totals.test.ts` | report totals equal verify totals, per fixture |
| Property | `tests/property/xlsx/*`, `tests/property/report/*` | writer never rejects, doubles survive, HTML escaping |
| CLI integration | `tests/unit/cli/export.test.ts` | spawn `bun src/cli/lazarus.ts` against fixtures and a temp directory |
| Purity | `tests/unit/xlsx/purity.test.ts` | import scan of `src/xlsx`, `src/report`, and exceljs confinement |
| Browser | `e2e/xlsx-browser.spec.ts` | the bundle runs in Chromium and writes a readable workbook |

Expected values in tests come from the manifest (`expectedValues`, `counts`), from the Lotus sheet read by `parseWk1`, and from hand-written sheets. They never come from copying what the writer produced. The round trip compares the re-read workbook against the parsed `Sheet`, not against the plan.

## Open questions

1. **ERR and NA error codes.** `#VALUE!` and `#N/A` (see above). A different choice is a one-line change.
2. **Notes on mismatched cells.** Finding 8 in requirements.md.
3. **Structured reason detail.** A `detail` field on `Reason` would replace message parsing in `features.ts`. Not done here to keep `src/verify` changes to the single `lotusFormula` field.
4. **Lotus serial 60.** `.kiro/steering/lotus-format.md` says serial 60 should be flagged in the report. The report is built only from the verify result, which does not know which cells hold dates, so this feature does not flag it. It needs cell formats, which the parser does not read yet.
5. **Parser diagnostics.** The report does not list them, because they are not in `SheetVerification`. `verifyBytes` returns them separately. Adding them is one optional field on `ReportInput` and a schema bump.
6. **Sheet name.** Fixed `Sheet1`. The original sheet has no name in WK1.
