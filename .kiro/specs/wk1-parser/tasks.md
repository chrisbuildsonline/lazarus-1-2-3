# Tasks: WK1 and WKS record parser

Red first: write each test and watch it fail before the code that makes it pass. Run `bun run test` and `bun run typecheck` after each task. Files go in the paths from design.md. No network. Do not edit `fixtures/manifest.json` or the test walker to make a test pass.

## Foundations

- [x] 1. Red: `tests/unit/parser/address.test.ts`. Examples from requirement 32 (`A1`, `Z1`, `AA1`, `IV8192`), `parseA1` accepts `a1` and `IV8192`, rejects `""`, `A0`, `1A`, `A-1`, and the round trip over sample cells. Green: `src/parser/address.ts`. (Req 32)
- [x] 2. Red: `tests/unit/parser/sheet.test.ts`. `cellKey` is unique at the four u16 corners, `getCell` hit and miss, `cellsInRowMajorOrder` after inserting cells in a scrambled order. Green: `src/parser/sheet.ts` (types, `cellKey`, `getCell`, `cellsInRowMajorOrder`). (Req 30, 31)
- [x] 3. Red: `tests/unit/parser/reader.test.ts`. Every method returns `null` and leaves `pos` unchanged when it would pass `end`. A sub-reader cannot read past its own `end`. Works on a `subarray` with a non-zero `byteOffset`. Green: `src/parser/reader.ts`. (Req 4, 5)
- [x] 4. Red then green: `src/parser/diagnostics.ts` with a unit test for the cap: the 1001st diagnostic becomes one `diagnostics-truncated`, later ones are dropped. (Req 10)

## Records, one failing test each

- [x] 5. Red: `wk1-bof-eof.test.ts` with the cases listed in design.md (0x0404, 0x0406, 0x0405, 0x1234, no BOF, short BOF, no EOF, trailing bytes). Green: `parseWk1` record loop in `src/parser/wk1.ts`, BOF and EOF decoding, `Wk1ParseResult` and stats. (Req 1, 4, 11 to 17, 35)
- [x] 6. Red: `wk1-dimensions.test.ts`. Green: DIMENSIONS decoder. (Req 18)
- [x] 7. Red: `wk1-integer.test.ts`. Green: INTEGER decoder. (Req 19)
- [x] 8. Red: `wk1-number.test.ts` with exact-bit checks (0.1, -2.5, max double). Green: NUMBER decoder. (Req 20)
- [x] 9. Red: `wk1-label.test.ts` covering the five prefixes, an unknown prefix, empty label, high bytes, no NUL, short body. Green: LABEL decoder with the manual Latin-1 loop. (Req 21 to 23)
- [x] 10. Red: `wk1-formula.test.ts` covering exact cached double, exact RPN bytes, RPN is a copy, `rpnLen` 0, overrun gives `short-record`, no RPN decoding. Green: FORMULA decoder. (Req 3, 24 to 26)
- [x] 11. Red: `wk1-skip.test.ts` for unknown opcodes, per-record counts, one info diagnostic per distinct opcode, parsing continues, 0xFFFF length gives `truncated-record`. Green: skip path. (Req 7, 28, 29)
- [x] 12. Red: tests for `duplicate-cell` (stats count both, map keeps the later) and `address-out-of-range` (col 256, row 8192 kept with a warning). Green: the two checks. (Req 27, 34)
- [ ] 13. Red: `wk1-robustness.test.ts`: empty, 1 to 3 bytes, header only, all 0xFF, all 0x00 (terminates, diagnostics capped), `subarray` input with non-zero offset gives the same result as a copy, input bytes unchanged after parse. Green: fix whatever fails. (Req 3, 5 to 10)
- [ ] 14. Add `src/parser/index.ts` exporting `parseWk1`, types, `a1`, `parseA1`, `cellKey`, `getCell`, `cellsInRowMajorOrder`. Check that nothing under `src/parser` imports `node:*`, `react` or the DOM (a grep in this task, plus step 20). (Req 2)

## Property tests

- [ ] 15. `tests/property/parser/wk1.property.test.ts`: arbitrary bytes never throw and results are well formed. (Req 6, Acceptance 4)
- [ ] 16. Same file: framed garbage (valid frames, random opcodes, bodies and lengths), checking `bytesRead` and diagnostic offsets stay in range. (Req 5, 7)
- [ ] 17. Same file: mutated fixtures. For every wk1/wks entry of the manifest, apply random byte flips, truncation, insertion and deletion. Never throws. (Req 6, Acceptance 4)
- [ ] 18. Same file: writer round trip with `writeWk1` (exact doubles, exact RPN bytes, label text and prefix), a NaN and infinity example test, and the `parseA1(a1(c, r))` property with the test helper's `a1`. (Req 19 to 24, 32, 33)

## Differential test and acceptance

- [ ] 19. `tests/differential/parser/wk1-manifest.test.ts` following design.md steps 1 to 7, for every wk1/wks manifest entry, plus a guard that at least one such entry exists. Run it. Any failure on a real file is a finding: read the bytes, decide whether the parser or the manifest is wrong, and write it down in the task notes. Do not loosen a check. (Acceptance 1 to 3)
- [ ] 20. Record the skipped opcodes and counts that the real fixtures produce (the Quattro Pro extras) in a short comment at the top of the differential test, with the file names. If any `unknown-version` warning shows up on a fixture, add the evidence to `.kiro/steering/lotus-format.md`. (Req 28)
- [ ] 21. Run in bun and in a worker context: add a test that imports `src/parser` with no Node globals available beyond what a worker has. Cheapest form is a check (test or script) that the import graph of `src/parser` has no `node:*`, `react` or `document` references. (Req 2, 3)

## Docs and gate

- [ ] 22. Update `.kiro/steering/structure.md`: `parser/` line now states "WKS/WK1 reader implemented (parseWk1); DBF and WK3 later". Update README only if it lists parser status. (Design: Layout)
- [ ] 23. Gate: `bun run typecheck` and `bun run test` both exit 0, and the differential test shows every wk1/wks manifest fixture parsed with counts equal to the manifest. (Acceptance 5)
