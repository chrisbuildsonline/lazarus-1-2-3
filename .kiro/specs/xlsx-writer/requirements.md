# Requirements: XLSX writer and provenance report

Goal: write a modern XLSX workbook from a parsed WK1/WKS sheet and its verification result, and produce a provenance report (JSON and a self-contained HTML page) from the same verification result. Add `--xlsx` and `--report` to the `lazarus` CLI. The writer keeps every value the file remembers. It never replaces a cached Lotus value with a recalculated one.

This feature does not build the React report UI, macro translation, DBF or WK3 output, number formats, or any edit of the source file. It does not call a model.

Terms:

- A *formula cell* is a `formula` cell in the parser's `Sheet`. Its *cached value* is the double the file stored. Its *recalculated value* is what `src/verify` computes.
- A *CellResult* is one entry of `SheetVerification.cells` (`src/verify/classify.ts`). It holds `address`, `col`, `row`, `status`, `cached`, `recalculated`, `reason`, `formula` (Excel text or null) and `candidateOpcodes`.
- A *Value* is the `src/verify/value.ts` type: `num`, `str`, `err` or `na`.
- A *cell plan* is a plain-data description of one worksheet cell (address, value or formula plus result, alignment, note). The plan is built without exceljs. A thin adapter turns plans into a workbook.
- *Untranslatable* means a formula cell whose `CellResult.formula` is `null`.
- A *note* is an Excel cell note (a comment attached to a cell).
- *Fixture workbook set* means every fixture in `fixtures/manifest.json` that `verifyBytes` reads as `wk1` or `wks`. DBF fixtures are outside the set (finding 6).

## EARS requirements

### Entry points, purity and portability

1. The module `src/xlsx` SHALL export `writeXlsx(input: XlsxInput): Promise<XlsxResult>`, where `XlsxInput` is `{ sheet: Sheet; verification: SheetVerification }` and `XlsxResult` is `{ bytes: Uint8Array; notes: WriterNote[] }`. The function is async because exceljs `writeBuffer` is async.
2. Only one file, `src/xlsx/exceljs-adapter.ts`, SHALL import `exceljs`. No other file under `src/`, `scripts/` or `mcp/` SHALL import it.
3. `src/xlsx` SHALL import only `src/parser`, `src/verify` (types only), `exceljs` and its own files. It SHALL NOT import `src/ui`, `src/cli`, `src/workers`, `src/report`, React, DOM types, or any `node:*` module, and SHALL NOT use `Buffer`, `fs`, `fetch`, `XMLHttpRequest`, `WebSocket` or `navigator.sendBeacon`.
4. `writeXlsx` SHALL run unchanged in bun and in a browser page. It SHALL return a plain `Uint8Array` in both (not a Node `Buffer`).
5. `writeXlsx` SHALL NOT mutate its inputs or keep a reference to them after returning.
6. `writeXlsx` SHALL NOT reject for any `Sheet` the parser can produce, including empty sheets, sheets with non-finite numbers, labels with any characters, and cells outside the Excel grid. Problems become `WriterNote` entries or cell notes (requirements 12, 13, 21).

### Values and labels

