# Requirements: WK1 and WKS record parser

Goal: a pure parser in `src/parser` that turns the bytes of a Lotus 1-2-3 WKS or WK1 file into a typed sheet model plus diagnostics. It reads cell values, the cached formula double and the raw RPN bytes. It does not decode formulas, recalculate, or write XLSX. Those are later features that build on this model.

Terms: a *record* is `opcode u16 LE, length u16 LE, body`. A *cell record* is INTEGER, NUMBER, LABEL or FORMULA. A *skipped record* is any record the parser does not model.

## EARS requirements

### Entry point and purity

1. The parser SHALL export `parseWk1(bytes: Uint8Array): Wk1ParseResult`, where the result holds `sheet`, `diagnostics` and `stats`.
2. The parser SHALL be a pure function of its input. It SHALL NOT import React, the DOM, `node:*` modules, the XLSX writer library or `src/cli`, and SHALL NOT use clocks, randomness or the network.
3. The parser SHALL give the same result in a Web Worker and in bun, and SHALL NOT mutate or retain a reference to the input array. Byte data kept in the model (RPN bytes) SHALL be a copy.
4. All multi-byte integers and doubles SHALL be read little-endian.

### Robustness

5. The parser SHALL check every read against the end of the input and against the end of the current record body before reading.
6. IF the input is empty, truncated, or arbitrary garbage, THEN the parser SHALL return a result with diagnostics and SHALL NOT throw.
7. IF a record header has fewer than 4 bytes left, or a record's `length` exceeds the remaining bytes, THEN the parser SHALL add a `truncated-record` error diagnostic with the byte offset and SHALL stop reading. Cells parsed before that point SHALL stay in the sheet.
8. IF a known record's body is shorter than its layout needs, THEN the parser SHALL add a `short-record` error diagnostic with the opcode and offset, SHALL NOT add a cell, and SHALL continue with the next record.
9. The parser SHALL NOT silently drop, guess or coerce a cell. Every record that does not produce a cell and is not an expected skip SHALL have a diagnostic.
10. The number of diagnostics SHALL be capped (default 1000). WHEN the cap is reached, the parser SHALL add one final `diagnostics-truncated` diagnostic and keep counting in `stats`.

### BOF, EOF and version

11. WHEN the first record is BOF (0x0000) with a body of at least 2 bytes, the parser SHALL read the version word and set `sheet.version`.
12. WHEN the version is 0x0404, the parser SHALL set `sheet.format` to `"wks"`. WHEN it is 0x0406, `sheet.format` SHALL be `"wk1"`.
13. IF the version is any other value, THEN the parser SHALL add an `unknown-version` warning diagnostic carrying the version, SHALL set `sheet.format` to `"unknown"`, and SHALL continue parsing the records it understands.
14. IF the first record is not BOF, or the input is shorter than a BOF record, THEN the parser SHALL add a `missing-bof` error diagnostic. It SHALL still continue to parse records from offset 0 when the framing is valid, and `sheet.format` SHALL be `"unknown"`.
15. WHEN an EOF record (0x0001) is read, the parser SHALL set `sheet.sawEof` to true and stop reading. IF bytes remain after EOF, THEN it SHALL add a `trailing-bytes` info diagnostic with the count.
16. IF the input ends without an EOF record and no `truncated-record` was raised, THEN the parser SHALL add a `missing-eof` warning diagnostic.
17. The parser SHALL NOT decide the format from a file extension. It has no access to one. Comparing the extension with `sheet.format` is the caller's job.

### Record types

