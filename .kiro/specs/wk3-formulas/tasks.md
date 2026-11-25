# Tasks: WK3 formulas (F17)

Red first: write each test and watch it fail before the code that makes it pass. Run `bun run test` and `bun run typecheck` after each task, `bun run build` and `CI=1 bun run e2e` after each task that touches `src/ui`, `src/workers` or `e2e/`. Expected values come from `fixtures/manifest.json`, the independent walker `tests/unit/helpers/wk3-scan.ts`, bytes decoded by hand, or `evidence.md`, never from what the code under test printed. Requirement numbers are from requirements.md. Built in commits 1829443, 48212fd and f08559c. Where a task part was dropped, the task says so in one line.

## Evidence and fixtures

- [x] 1. Evidence: `.kiro/specs/wk3-formulas/evidence.md` (sources, license found, token inventory, hand-decoded formulas, relbits finding, before and after, every unmatched cell). Dropped: the dump script `scripts/dump-rpn-wk3.ts` was not written. (Req 27, 28, 29)
- [x] 2. Fixtures: `fixtures/noaa-ala-wai-m3/m3.wk3` and `fixtures/noaa-ala-wai-m21/m21tab.wk3`, one folder each, with `LICENSE.txt` and manifest entries. Differs from the plan: two folders, not one `noaa-g02887/`. (Req 27)

## Decoder

- [x] 3. Shared packing function: `unpackSmall` is exported from `src/parser/wk3.ts` and `src/parser/index.ts`, used by `parseWk3` and by the decoder. Dropped: no `src/parser/wk3-small.ts` and no `wk3-small.test.ts`; `decode-wk3.test.ts` checks the packed values. (Req 10)
- [x] 4. The WK3 table: `src/formula/opcodes-wk3.ts` (`WK3_OPCODES`, `WK3_OPCODE_TABLE`, `WK3_UNSUPPORTED_REFERENCES`), tested in `tests/unit/formula/opcodes-wk3.test.ts`. The table holds all WK1 functions, not only the ones the evaluator implements; the test checks the evaluator knows each. (Req 13, 14, 16)
- [x] 5. Operands: constant, small number, string, parentheses in `decodeRpn(..., "wk3")` (`src/formula/decode.ts`), tested in `decode-wk3.test.ts`. Dropped: no separate operands test file; no test for an inexact constant, a string with no NUL, an empty string or a bare return token. (Req 6, 9, 10, 11, 17)
- [x] 6. References and sheets: relbits, range corners, `foreign-reference` (reference and second corner of a range), row past the grid. Dropped: no test for relbits 3, for high relbits bits, or for a foreign first corner. (Req 7, 8, 18, 19, 22)
- [x] 7. Operators, functions and errors: all operators, SUM with a count byte, IF, tokens 0x07 to 0x0B (`reference-kind-unsupported`), an unknown token, a cut stream. Dropped: no tests for count bytes 0, 2 and 255, stack underflow, the unconfirmed-opcode warning or depth 257; `wk3.property.test.ts` covers cut and mutated bytes. (Req 12 to 17)
- [x] 8. Real bytes: m21tab T44 and U45 and m3 U9 decoded by hand in `decode-wk3.test.ts`, every formula of both files in `tests/differential/verify/wk3-fixtures.test.ts`; nine tokens `confirmed` (`SEEN`), pinned in `opcodes-wk3.test.ts`. Dropped: no real function or string group exists in the files, so none is tested. (Req 16, 28, 29)
- [x] 9. Property tests: `tests/property/formula/wk3.property.test.ts` (never throws, round trip through `tests/unit/helpers/rpn3-encode.ts`, foreign sheet always refused). Dropped: no `wk1-unchanged.property.test.ts`; the WK1 path is guarded by the existing WK1 tests and one WK1 case in `decode-wk3.test.ts`. (Req 3, 4, 17, 33)
- [x] 10. Translation: `translateFormula(rpn, origin, dialect)` in `src/formula/translate.ts`. Dropped: no `translate-wk3.ts` and no `translate-wk3.test.ts`; the Excel text of a WK3 formula is asserted in `workbook.test.ts` (`A1+B1+C1`). (Req 1)

## Verification

- [x] 11. Wire the engine: `dialectOf` in `src/verify/recalc.ts`, `classify.ts` passes the dialect, `workbook.ts` has no WK3 special case; `tests/unit/verify/workbook.test.ts` updated (matched, mismatched, foreign reference, unknown token, generated sheets, values unchanged). Dropped: no `recalc-wk3.test.ts`, no injected throwing decoders and no `wk3` context parameter (the dialect comes from `sheet.format`). (Req 5, 23 to 26)
- [x] 12. Foreign reference message: `wk3FormulaNotDecoded(detail?)` in `src/verify/value.ts`, used in `recalc.ts`; `workbook.test.ts` asserts the message names sheet B. Dropped: the sheet is named by its letter, not by the sheet-name record. (Req 20, 21)
- [x] 13. Synthetic fixture: `WK3_SPEC` in `scripts/lib/fixture-specs.ts` holds C2 (matched), D2 (foreign reference) and E2 (unknown token 0x63), with `fixtures/wk3-sheets/wk3-sheets.wk3` regenerated. Dropped: no new token encoders in `scripts/lib/wk3-writer.ts`; the RPN bytes are literal arrays in the spec. (Req 30)
- [x] 14. Differential test: `tests/differential/verify/wk3-fixtures.test.ts` (named for the plan's `wk3-counts.test.ts`). Before and after counts and every unmatched cell are in evidence.md. The zero-mismatch rule became "every mismatch is explained": `m21tab.wk3` V44 is accepted. (Req 31, 32, 33)

## Outputs and docs

- [x] 15. XLSX, report, CLI, app. `plan.ts` writes a decoded WK3 formula as Excel text and gives `wk3-formula-not-translated` only to a formula reading another sheet; report wording, CLI `--verify`, `copy.ts` limit line and the WK3 e2e specs are updated; full e2e passed (68). Dropped: no separate lotus-oracle test for `m21tab` (the existing MCP test passes unchanged). (Req 27 of the first plan)
- [ ] 16. Docs and gate. Done in this pass: evidence.md, requirements, design, tasks, and the steering files `structure.md`, `product.md` and `lotus-format.md`. Open: `docs/devpost.md`, `tech.md` if needed, the `wk3-formulas` entry in the README "Kiro" spec list, and the final gate (`bun run typecheck`, `bun run test`, `bun run build`, `CI=1 bun run e2e`). Gate run, left unticked: typecheck, build, e2e (68 passed) and the check:* scripts pass, but `bun run test` has 1 failure, `tests/unit/ui/css-tokens.test.ts` "styles every class the components render". It belongs to the in-progress seance-visuals edits to `Grid.tsx`, `ProofBar.tsx` and `TotalsSurface.tsx`, not to this spec (175 files, 2001 tests were green before those edits). Tick once that suite is green again and the open docs items above are done.