7. WHEN a cell is an `integer` or `number` cell with a finite value, the writer SHALL write a numeric cell holding exactly that double (`Object.is`, so `-0` stays `-0`). The writer SHALL NOT round or convert it.
8. WHEN a `number` or `integer` cell holds `+Infinity`, the writer SHALL write the error value `#VALUE!`. WHEN it holds `-Infinity`, the writer SHALL write `#N/A`. In both cases the cell SHALL carry a note saying Lotus stored ERR or NA there. WHEN it holds `NaN`, the writer SHALL write no value and add a note saying Lotus stored a marker that is not a number. (Rule S27 in `.kiro/steering/lotus-format.md`.)
9. WHEN a cell is a `label`, the writer SHALL write its `text` as a string cell. The prefix character SHALL NOT appear in the cell text.
10. The label prefix SHALL set the horizontal alignment: `'` left, `"` right, `^` center, `\` fill. For `|` (non-printing) and for any other prefix character the writer SHALL set no alignment and SHALL add a note naming the prefix. An empty prefix SHALL set no alignment and no note.
11. A label whose text starts with `=`, `+`, `-` or `@` SHALL be written as a string cell, never as a formula. Label text SHALL be written character for character, except for characters XML 1.0 cannot carry (requirement 12).
12. IF a label's text holds characters that XML 1.0 cannot carry (control characters other than tab, line feed and carriage return, lone surrogates, U+FFFE, U+FFFF), THEN the writer SHALL replace each with U+FFFD and add a note saying how many characters were replaced.
13. IF a cell lies outside the Excel grid (column index 16384 or more, row index 1048576 or more), THEN the writer SHALL NOT write it and SHALL add a `WriterNote` with code `outside-excel-grid` and its Lotus address. Cells inside the grid SHALL be unaffected.
14. The writer SHALL NOT set any number format, font, fill, border or column width. Date serials SHALL stay plain numbers. (Lotus cell formats are not parsed yet.)

### Formula cells

15. WHEN a formula cell's `CellResult.formula` is non-null, the writer SHALL write a formula cell with that text (no leading `=`) and the cached value as its stored result, so the file opens showing the remembered number. The status of the cell (matched, mismatched or unverifiable) SHALL NOT change what is stored.
16. For a formula cell the stored result SHALL equal the cached double (`Object.is`), and SHALL NOT be the recalculated value, for every status. A test SHALL fail if the writer reads `CellResult.recalculated`.
17. WHEN the cached value is ERR or NA (`CellResult.cached` is `err` or `na`), the stored result SHALL be the error value `#VALUE!` or `#N/A`. WHEN `CellResult.cached` is `null` (a stored NaN, which is how Lotus marks a formula that returns text), the writer SHALL write the formula with no stored result and SHALL add a note saying the text Lotus stored is not read yet and the cell has no remembered value.
18. The writer SHALL NOT set the workbook's calculate-on-load flag, so the file shows the remembered numbers until a user recalculates.
19. WHEN a formula cell is untranslatable, the writer SHALL write the cached value as a plain value (number, or error value for ERR and NA, or no value for NaN) and SHALL add a note. The note SHALL contain the Lotus formula text when `CellResult.lotusFormula` is non-null, and `CellResult.reason.message`.
20. IF a formula cell has no `CellResult` (an input that does not come from `verifySheet`), THEN the writer SHALL treat it as untranslatable with a note saying no verification result was supplied. It SHALL NOT drop the cell.
21. Every cell that carries a note SHALL also have its note text listed as a `WriterNote` (`address`, `code`, `message`), so a caller can show them without opening the workbook.

### Workbook shape and determinism

22. The workbook SHALL hold exactly one worksheet named `Sheet1`. Lotus column `col` and row `row` (0-based) SHALL map to the same cell as `a1(col, row)`.
23. The workbook `creator` and `lastModifiedBy` SHALL be `Lazarus 1-2-3`. `created` and `modified` SHALL be the fixed instant `1980-01-01T00:00:00.000Z` and SHALL NOT come from a clock.
24. The writer SHALL add cells in row-major order. The same `Sheet` and `SheetVerification` SHALL give byte-identical output, whatever the insertion order of `sheet.cells`, and whatever the system time when `writeXlsx` runs.
25. The timestamps in the ZIP container (local file headers and central directory) SHALL be set to the fixed DOS date 1980-01-01 00:00:00 after exceljs has written the archive. IF the archive cannot be parsed for that step, THEN the writer SHALL return the bytes unchanged and add a `WriterNote` with code `zip-not-normalised`.
26. Byte-identical output is required within one runtime. It is not required between bun and a browser.

### Provenance report: data

