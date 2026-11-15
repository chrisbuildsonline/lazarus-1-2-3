# Tasks: formula token decoder and translator

Red first: write each test and watch it fail before the code that makes it pass. Run `bun run test` and `bun run typecheck` after each task. Files go in the paths from design.md. No network at test time. Do not edit `fixtures/manifest.json` or the test walker to make a test pass. Never write an expected value by copying what the new code printed: take it from the fixture comments, the bytes, or a hand calculation.

## Evidence and foundations

- [x] 1. Evidence dump. Add `scripts/dump-rpn.ts` (run as `bun scripts/dump-rpn.ts`): for every wk1/wks fixture in the manifest, print address, cached value and the RPN bytes in hex for each formula cell. Run it and save the output as `.kiro/specs/formula-translator/evidence.md` (one section per fixture). From it, list every opcode byte seen, and which fixture and cell shows it. No decoding yet, so no circular check. (Req 18)
- [x] 2. Opcode table. Red: `tests/unit/formula/opcodes.test.ts`: opcodes unique; every entry has a non-empty `source`; `status` is `confirmed` or `candidate`; the nine entries confirmed in design.md (0x00 to 0x05, 0x09, 0x0B, 0x50) have the documented kind and operand shape; every function listed in requirement 17 has an entry. Green: `src/formula/opcodes.ts`. Fill each remaining opcode, arity (fixed or count byte) and Excel rule from `evidence.md`, LibreOffice `lotform.cxx` (fetch it, cite the URL in `source`) or the lotus-oracle lookup. Mark `confirmed` only with a fixture and a reference. Do not use memory as a source. (Req 17, 18)
- [x] 3. Red: add a case to `tests/unit/parser/index.test.ts` that `ByteReader` is exported from `src/parser/index.ts`. Green: add the export. Nothing else in `src/parser` changes. (Req 2, 4)
- [x] 4. Red then green: `src/formula/ast.ts` (types from design.md) and `src/formula/diagnostics.ts` with a `diag(code, severity, offset, message, opcode?)` helper and a `hexOpcode(n)` formatter. Test: the message helper renders `0x1F` for 31 and `0x0A` for 10, and includes the decimal offset. (Req 5, 9)

## Decoder, one failing test each

