# XLSX writer: evidence

Findings from building the XLSX writer and provenance report (`.kiro/specs/xlsx-writer`). Each line names the test that shows it.

## exceljs 4.4.0 probe (`tests/unit/xlsx/exceljs-probe.test.ts`)

- Every call in the design's "exceljs usage" table works as written. The README section titles exist as named; the value types sit under the top-level "Value Types" list (no "Cells" heading).
- A formula result of `0` is written (`<v>0</v>`), but reading `cell.value` drops it (`Cell._copyModel` copies only truthy fields). `cell.result` keeps it, so the read-back helper uses `cell.result`.
- `-0` is written as `0`. Requirement 7 (`Object.is`) cannot hold for `-0`; the round trip compares `-0` with `===`. Every other double tried, `0.1` included, survives exactly.
- `writeBuffer` gives a Node buffer under bun; `new Uint8Array(...)` copies the same bytes.
- A string that starts with `=` stays a string.

## Notes on value-less cells (`tests/unit/xlsx/write.test.ts`)

A note on a cell with no value (a stored NaN) is written to `xl/comments1.xml` with its `ref`, but exceljs's reader drops it because the cell has no `<c>` element in the sheet. The file is correct; the read-back helper reads notes from `xl/comments1.xml` itself.

## ZIP timestamps (`tests/unit/xlsx/determinism.test.ts`)

exceljs zips with JSZip, which stamps each entry with the current local time. With the normaliser bypassed, two writes at different system times differed only in the DOS time and date fields of each local and central header. No extended-timestamp (`0x5455`) extra fields are written, so the normaliser handles headers only.

## Fixture round trip (`tests/differential/xlsx/roundtrip.test.ts`)

- Every wk1/wks fixture in `fixtures/manifest.json` and every synthetic fixture from `buildAll()` re-reads with the same values, labels, formula text and stored results, and no extra cells. The only fixture `verifyBytes` reads as `unknown` is `fixtures/natural-earth-land/ne_110m_land.dbf`.
- `KSBASE.WK1`: 160 formulas checked one by one; the six number cells holding ERR (`7ff0000000000000`, first at G36) read back as `#VALUE!` with a note.
- `gnome647171-1.wks`: 4 formula cells. A5 holds the cached NaN pattern (`7ff0ffffffffffff`) and is written as a formula with no stored result and a note.
- Label prefixes across all wk1/wks fixtures: `'` 285, `^` 32, `"` 12. No real file uses `\` or `|`, so the fill and non-printing mappings rest on hand-built tests.
- The real data exposed no writer defect. Breaking the ERR mapping on purpose (`#NUM!`) fails the KSBASE case at G36.

## Writer properties (`tests/property/xlsx/writer.property.test.ts`)

- A label `_x0041_` read back as `A`: OOXML treats `_xHHHH_` in cell text as an escaped character. The adapter now escapes the underscore (`_x005F_`), so every label reads back as its sanitised text. The case is a fixed example in the property test because random strings rarely hit it.