18. WHEN a DIMENSIONS record (0x0006) is read, the parser SHALL store `firstCol, firstRow, lastCol, lastRow` (4 x u16) in `sheet.declaredDimensions`.
19. WHEN an INTEGER record (0x000D) is read, the parser SHALL add a cell `{ kind: "integer", value }` with the int16 value at the record's column and row.
20. WHEN a NUMBER record (0x000E) is read, the parser SHALL add a cell `{ kind: "number", value }` with the exact IEEE 754 double.
21. WHEN a LABEL record (0x000F) is read, the parser SHALL add a cell `{ kind: "label", prefix, text }`. The `prefix` is the first body byte after the address, kept as one character, and `text` is the bytes after it up to the first 0x00 or the end of the body. Bytes SHALL be decoded as Latin-1 with no loss; no byte is dropped or replaced.
22. The parser SHALL accept all five label prefix characters `'` `"` `^` `\` `|` and keep each one in `prefix`. IF the first byte is not one of them, THEN the parser SHALL keep the label, keep that byte as `prefix`, and add an `unknown-label-prefix` warning diagnostic.
23. IF a LABEL body has a prefix but no text (an empty label), THEN the parser SHALL add a label cell with `text` equal to `""`.
24. WHEN a FORMULA record (0x0010) is read, the parser SHALL add a cell `{ kind: "formula", cached, rpn }` where `cached` is the exact stored double (never rounded, never replaced) and `rpn` is a copy of the raw formula bytes. The cell address SHALL be the record's column and row.
25. IF a FORMULA's declared RPN length exceeds the remaining body bytes, THEN the parser SHALL treat it as a `short-record` (requirement 8).
26. The parser SHALL NOT decode, validate or interpret RPN bytes.
27. IF two cell records have the same address, THEN the later one SHALL replace the earlier one in the sheet and the parser SHALL add a `duplicate-cell` warning diagnostic. `stats` SHALL still count both records.

### Skipped records

28. WHEN a record has an opcode the parser does not model, including Quattro Pro extension records found in real files, the parser SHALL skip it using its `length`, SHALL increment `stats.skippedRecords` and `stats.skippedByOpcode[opcode]`, and SHALL NOT treat it as an error.
29. The parser SHALL add one `skipped-opcode` info diagnostic per distinct skipped opcode (first offset only), so many repeats do not flood the diagnostics.

### Sheet model

30. The sheet SHALL store cells in a `Map` keyed by column and row through one helper, `cellKey(col, row)`, and SHALL offer `getCell(sheet, col, row)` and `cellsInRowMajorOrder(sheet)`.
31. Columns and rows SHALL be 0-based `number`s in the model.
32. The parser SHALL export `a1(col, row): string`, so that `a1(0, 0)` is `"A1"`, `a1(25, 0)` is `"Z1"`, `a1(26, 0)` is `"AA1"` and `a1(255, 8191)` is `"IV8192"`. It SHALL also export `parseA1(address): { col, row } | null`, which returns null for text that is not an address.
33. `a1` SHALL produce the same strings as the `a1` in `tests/unit/helpers/wk1-scan.ts` for every column 0 to 65535 and row 0 to 65535.
34. IF a cell's column is above 255 or its row is above 8191 (outside the WK1 grid), THEN the parser SHALL keep the cell and add an `address-out-of-range` warning diagnostic.

### Stats

35. `stats` SHALL hold `records` (all records read), `cells`, `formulas`, `labels`, `numbers` (INTEGER and NUMBER), `skippedRecords`, `skippedByOpcode` and `bytesRead`. The definitions SHALL match `fixtures/manifest.json`: `cells` = INTEGER + NUMBER + LABEL + FORMULA, a FORMULA is not a number, and the counts are numbers of cell records.

## Acceptance

1. Every `wk1` and `wks` entry in `fixtures/manifest.json` parses with no `error` diagnostics, and `stats.cells`, `stats.formulas`, `stats.labels` and `stats.numbers` equal the manifest `counts`.
2. For every `expectedValues` entry of those fixtures, the parsed cell at that address has the manifest kind and a value equal to `cached` (for formulas: the cached double).
3. The cells and counts also equal the output of the independent walker `scanWk1` in `tests/unit/helpers/wk1-scan.ts`.
4. The property tests pass: arbitrary bytes and mutated fixture bytes never throw.
5. `bun run typecheck` and `bun run test` exit 0.

## Out of scope

Decoding RPN into an AST or Excel syntax, recalculation, WK3, DBF (the DBF reader is a separate feature), cell formats and column widths, named ranges, print settings, charts, LMBCS decoding beyond Latin-1, the XLSX writer, UI and worker wiring, any use of a file extension.

## Open questions to settle in review

- Latin-1 is a stand-in for Lotus's LMBCS. Label text with bytes at 0x80 or above may need a later decoder. The raw bytes are not kept in v1. Add `rawText: Uint8Array` if a fixture needs it.
- Whether BOF versions other than 0x0404 and 0x0406 should still be parsed (this spec says yes, with a warning). Symphony (0x0405) records can differ, so the warning matters.
