# Requirements: WK3 and DBF readers (F9)

Goal: two more pure readers in `src/parser`, a WK3 reader (several sheets per file) and a DBF reader (header, fields, records), that produce the same cell model the WK1/WKS parser produces, so that the verification engine, the XLSX writer, the report and the browser app handle all four formats. The Seance UI accepts `.wk1`, `.wks`, `.wk3` and `.dbf` files and shows every sheet.

Terms:

- A *record* (Lotus) is `opcode u16 LE, length u16 LE, body`, as in the WK1 spec.
- A *workbook* is a list of named sheets. WK1, WKS and DBF files give one sheet. A WK3 file gives one sheet per sheet index it uses.
- *As read* means the value is shown exactly as the file stores it, and nothing was recalculated. A DBF has no formulas, so all of its values are as read.
- A *candidate* WK3 layout is a record layout taken from memory or a secondary source and not yet confirmed (see requirement 61).

## EARS requirements

### Workbook model

1. The parser module SHALL export `type SheetFormat = "wk1" | "wks" | "wk3" | "dbf" | "unknown"`. The existing `Wk1Format` SHALL stay exported as an alias of `SheetFormat`, so no existing import changes.
2. The parser module SHALL export `type NamedSheet = { name: string; sheet: Sheet }` and `type Workbook = { format: SheetFormat; sheets: NamedSheet[] }`.
3. The `Cell` union SHALL NOT gain a new kind. WK3 and DBF cells are `integer`, `number`, `label` and `formula` cells with the meaning they have today. Columns and rows are 0-based.
4. Every sheet of every format SHALL use `cellKey(col, row)`, `getCell` and `cellsInRowMajorOrder`. Cells are never shared between sheets.
5. Sheet names SHALL be unique inside a workbook. IF two sheets would get the same name, THEN the later one SHALL get a numeric suffix (`Sales 2`) and the reader SHALL add a `duplicate-sheet-name` warning.

### Entry points and purity

6. The parser module SHALL export `parseWk3(bytes: Uint8Array)`, `parseDbf(bytes: Uint8Array)` and `parseWorkbook(bytes: Uint8Array)`. `parseWk1` stays exported and SHALL behave exactly as before (same sheet, diagnostics and stats for every input).
7. `parseWorkbook` SHALL choose the reader from the bytes (a function `detectKind(bytes)`), never from a file extension. It SHALL return `{ workbook, diagnostics, stats }`, where `stats` is the stats object of the reader that ran.
8. `detectKind` SHALL return: `"wk3"` for a first record that is BOF with a version in the confirmed WK3 table; `"dbf"` for bytes that pass the DBF header check of requirement 28; `"wk1"` for everything else. Everything else includes BOF records with an unknown version, non-BOF bytes, empty input and noise, so that `parseWk1` keeps producing the diagnostics and the `unknown` format it produces today.
9. WHEN `parseWorkbook` runs a WK1 or WKS file, THEN it SHALL return one sheet named `Sheet1`, and that sheet SHALL deep-equal `parseWk1(bytes).sheet`.
10. All new readers SHALL be pure functions of the input. They SHALL NOT import React, the DOM, `node:*`, the XLSX writer library or `src/cli`, and SHALL NOT use clocks, randomness or the network. They SHALL NOT mutate or retain the input array. Byte data kept in the model (RPN bytes) SHALL be a copy.
11. All multi-byte integers and floating-point numbers of both formats SHALL be read little-endian.
12. The CLI inventory (`src/cli/inventory.ts`) SHALL use `detectKind` and `parseDbf`'s header check from `src/parser`, so there is one definition of "this is a DBF" and one of "this is a WK3". `Format` in the CLI gains `"wk3"`.

### Robustness (all readers)

13. Every read SHALL be checked against the end of the input and against the end of the current record body (WK3) or field (DBF) before it happens.
14. IF the input is empty, truncated or arbitrary garbage, THEN each reader SHALL return a result with diagnostics and SHALL NOT throw.
15. Diagnostics SHALL use the existing `Diagnostic` shape and cap (1000, then one `diagnostics-truncated`). New codes SHALL be added to `DiagnosticCode`: `unknown-format`, `duplicate-sheet-name`, `value-rounded`, `bad-header`, `bad-field`, `unsupported-field-type`, `invalid-number`, `deleted-record`, `truncated-table`, `row-limit`, `memo-not-read`, `code-page-not-decoded`.
16. No reader SHALL silently drop, guess or coerce a value. Every record, field or cell that does not become a cell and is not an expected skip SHALL have a diagnostic, and its count SHALL be in `stats`.