27. The module `src/report` SHALL export `buildReport(input: ReportInput): ProvenanceReport`, a pure function. `ReportInput` is `{ fileName: string; sha256: string; byteLength: number; toolVersion: string; verification: SheetVerification }`. `buildReport` SHALL read the verification result and these five scalars and nothing else: not the `Sheet`, not the file bytes, not a clock.
28. `src/report` SHALL import only `src/verify` types and its own files. It SHALL NOT import `src/xlsx`, `src/ui`, `src/cli`, `src/workers`, `exceljs`, React, DOM types or `node:*`, and SHALL NOT use clocks, randomness or the network.
29. `ProvenanceReport` SHALL hold, in this key order: `schemaVersion` (the number 1), `tool` (`{ name: "lazarus-1-2-3", version }`), `source` (`{ fileName, sha256, byteLength, format }`), `tolerance`, `totals`, `unsupportedFeatures`, `unknownOpcodes`, `rows`.
30. `source.fileName` SHALL be the base name only. `buildReport` SHALL strip any directory part (`/` or `\`). The report SHALL hold no absolute path, no user name and no timestamp.
31. `source.sha256` SHALL be the lowercase hex SHA-256 of the input file's bytes, 64 characters. The module SHALL export `sha256Hex(bytes: Uint8Array): Promise<string>` built on Web Crypto (`globalThis.crypto.subtle`), which works in bun, Node and browsers.
32. `rows` SHALL hold one row per `CellResult`, in the same order. A row SHALL hold `address`, `lotusFormula` (string or null), `excelFormula` (string or null), `cached` (Value or null), `recalculated` (Value or null), `status`, `reason` (`{ code, rule?, message }`), and, for mismatched cells, `inputs` and `inputsOmitted` copied from the `CellResult`.
33. `cached` and `recalculated` SHALL be the Value objects of the verify result, unrounded. The report SHALL NOT round, convert or replace any value.
34. `totals` SHALL be a copy of `SheetVerification.totals` (`formulas`, `matched`, `mismatched`, `unverifiable`, `exact`, `withinTolerance`, `byReason`). `matched + mismatched + unverifiable` SHALL equal `formulas` and SHALL equal `rows.length`. `buildReport` SHALL NOT recompute the counts from rows to make them agree; a test recomputes them from rows and compares.
35. `unknownOpcodes` SHALL list, for each opcode named by an `unknown-opcode` reason, the opcode as `0xNN` and the addresses of the cells that name it, sorted by opcode. `candidateOpcodes` from `CellResult` (opcodes read but not yet confirmed by a fixture) SHALL be listed separately under each row that has them, not mixed with unknown opcodes.
36. `unsupportedFeatures` SHALL list, grouped by reason code and rule id, the cells whose reason is `unsupported-function`, `volatile-function`, `undocumented-semantics`, `decode-error`, `string-result` or `circular-reference`. Each entry SHALL hold `code`, `rule` (or null), `name` (the `@function` name when the reason message names one, else null), `count` and `addresses` (the first 50, in row-major order). Entries SHALL be sorted by code, then rule, then name.
37. WHEN an opcode or function name is read out of `reason.message`, the pattern SHALL be the one the verify helpers `unknownOpcode`, `unsupportedFunction` and `volatileFunction` write. A test SHALL build each message with the verify helper and fail if the report no longer finds the opcode or name. IF the pattern does not match, THEN the entry SHALL use `null` for the opcode or name and still list the cell.
38. `serializeReportJson(report: ProvenanceReport): string` SHALL return JSON with two-space indent, keys in the order of requirement 29, and a trailing newline. Output for the same report SHALL be identical on every call.

### Provenance report: HTML

39. `renderReportHtml(report: ProvenanceReport): string` SHALL return one complete HTML document. It SHALL contain no `<script>` element, no `<link>`, `<img>`, `<iframe>`, `<object>`, `<embed>` or `<form>` element, no attribute starting with `on`, no `src` or `href` attribute, no `url(` and no `@import` in its CSS, and no `http:` or `https:` text outside the displayed data. It SHALL hold one `<style>` element with all CSS inline.
40. The document SHALL carry a `Content-Security-Policy` meta tag of `default-src 'none'; style-src 'unsafe-inline'`, a `lang` attribute, a `charset` meta tag and a `<title>`.
41. Every string that comes from the report (file name, formulas, messages, rule ids, function names, addresses, values) SHALL pass through one function, `escapeHtml`, that replaces `&`, `<`, `>`, `"` and `'`. The renderer SHALL have no code path that inserts report text unescaped. For any input strings, every `<` in the output SHALL start one of the tags the renderer's own template writes.
42. The CSS SHALL use the colour, radius, shadow, spacing and type values of `design/DESIGN.md` section 2, written as CSS custom properties with the same names (`--canvas`, `--surface`, `--text`, `--status-matched-bg` and so on). Because `src/ui/tokens.css` does not exist yet, the values SHALL live in `src/report/tokens.ts`, and a test SHALL compare each against the CSS block in `design/DESIGN.md`, and against `src/ui/tokens.css` as soon as that file exists. It SHALL NOT add a colour that is not a token.
43. The page SHALL show the file name, the SHA-256, the tool version, the tolerance, the three counts and the percentage verified (`matched / formulas`, or the words "No formulas" when `formulas` is 0), the unsupported features, the unknown opcodes, and a table with one row per cell holding address, Lotus formula, Excel formula, stored value, recalculated value, status and reason. Status SHALL appear as a pill with the words Matched, Mismatched or Unverifiable, never colour alone. A mismatched row SHALL show its `inputs`. The HTML SHALL state that stored values were not changed.
44. The page SHALL be readable without scripts and with `prefers-reduced-motion`: it SHALL use no animation or transition.

### Prerequisite changes outside the new modules

45. `src/formula` SHALL export `printLotus(ast: Expr): string`, a printer for Lotus `@` syntax (`@SUM(A1..A3)`, `+`, `-`, `*`, `/`, `^`, `=`, `<>`, `#AND#`, `#OR#`, `#NOT#`, `&`), and `CellResult` SHALL gain `lotusFormula: string | null`, set from the Lotus AST that `recalcSheet` already holds (null when decoding fails). No other `src/verify` result, status, reason or total SHALL change, and `tests/differential/verify/golden.json` SHALL stay as it is.
46. `package.json` SHALL list `exceljs` as a dependency at an exact version, and `bun.lock` SHALL record it.

### CLI

47. `lazarus <file> --xlsx <out.xlsx>` SHALL parse and verify the file, write the workbook to `<out.xlsx>` and print one summary line to stdout. `lazarus <file> --report <out.json|out.html>` SHALL write the provenance report, choosing JSON or HTML from the extension (`.json`, `.html`), case-insensitive. Both flags MAY be given together, with `--json` and `--verify`, and MAY each be given once.
48. IF the `--report` extension is neither `.json` nor `.html`, or the `--xlsx` extension is not `.xlsx`, or a flag has no value, or a flag is repeated, or the input is a folder, THEN the CLI SHALL print a usage message to stderr, write nothing and exit 2.
49. IF the input is not a WK1/WKS file (a DBF, an unknown format, an unreadable file), THEN the CLI SHALL print a message naming the file and the format found, write nothing and exit 1.
50. IF an output path is the same file as the input (after resolving it), THEN the CLI SHALL refuse, write nothing and exit 2. The CLI SHALL build every requested output in memory first and write only when all have been built.
51. The report written by the CLI SHALL use the base name of the input as `source.fileName`, the SHA-256 of the bytes read, and the `version` field of `package.json` as `tool.version`.
52. The stderr notice SHALL say that stored values are never changed, as the existing `--verify` notice does. Without `--xlsx` and `--report`, the CLI SHALL behave exactly as before: same output, same exit codes.
53. The CLI SHALL make no network request.

### Acceptance

54. For every file in the fixture workbook set, re-reading the written XLSX with exceljs SHALL give, for every cell the Lotus sheet holds inside the Excel grid, the same value (numbers by `Object.is`, labels by text) and, for formula cells, the same formula text and the same stored result as the writer was given. No extra cells SHALL appear.
55. For every file in the fixture workbook set, the report's `totals` SHALL equal `verifyBytes(...).verification.totals` (deep equal), and the counts recomputed from `rows` SHALL equal them.
56. A fast-check property test SHALL show that, for arbitrary strings in every report string field, the HTML output contains no tag outside the renderer's own tag list and no unescaped `<`, and that an arbitrary label text carried through a formula's string constant and an arbitrary file name never produces a tag.
57. A purity test SHALL fail if any file under `src/xlsx` imports from `src/ui`, and (same test) from `src/cli`, `src/workers` or `src/report`; and if any file other than `src/xlsx/exceljs-adapter.ts` imports `exceljs`.
58. The whole suite (`bun run test`) and `bun run typecheck` SHALL pass.

## Findings from reading the repository

These shape the requirements. Each needs a decision from you where marked.

1. **`CellResult` has no Lotus formula text.** The request asks for a Lotus formula per report row, built only from the verify report. `CellResult.formula` is the Excel text, and `src/formula` has no Lotus printer. Requirement 45 adds one printer and one field. This edits `src/formula` and `src/verify`, which this spec otherwise only reads. **Decision needed:** approve that change, or drop `lotusFormula` from the report.
2. **`src/ui/tokens.css` does not exist.** `src/ui` holds only `App.tsx` and `main.tsx`. The tokens are in `design/DESIGN.md` section 2. Requirement 42 copies them into `src/report/tokens.ts` and tests them against that block.
3. **`exceljs` is not installed**, and `package.json` has no writer dependency. Requirement 46 adds it. The exceljs documentation could not be opened while this spec was written (web access was denied), so the API calls in design.md are from the exceljs README as I know it. Task 1 is a probe test that confirms each call against the installed version before any code depends on it.
4. **exceljs output is probably not byte-deterministic by itself.** Fixed `created` and `modified` dates fix the document properties. The ZIP entries carry their own timestamps. Requirement 25 normalises them and task 5 tests it with a mocked clock.
5. **Labels are not in the report.** The report holds formula rows only, and `InputRow` records `kind: "label"` without text. Label text can reach the HTML through a string constant inside a formula and through the file name. Requirement 56 tests those paths and every other string field.
6. **The manifest holds a DBF fixture** (`natural-earth-land`). It is outside the writer's scope (the fixture workbook set in Terms; product scope is WK1/WKS now). Task 12 asserts the exact list of skipped fixtures so a new WK1 fixture cannot be skipped silently.
7. **The CLI currently treats every non-flag argument as a path.** `--xlsx out.xlsx` would count `out.xlsx` as a second path. Task 20 replaces the argument handling and keeps the existing behaviour as tested.
8. **Mismatched cells are written with the cached value and no note.** The report is where a mismatch is shown. If you want a note on mismatched and unverifiable cells inside the workbook too, say so; it is a small addition to the cell plan.
