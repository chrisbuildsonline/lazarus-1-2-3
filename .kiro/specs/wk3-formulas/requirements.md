# Requirements: WK3 formulas (F17)

Goal: decode the RPN of WK3 (Lotus 1-2-3 Release 3) FORMULA records (record opcode 0x0019) into the same `Expr` AST the WK1 decoder returns, so the verification engine re-derives each WK3 formula and compares it with the stored 10-byte result. A WK3 formula cell can then be `matched`. Before this, every WK3 formula was `unverifiable` with `wk3-formula-not-decoded`.

Terms:

- A *WK3 token* is one opcode byte plus its operand bytes in the RPN of a WK3 FORMULA record. WK3 token numbers differ from WK1 token numbers.
- The *origin* is the column, row and sheet index of the formula cell. Sheet index is 0-based (A = 0).
- A *foreign reference* is a reference whose sheet byte differs from the origin's sheet index.
- The *stored result* is the 10-byte value of the FORMULA record, already read by `parseWk3` into `cached`. It is the oracle and is never changed.

Sources (copies in `docs/sources/wk3/`; every token is traced in `.kiro/specs/wk3-formulas/evidence.md`): LibreOffice `lotform.cxx` (`LotusToSc::Convert` with `bWK3`, `IndexToTypeWK123`, `IndexToTokenWK123`, `ReadSRD`) and Gnumeric `lotus-formula.c` (`lotus_parse_formula_new`, `get_new_cellref`, `functions_lotus`). Real files: `fixtures/noaa-ala-wai-m3/m3.wk3` (675 formulas) and `fixtures/noaa-ala-wai-m21/m21tab.wk3` (8).

## EARS requirements

### Entry points and purity

1. `src/formula/decode.ts` SHALL export `decodeRpn(rpn, origin, dialect?)` with `type Dialect = "wk1" | "wk3"`. The dialect defaults to `"wk1"`. `translateFormula(rpn, origin, dialect?)` SHALL take the same parameter and chain decode, `toExcelAst` and `printExcel`. There is no separate WK3 decode module or result type.
2. `Origin` SHALL get an optional `sheet` (0 when absent) and the parser's `Sheet` an optional `sheetIndex` (set by `parseWk3`). The decoder SHALL return the `Expr` type of `src/formula/ast.ts` unchanged. No node type is added.
3. The code SHALL obey the purity rules of the formula-translator spec: no React, DOM, `node:*`, writer library, `src/cli` or `src/verify`; imports only `src/parser`; little-endian, bounds-checked reads; never throws; no token is dropped, guessed or coerced.
4. The WK1 path (`dialect` `"wk1"`) SHALL behave exactly as before, guarded by the existing WK1 tests. No existing WK1 test is edited to pass.
5. `verify` SHALL pick the dialect from `sheet.format` (`dialectOf` in `src/verify/recalc.ts`): `"wk3"` sheets use the WK3 table, all others the WK1 table.

### The WK3 table (`src/formula/opcodes-wk3.ts`)

6. The module SHALL export `WK3_OPCODES`, `WK3_OPCODE_TABLE` and `WK3_UNSUPPORTED_REFERENCES`. Token 0x00 SHALL be a 10-byte constant (`float80ToDouble`) giving a `number` node. IF the conversion is not exact, THEN the decoder SHALL add a `constant-precision` info diagnostic and keep the rounded double. A non-finite constant gives `non-finite-constant`.
7. Token 0x01 SHALL be a cell reference of 6 bytes: relbits u8, row u16, sheet u8, column u8. The coordinates are stored as they are, never as offsets. Relbits bit 0 set means the column is relative and bit 1 set means the row is relative (LibreOffice `ReadSRD`); `colAbs = !(bit 0)`, `rowAbs = !(bit 1)`. Bit 2 (sheet) is not used. Relbits bits above bit 2 SHALL give a `reserved-bits-set` warning. Gnumeric reads bits 0 and 1 the other way round; `m3.wk3` shows LibreOffice is right (evidence.md, "Relbits finding").
8. Token 0x02 SHALL be a range of 9 bytes: relbits u8, then two 4-byte addresses as in requirement 7. Bits 0 to 2 of relbits belong to the first corner and bits 3 to 5 to the second. Bits above bit 5 SHALL give `reserved-bits-set`.
9. Token 0x03 SHALL end the formula. Token 0x04 SHALL become a `paren` node.
10. Token 0x05 SHALL be a 16-bit packed small number, read with `unpackSmall`, exported from `src/parser/wk3.ts` and also used by `parseWk3`. It SHALL become `int` for an integer and `number` otherwise.
11. Token 0x06 SHALL be a string: Latin-1 bytes up to the first 0x00. A string with no 0x00 before the end SHALL give `truncated-stream`.
12. Tokens 0x07 to 0x0B (named range and error references) SHALL NOT be decoded. WHEN one is read, THEN the decoder SHALL stop with `reference-kind-unsupported` naming the token and offset, and nothing after it is read. The cell is `unverifiable` with the reason `decode-error`.
13. Operators: 0x0E negate, 0x0F add, 0x10 subtract, 0x11 multiply, 0x12 divide, 0x13 power, 0x14 equal, 0x15 not equal, 0x16 less or equal, 0x17 greater or equal, 0x18 less, 0x19 greater, 0x1A AND, 0x1B OR, 0x1C NOT, 0x1D unary plus, 0x1E concatenation. The earlier operand is the left one.
14. Function tokens 0x1F to 0x5A SHALL keep the WK1 opcode numbers, names and arities. The WK3 table SHALL hold every function of the WK1 `OPCODES`, each re-marked with the WK3 sources. `tests/unit/formula/opcodes-wk3.test.ts` SHALL check that the list equals the WK1 functions and that each is known to the evaluator (`FUNCTIONS` or `VOLATILE`). Every other number, including WK3-only functions, SHALL be absent.
15. IF a token byte is in neither the table nor `WK3_UNSUPPORTED_REFERENCES`, THEN the decoder SHALL stop with `unknown-opcode` and set `unknown` to the opcode and offset. The cell is `unverifiable` with the reason `unknown-opcode`.
16. Every table entry SHALL carry a `source` and a `status`. `confirmed` means the token appears in the bytes of a real fixture and in LO or GN (the nine in evidence.md). `candidate` means written references only; decoding it adds an `unconfirmed-opcode` warning. All functions are `candidate`: the real files use none.
17. Nesting past 256 levels, stack underflow, stack imbalance at the return token and a stream without a return token SHALL give the same codes as the WK1 dialect.