### WK3 reader

17. `parseWk3` SHALL read the WK3 BOF record, set `workbook.format` to `"wk3"` and keep the version word in each sheet's `version`. IF the version is not in the confirmed table, THEN it SHALL add an `unknown-version` warning and keep parsing the records it understands.
18. `parseWk3` SHALL read the same record framing as WK1 (requirements 5, 7 to 10 and 15 to 17 of the WK1 spec apply, with `truncated-record`, `short-record`, `missing-bof`, `missing-eof`, `trailing-bytes` and `skipped-opcode` handled the same way).
19. WHEN a WK3 cell record is read, THEN `parseWk3` SHALL read its sheet index, column and row, and add the cell to the sheet with that index. Sheets SHALL appear in the workbook in ascending sheet index, and a sheet SHALL exist only if a cell, a sheet-name record or a dimension record names it.
20. A sheet SHALL be named by its name record when the file has one. Otherwise it SHALL be named by its index in Lotus style (`A` for 0, `B` for 1, `Z` for 25, `AA` for 26, up to `IV` for 255).
21. WHEN a WK3 label cell is read, THEN it SHALL become `{ kind: "label", prefix, text }` with the prefix and the Latin-1 text rules of WK1 requirements 21 to 23.
22. WHEN a WK3 number cell stores an IEEE 754 double, THEN it SHALL become `{ kind: "number", value }` with the exact bits. WHEN a WK3 number cell stores a 10-byte extended-precision value, THEN it SHALL become `number` rounded to the nearest double (ties to even), and IF the conversion changed the value, THEN the reader SHALL add one `value-rounded` info diagnostic per file with the first address and `stats.roundedNumbers` SHALL count them. The rounded double SHALL NOT be adjusted in any other way.
23. WHEN a WK3 cell stores a small packed number, THEN it SHALL become `integer` if the layout says it is a 16-bit integer and `number` otherwise, with the exact value the layout defines.
24. WHEN a WK3 formula cell is read, THEN it SHALL become `{ kind: "formula", cached, rpn }` where `cached` follows requirement 22 and `rpn` is a copy of the raw token bytes. The reader SHALL NOT decode the RPN.
25. IF two cell records in one sheet have the same address, THEN the later one SHALL replace the earlier one and the reader SHALL add a `duplicate-cell` warning. IF a column is above 255 or a row above 8191, THEN the cell SHALL be kept with an `address-out-of-range` warning.
26. WK3 stats SHALL hold `records, cells, formulas, labels, numbers, roundedNumbers, sheets, skippedRecords, skippedByOpcode, bytesRead`. Definitions match WK1 requirement 35, counted over all sheets.
27. Every opcode, field order and width the WK3 reader uses SHALL be listed in `.kiro/steering/lotus-format.md` with its source (requirement 61). Candidate layouts SHALL NOT be used by the reader.

### DBF reader