- [x] 5. Red: `decode-errors.test.ts`, first part: empty array gives `truncated-stream` at 0, `[0x03]` alone gives `stack-imbalance` (zero nodes), a stream with no return token gives `truncated-stream` at its end, bytes after the return token give `trailing-bytes` and still decode. Green: `src/formula/decode.ts` with the loop, the return token, and the result shape. (Req 8, 11, 40, 42 to 45)
- [x] 6. Red: `decode-operands.test.ts` for number and int tokens, with literal byte arrays: 0.5, 0, max double, int 0, -1, 32767, -32768, a cut double and a cut int give `truncated-stream` naming the token offset, a NaN pattern gives `non-finite-constant`. Green: number and int decoding. (Req 4, 12, 37)
- [x] 7. Red: string token cases: empty, text with `"`, a byte at 0x80 or above, no NUL gives `truncated-stream`. Green: Latin-1 loop without `TextDecoder`. (Req 12, 13)
- [x] 8. Red: `decode-refs.test.ts`: absolute ref, relative ref with positive and negative offsets, `0xBFFB` (column -5) and `0xBFFF` (row -1) from the KSBASE-style words, mixed flags per axis, the origin at A1, at IV8192. Green: reference decoding with the sign-extension rules. (Req 21, 22)
- [x] 9. Red: refs that resolve outside the grid on each of the four sides give `reference-out-of-grid` with the offset; wrong high bits give `reserved-bits-set` and still decode. Green: the grid and reserved-bit checks. (Req 23)
- [x] 10. Red: range token cases: absolute corners, relative corners, mixed flags, a cut range. Green: range decoding. (Req 12, 21, 22)
- [x] 11. Red: `decode-operators.test.ts` for the binary operators in the table: operand order for subtract and divide, each comparison, AND, OR, concatenation. Green: binary operator decoding. (Req 14)
- [x] 12. Red: unary negate, unary plus, NOT, and the parentheses marker (kept as a `paren` node). Green: unary and paren decoding. (Req 14, 15)
- [x] 13. Red: `decode-functions.test.ts` for fixed-arity functions (IF with 3, ROUND with 2, ABS, INT, SQRT, MOD, DATE, NPV, PMT, PV, FV, NA, ERR, TRUE, FALSE, PI, NOW, RAND, VLOOKUP, HLOOKUP): argument order, and stack underflow with one operand too few. Green: function decoding. Use only opcodes that task 2 recorded. (Req 16, 17, 41)
- [x] 14. Red: variable-arity functions (SUM, AVG, COUNT, MIN, MAX, CHOOSE) with count 0, 1, 2 and 255, a missing count byte, a count larger than the stack. Green: count-byte reading. (Req 16, 41)
- [x] 15. Red: unknown opcode gives `unknown-opcode` with the opcode and offset in the message and in `unknown`, nothing after it is read, and a candidate opcode gives `unconfirmed-opcode` once per opcode and still decodes. Green: unknown and candidate handling. (Req 18, 39)
- [x] 16. Red: truncation sweep. For a good formula built from literal bytes, cut it at every length from 0 to length-1: never throws, always `unverifiable`-shaped (error, `ast` null). Stack tests: two nodes at return gives `stack-imbalance` with the depth. Green: fix whatever fails. (Req 8, 40 to 42)
- [x] 17. Red: a chain of 257 nested negates gives `nesting-too-deep`; 256 decodes. Green: depth tracking in the decoder. (Req 20)

## Translation and printing

- [x] 18. Red: `print-excel.test.ts`, literals: `0.1`, `2`, `1E+100`, `1.5E-7`, a negative constant `-2.5`, `-0` as `0`, strings with `"` doubled, `constant-precision` for 17 digit constants. Green: `src/formula/print-excel.ts` literal printing. (Req 36, 37)
- [x] 19. Red: refs and ranges: `A1`, `$A$1`, `$A1`, `A$1`, `IV8192`, `A1:B2`, `$A$1:B2`. Green: reference printing with the column-name algorithm. (Req 33)
- [x] 20. Red: precedence: `neg(pow(2,2))` prints `-(2^2)` and `pow(neg(2),2)` prints `-2^2`; `a-(b-c)`, `(a-b)-c`, `a^(b^c)`, `(a^b)^c`, `a&b=c`, `(a=b)&c`, a `paren` node printed once. Green: precedence-driven parentheses. (Req 34, 35)
- [x] 21. Red: calls print as `NAME(a,b)` and `NAME()`. Green: call printing and the depth check. (Req 36)
- [ ] 22. Red: `excel-ast.test.ts`, renames: AVG to AVERAGE, COUNT to COUNTA, INT to TRUNC, others unchanged. Green: `src/formula/excel-ast.ts` rename table. (Req 24)
- [ ] 23. Red: PMT, PV and FV argument order and the `neg` wrapper, checked against hand-written expected trees and printed text such as `-PMT(B1,C1,A1)`. Green: reorder rules. (Req 25)
- [ ] 24. Red: CHOOSE gets `+1` on its index, VLOOKUP and HLOOKUP get `+1` on the offset and a trailing `TRUE()`, constants not folded. Green: offset rules. (Req 26)
- [ ] 25. Red: AND, OR and NOT operators become calls and the tree has none left; NA, TRUE, FALSE, PI, NOW, RAND become zero-argument calls; ERR gives `no-excel-equivalent` and no tree; a call with the wrong argument count gives `no-excel-equivalent` and does not index out of range. Green: those rules. (Req 27 to 29)
- [ ] 26. Red: `semantics-note` info diagnostics for INT, COUNT, MOD, PMT, PV, FV, CHOOSE, lookups, and for SUM, AVG, MIN and MAX only when an argument is a range; none for IF, ROUND, ABS, SQRT, DATE. Green: the notes. (Req 31)
- [ ] 27. Red: `translate.test.ts`: `status` rules (error gives unverifiable, volatile gives unverifiable with text kept, `semantics-note` alone stays ok), `excel` null on decode failure, `unknown` passed through, a string over 255 characters and text over 8192 give `excel-limit`. Green: `src/formula/translate.ts` with `isUnverifiable`. (Req 5 to 7, 29, 30, 38, 45)
- [ ] 28. Add `src/formula/index.ts` exporting the four functions and the types. Red then green: `tests/unit/formula/purity.test.ts`, adapted from `tests/unit/parser/purity.test.ts`: imports only inside `src/formula` or `../parser/`, and none of the forbidden APIs. (Req 1 to 3)