### Sheets and references

18. A reference or range corner is *local* when its sheet byte equals `origin.sheet`. Local references resolve to the same `Ref` shape as WK1.
19. WHEN a token holds a foreign reference, THEN the decoder SHALL stop with a `foreign-reference` error whose message names the other sheet by its Lotus letter (A, B, ..., AA) and the own sheet. It SHALL NOT follow the reference, guess a value or drop the token.
20. A formula with a foreign reference SHALL be `unverifiable` with the existing reason `wk3-formula-not-decoded`, via `wk3FormulaNotDecoded(detail)` in `src/verify/value.ts`; the message carries the decoder's text, so it names the other sheet by its letter. Without an argument the function keeps the message of reports made before F17. No new reason code SHALL be added. (The sheet-name record is not used in this message.)
21. A formula whose precedent is a formula with a foreign reference SHALL be `unverifiable` through the existing precedent rule of `recalc.ts`.
22. A row above 8191 SHALL give `reference-out-of-grid`. A column cannot exceed 255 (one byte).

### Verification

23. `verifyWorkbook` SHALL classify each WK3 sheet with the same recalculation, graph, evaluation, tolerance and classification code as WK1. `classify.ts` SHALL get the Excel text from `translateFormula` with the sheet's dialect.
24. A WK3 formula that decodes and evaluates SHALL be compared with the stored result. The stored result SHALL NOT be changed or rounded to make a cell match.
25. A WK3 formula that cannot be decoded or evaluated SHALL be `unverifiable` with a specific reason: `unknown-opcode`, `decode-error` (including `reference-kind-unsupported`, truncation, out of grid), `wk3-formula-not-decoded`, or the evaluator's existing reasons. A cell SHALL never be `matched` because it could not be checked.
26. The new diagnostic codes are `foreign-reference` and `reference-kind-unsupported` (`src/formula/diagnostics.ts`). A WK3 workbook SHALL have one result list per sheet.

### Evidence and fixtures

27. `fixtures/noaa-ala-wai-m3/m3.wk3` and `fixtures/noaa-ala-wai-m21/m21tab.wk3` SHALL be committed unchanged, one folder each, with a `LICENSE.txt` (source URL, author, license as found, redistribution decision, sha256) and a `fixtures/manifest.json` entry each. The license found is in evidence.md.
28. The decoder SHALL be checked against bytes of the real files decoded by hand (evidence.md; `tests/unit/formula/decode-wk3.test.ts`) and against every formula of both files (`tests/differential/verify/wk3-fixtures.test.ts`).
29. The report and README SHALL say what the real files did not cover: tokens and functions no fixture uses stay `candidate`.
30. The synthetic `wk3-sheets.wk3` SHALL hold a matched formula (Totals!C2), one that reads another sheet (D2, `wk3-formula-not-decoded`) and one with an unknown token (E2, `unknown-opcode`), written by `scripts/lib/fixture-specs.ts` (`WK3_SPEC`). `tests/unit/verify/workbook.test.ts` SHALL assert a WK3 cell is matched only when the engine reproduces the stored result.

### Acceptance numbers

31. Over the WK3 fixtures, every formula that decodes and evaluates SHALL be `matched`, and every mismatch SHALL be explained in evidence.md. One mismatch is accepted: `m21tab.wk3` V44 = `L44/C44`, because the file holds no C44 (evidence.md).
32. The before and after counts SHALL be recorded in evidence.md: `m3.wk3` 675 matched (484 exact, 191 within tolerance); `m21tab.wk3` 7 matched (4 exact, 3 within tolerance) and 1 mismatched. A shortfall SHALL NOT be closed by loosening the tolerance, adding a guessed opcode or removing a cell.
33. Test strategy (no network, no live model): unit tests on hand-decoded real bytes; property tests that the WK3 dialect never throws on arbitrary or mutated bytes and that generated trees round-trip through `tests/unit/helpers/rpn3-encode.ts`; a differential test that verifies every WK3 fixture from the manifest.

### Questions settled in evidence.md

- Token numbers used by the real files: nine, listed in evidence.md.
- Foreign, named or function tokens in the real files: none.
- Relbits: LibreOffice reading confirmed on `m3.wk3`.
- Text or error stored results, and the BOF version word: not shown by these files (evidence.md).