28. A DBF header check SHALL pass when the input has at least 32 bytes, byte 0 is a known dBase version byte (`0x02 0x03 0x04 0x05 0x30 0x83 0x8B 0xF5`), the header length is above 32, the record length is above 0, and `headerLength + records * recordLength <= input length + 1`.
29. `parseDbf` SHALL read: version byte, last-update date (kept as three numbers, not converted), record count (u32), header length (u16), record length (u16), code page byte (offset 29), then the field descriptors. The result SHALL hold them in a `table` object next to the workbook.
30. A field descriptor is 32 bytes: name (11 bytes, up to the first 0x00, Latin-1), type (1 byte), length (offset 16) and decimal count (offset 17). The list ends at the byte 0x0D. IF the terminator is missing before the header ends, THEN `parseDbf` SHALL add a `bad-header` error and read no records. IF there are more than 255 descriptors, THEN it SHALL add a `bad-header` error and read no records.
31. IF the sum of the field lengths plus 1 differs from the record length, THEN `parseDbf` SHALL add a `bad-field` warning with both numbers and SHALL use the record length from the header to step through the records.
32. `parseDbf` SHALL produce one sheet named `Table`. Row 0 holds one label cell per field with the field name (prefix `'`). Data row `n` (1-based) is sheet row `n`. Field `k` (0-based) is column `k`. Header cells are counted in `stats.headerCells`, not in `stats.cells`.
33. A record whose deletion flag is `*` (0x2A) SHALL NOT produce cells. The reader SHALL add one `deleted-record` info diagnostic naming the first record and `stats.deletedRecords` SHALL count them. The next live record takes the next sheet row, and the diagnostic names the 1-based record number of the deleted one.
34. WHEN a field of type `C` is read, THEN the cell SHALL be `{ kind: "label", prefix: "'", text }` where `text` is the field bytes decoded as Latin-1, with trailing spaces and trailing 0x00 removed and leading spaces kept. An all-blank character field SHALL give a label with empty text.
35. WHEN a field of type `N` or `F` is read, THEN the trimmed text SHALL be parsed as a decimal number (optional sign, digits, optional point, optional exponent) and the cell SHALL be `{ kind: "number", value }` where `value` is `Number(text)` of that text. A blank numeric field SHALL give no cell and SHALL be counted in `stats.blankCells`. IF the text is not a decimal number, THEN the cell SHALL be a `label` holding the trimmed text as read, with an `invalid-number` warning, and it SHALL be counted in `stats.otherTyped`.
36. WHEN a field of type `D`, `L` or `M` is read, THEN the cell SHALL be a `label` (prefix `'`) holding the trimmed text exactly as stored (`20261114`, `T`, a memo block number), counted in `stats.otherTyped`. For `M`, the reader SHALL add one `memo-not-read` warning per file: the memo text lives in a separate file this version does not read. A blank `D`, `L` or `M` field SHALL give no cell and SHALL be counted in `stats.blankCells`.
37. WHEN a field has any other type, THEN the reader SHALL add one `unsupported-field-type` warning for that field, SHALL create no cells for it, and SHALL count them in `stats.unreadableCells`.
38. IF the code page byte is not `0x00` and not `0x03`, THEN the reader SHALL add one `code-page-not-decoded` info diagnostic with the byte. Text is decoded as Latin-1 in every case. The raw byte is kept in `table.codePage`.
39. IF fewer bytes remain than the header declares, THEN the reader SHALL read every complete record, add a `truncated-table` error with the declared and read counts, and keep the cells already read. A partial last record SHALL produce no cells.
40. IF the file has more than 1,048,575 live records (the Excel row limit minus the header row), THEN the reader SHALL stop at that row, add a `row-limit` error with the declared count, and keep the rows read.
41. The byte 0x1A after the last record is optional. IF it is missing, THEN the reader SHALL add one `info` diagnostic with code `missing-eof`. IF other bytes follow, THEN it SHALL add `trailing-bytes`.
42. DBF stats SHALL hold `records` (declared and complete), `deletedRecords`, `fields`, `headerCells`, `cells` (value cells created), `labels` (cells from `C` fields), `numbers` (cells from `N` and `F` fields), `otherTyped`, `blankCells`, `unreadableCells`, `bytesRead`. They SHALL satisfy: `cells + blankCells + unreadableCells = (records - deletedRecords) * fields` and `cells = labels + numbers + otherTyped`.
43. DBF has no formulas. A DBF sheet SHALL contain no `formula` cell, and `stats.formulas` SHALL NOT exist.

### Verification of the new formats

44. The verification engine SHALL accept a workbook and return one `SheetVerification` per sheet, in sheet order. `verifySheet(sheet, name)` SHALL stay and SHALL give the same result as today for a WK1 or WKS sheet.
45. WHEN a sheet has format `dbf`, THEN its verification SHALL have no cells and totals of 0 formulas. The totals SHALL NOT be reported as 100% or as matched. The report and the UI SHALL say "No formulas. N values shown as read." where N is `stats.cells`.
46. WHEN a sheet has format `wk3`, THEN every formula cell SHALL be `unverifiable` with the new reason code `wk3-formula-not-decoded` (a plain-words message that says the formula bytes of WK3 files are not read yet), and the engine SHALL NOT run the WK1 RPN decoder on WK3 bytes. A WK3 sheet with no formula cells SHALL show 0 formulas, as a WK1 sheet does.
47. The cached value read from the file SHALL stay untouched in every case. No verification step, no model response and no writer SHALL change a value of a WK3 or DBF cell.