## Test helpers

- [ ] 29. Red: tests for `tests/unit/helpers/excel-parse.ts` with example inputs and expected trees, written by hand (precedence, left association, `$` refs, strings with `""`, nested calls, `TRUE()`), and rejection of malformed text with an error result. Green: the helper. It does not import `src/formula/print-excel.ts`. (Design: Test helpers)
- [ ] 30. Red then green: `tests/unit/helpers/rpn-encode.ts` (Lotus `Expr` to bytes, using the opcode table), with example tests that its output equals the literal byte arrays from task 6 to 14 for the same trees.

## Property tests

- [ ] 31. `tests/property/formula/formula.property.test.ts`: the `Expr` generators (Excel and Lotus forms) and the Excel round trip. (Req 36, Acceptance 4)
- [ ] 32. Same file: the Lotus round trip through `toExcelAst`, and encode then decode equality. (Req 14 to 16, 24 to 27)
- [ ] 33. Same file: arbitrary bytes and biased bytes never throw, results are well formed (requirements 6, 7, 9, 45). (Req 8, Acceptance 4)
- [ ] 34. Same file: mutated real fixture formulas never throw, and the deep nesting example returns `nesting-too-deep` without overflowing. (Req 8, 20)

## Differential test and acceptance

- [ ] 35. `tests/differential/formula/fixtures.test.ts`, following design.md steps 1 to 6: every wk1/wks fixture formula decodes or is flagged, the counts sum to the manifest, the golden table matches exactly, and our own output re-parses. Run it. Any real formula that comes back unverifiable is a finding: read the bytes, decide whether the table or the file is wrong, write it in a header comment as the parser's differential test does. Do not loosen a check. (Acceptance 1, 2)
- [ ] 36. Update the opcode table statuses: every opcode that appears in a real fixture and has a second source becomes `confirmed`. Record the outcome (decoded count, flagged count, per fixture) in a comment at the top of the differential test. Add evidence for any opcode or arity you changed to `.kiro/steering/lotus-format.md`. (Req 18)
- [ ] 37. Coverage for functions no real fixture uses (probably PMT, PV, FV, CHOOSE, lookups). Check `evidence.md` first. For each missing function, add a synthetic fixture to `scripts/lib/fixture-specs.ts` with its cached value worked out by hand (comment the arithmetic), regenerate with `bun scripts/gen-fixtures.ts`, and add its golden text to task 35's table. The opcode bytes come from the task 2 sources, not from the decoder. Existing fixtures stay byte-identical. If it cannot be done without a new opcode source, leave the function `candidate` and say so in the test header. (Req 17, 18)

## Docs and gate

- [ ] 38. Update `.kiro/steering/structure.md`: the `formula/` line says what is implemented (decoder, Excel translator, printer) and that the engine is later. Update the README only if it lists formula status. (Design: Layout)
- [ ] 39. Gate: `bun run typecheck` and `bun run test` both exit 0, and the differential test shows every wk1/wks fixture formula decoded or flagged with the counts equal to the manifest. (Acceptance 5)