### Output files

48. `writeXlsx` SHALL write every sheet of a workbook as a worksheet, in sheet order. Worksheet names SHALL be the sheet names made valid for Excel (at most 31 characters, none of `[ ] : * ? / \`, not empty, unique ignoring case, no leading or trailing apostrophe), and each change SHALL add a writer note. The output for a one-sheet WK1/WKS workbook SHALL stay byte-identical to the output before this feature.
49. Cell values in the workbook SHALL be as stored: DBF numbers as numbers, DBF text, dates and logicals as text, WK3 formulas with their cached result and no formula text (the Excel text is unknown). A WK3 formula cell SHALL carry a writer note that the formula was not translated.
50. The provenance report (JSON and HTML) SHALL list each sheet with its name, format, totals and the "as read" count for a DBF. Existing top-level report fields SHALL keep their meaning (additive change only). The report SHALL say, for WK3, that formulas were read with their stored result and were not recalculated, and for DBF that nothing was recalculated.
51. `lazarus <file> --verify`, `--xlsx` and `--report` SHALL accept WK3 and DBF files. `lazarus <path>` SHALL print `wk3` for a WK3 file.

### Seance UI

52. The Summon view SHALL accept files whose name ends in `.wk1`, `.wks`, `.wk3` or `.dbf` (case-insensitive): dropped, picked and inside a folder. The hidden file input SHALL have `accept=".wk1,.wks,.wk3,.dbf"` and `multiple`.
53. The Summon subtitle SHALL name WK1, WKS, WK3 and dBase, and keep the proof-first promise in plain words. The limits line SHALL read: "This version reads WK1, WKS and WK3 worksheets and dBase tables. WK3 formulas are shown with their stored results and are not checked yet. Macros are not translated yet." The drop zone hint SHALL list the four extensions. Every string SHALL stay in `src/ui/copy.ts`.
54. The unsupported-file panel SHALL list `.wk1`, `.wks`, `.wk3` and `.dbf`. The skip reason for a wrong extension SHALL read "not a Lotus or dBase file."
55. WHEN a workbook has more than one sheet, THEN the Sheet view SHALL show a tab list (`role="tablist"`, one `role="tab"` per sheet, the sheet name as text, `aria-selected`, roving `tabindex`, Left and Right arrow keys, Home and End). Selecting a tab SHALL show that sheet's totals, grid, filters and status list, and SHALL close an open cell drawer. The first sheet SHALL be selected when a file opens. A one-sheet workbook SHALL show no tab list.
56. The totals surface SHALL show the numbers of the selected sheet. For a DBF sheet it SHALL show "No formulas" in place of the percentage, then "N values shown as read", no proof bar, and no status pill. The file meta line SHALL show the format name (`WK3`, `DBF`), the sheet count when it is above 1, the formula count and the byte size.
57. A batch row SHALL show the kind `WK1`, `WKS`, `WK3` or `DBF`. The status line of a multi-sheet file SHALL sum the totals of all sheets. A file with no formulas in any sheet SHALL show "No formulas" with the neutral pill, never Matched.
58. The grid, the cell drawer, the status list and the downloads SHALL work on the selected sheet, with no change to their behaviour for WK1. Downloads (XLSX, report) SHALL cover the whole workbook, not only the selected sheet. Download file names strip a final `.wk3` and `.dbf` as they strip `.wk1` and `.wks`.
59. The drawer for a WK3 formula cell SHALL show the cached value as remembered, no raised value (the copy "Could not be calculated"), the status Unverifiable and the reason message of requirement 46. The Lotus formula text SHALL show "The formula could not be read."
60. The privacy rules of the Seance UI spec SHALL keep holding: static same-origin requests only, no new network call, axe reports no serious or critical violation on the new views.

### Evidence and fixtures

61. Before any WK3 opcode is used by the reader, the project SHALL record in `.kiro/steering/lotus-format.md` each WK3 opcode, field order and width with a source (a published format description or the source file of another reader, with the file and line or section named). A layout that rests on one secondary source SHALL be marked as such. The same note SHALL name every difference from WK1.
62. The fixture corpus SHALL hold: at least one synthetic WK3 file with 3 sheets (labels, integers or small numbers, doubles, one extended-precision number, one formula), at least one synthetic DBF with the field types of requirements 34 to 37, a deleted record, a blank numeric field and a `D`, `L` and `C` field, and the existing real `ne_110m_land.dbf`. Each directory SHALL have a `LICENSE.txt` and a `manifest.json` entry. The generator SHALL write the synthetic ones and the same input SHALL give byte-identical output.
63. A manifest entry for a WK3 file SHALL carry the totals over all sheets in `counts` and a `sheets` list with each sheet's name and counts. `expectedValues` for WK3 SHALL use `SheetName!A1`. For DBF the existing `record:field` form stays, with `0:` never used (records are 1-based and the header row is not a record).
64. A synthetic WK3 or DBF fixture proves that the reader agrees with our reading of the layout, not that the layout is right. The README and the report SHALL NOT claim that WK3 reading is verified against real files unless a real, redistributable WK3 file is in the corpus and parses with counts that equal an independent reading of its bytes.

## Acceptance

1. Every `wk3` and `dbf` entry of `fixtures/manifest.json` parses with no `error` diagnostic, and the parser stats equal the manifest `counts`. For a DBF, the manifest counts are positions (records x fields, labels = `C` positions, numbers = `N` and `F` positions), so the differential test compares them with `stats.cells + stats.blankCells + stats.unreadableCells`, `stats.labels + blanks in C fields`, and so on, as design.md "Differential tests" spells out. For `ne_110m_land.dbf` the result is 381 cells, 127 labels, 254 numbers, with no deleted, blank or unreadable cell.
2. For every `expectedValues` entry of those fixtures, the parsed cell has the manifest kind and value.
3. The cells also equal the output of independent walkers in `tests/unit/helpers` (`scanWk3`, and the existing `scanDbf`), which do not import `src/parser`.
4. For every wk1 and wks fixture, `parseWorkbook` gives the same sheet as `parseWk1`, and the verification, the XLSX and the report of those files are byte-identical to the output before this feature (the existing golden and round-trip tests pass unchanged).
5. The property tests pass: arbitrary bytes never throw in any reader, the DBF stats invariant of requirement 42 holds on generated tables, WK3 doubles round-trip bit for bit, extended-precision values round to the nearest double.
6. The Playwright spec drops one WK3 and one DBF file: the WK3 shows its sheet tabs and a grid per sheet, the DBF shows "No formulas" and its values as read, and the subtitle lists WK3 and dBase.
7. `bun run typecheck`, `bun run test`, `bun run build` and `CI=1 bun run e2e` exit 0.

## Out of scope

- Decoding WK3 RPN, 3D references and WK3 `@functions` into Excel. WK3 formulas are `unverifiable`. A later feature can add a WK3 token decoder.
- WK4, 1-2-3 97 and `.123` files, FM3 and other format companions, Symphony, Quattro Pro.
- DBF memo files (`.dbt`, `.fpt`), index files, FoxPro-only types (`I`, `B`, `Y`, `T`, `0`), dBase 7 types, field-level code page conversion.
- Cell formats, column widths, named ranges, print settings, charts, macros in WK3 (macros stay a separate feature).
- Editing a worksheet or a table. Running anything.
- Any use of a file extension inside the parser.

## Open questions to settle in review

- **WK3 layouts.** This spec does not trust memory for opcodes. Task 1 must source them. If no source can be read, WK3 stops at the model and the detector, and the spec's WK3 acceptance items move to a later release.
- **Real WK3 file.** None is in the corpus. Task 1 looks for a redistributable one (for example in openpreserve/format-corpus, LibreOffice or Gnumeric test data). Without one, requirement 64 limits what we can say.
- **Deleted DBF records** are skipped and reported (requirement 33). An archivist may want them shown. Flag-only display is a follow-up.
- **DBF dates and logicals** stay text as read. A date cell type would touch the model, the engine and the writer.
- **Latin-1** stands in for the real code page (WK1 spec has the same caveat for LMBCS). The raw code page byte is kept so a later decoder can use it.
- **Sheet name record.** Whether a WK3 sheet-name record exists in the layouts we can source decides requirement 20's first sentence. If none can be sourced, all sheets use index names.
