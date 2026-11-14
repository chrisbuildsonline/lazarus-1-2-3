# Requirements: formula token decoder and translator

Goal: a pure module in `src/formula` that turns the raw RPN bytes of a Lotus FORMULA cell, plus the cell's own address, into a typed AST and into Excel formula text. It builds on the `rpn` bytes that `parseWk1` keeps on `formula` cells. It does not recalculate, compare with cached values, write XLSX, or run a model. Those are later features.

Terms: a *token* is one opcode byte plus its operand bytes. *RPN* is postfix: operands push, operators and functions pop. The *origin* is the column and row (0-based) of the formula cell. The *Lotus AST* is what the decoder returns. The *Excel AST* is the Lotus AST after renaming, argument reordering and operator rewriting (requirements 24 to 31). *Offset* in a diagnostic is the byte index into the `rpn` array, not into the file.

## EARS requirements

### Entry points and purity

1. The module SHALL export `decodeRpn(rpn: Uint8Array, origin: Origin): DecodeResult`, `toExcelAst(ast: Expr): TranslateResult`, `printExcel(ast: Expr): PrintResult` and `translateFormula(rpn: Uint8Array, origin: Origin): FormulaTranslation`, which chains the three.
2. The module SHALL be a pure function of its inputs. It SHALL NOT import React, the DOM, `node:*` modules, the XLSX writer library, `src/cli` or `src/verify`, and SHALL NOT use clocks, randomness, the network or `TextDecoder`. It MAY import `src/parser` only.
3. The module SHALL give the same result in a Web Worker and in bun, and SHALL NOT mutate or keep a reference to the input array.
4. All multi-byte integers and doubles SHALL be read little-endian through a bounds-checked reader. Every read SHALL be checked against the end of the stream before it happens.

### Result shape and the unverifiable rule

5. `FormulaTranslation` SHALL hold `status` (`"ok"` or `"unverifiable"`), `ast` (the Lotus AST or `null`), `excel` (formula text without a leading `=`, or `null`) and `diagnostics`.
6. WHEN `status` is `"ok"`, `excel` SHALL be non-null and `diagnostics` SHALL hold no `error`.
7. IF any `error` diagnostic is raised, THEN `status` SHALL be `"unverifiable"`.
8. The module SHALL NOT throw for any input: not for an unknown opcode, a truncated stream, a stack imbalance, an empty array, arbitrary bytes, or an out-of-range origin. It SHALL return a result with diagnostics.
9. A diagnostic SHALL carry `severity`, `code`, `offset`, `message`, and `opcode` when a token is involved. The `message` SHALL name the opcode as `0x%02X` and the offset as a decimal number.
10. The module SHALL NOT silently drop, guess or coerce a token. Every token read is either in the AST or covered by a diagnostic.

### Decoding the token stream

11. The decoder SHALL walk the stream from offset 0, keep an operand stack, and stop at the return token (end of formula).
12. WHEN an operand token is read, the decoder SHALL push one node: an 8-byte IEEE 754 double as `number`, a 2-byte signed integer as `int`, a null-terminated string as `string`, a single cell reference as `ref`, a range as `range`. `number` and `int` SHALL stay distinct node types.
13. A `string` token's bytes SHALL be decoded as Latin-1, one character per byte, up to the first 0x00. IF the stream ends before that 0x00, THEN the decoder SHALL report `truncated-stream`.
14. WHEN a unary operator token is read (negate, plus, NOT), the decoder SHALL pop one operand and push one node. WHEN a binary operator token is read (add, subtract, multiply, divide, power, the six comparisons, AND, OR, concatenation), it SHALL pop two operands and push one node, with the earlier-pushed operand on the left.
15. WHEN the parentheses marker is read, the decoder SHALL pop one node and push a `paren` node around it. The marker SHALL NOT be dropped, because it records what the author typed.
16. WHEN a function token is read, the decoder SHALL look up its argument count in the opcode table. A fixed-count function pops exactly that many arguments. A variable-count function reads one count byte after the opcode and pops that many. The arguments SHALL keep their written order in `args`.
17. The opcode table SHALL include these functions: SUM, AVG, MIN, MAX, COUNT, IF, ROUND, ABS, INT, SQRT, MOD, DATE, NPV, PMT, PV, FV, CHOOSE, VLOOKUP, HLOOKUP, NA, ERR, TRUE, FALSE, PI, and the volatile NOW and RAND. It SHALL gain another function only when a fixture or a lotus-oracle lookup shows the opcode in use.
18. Every opcode table entry SHALL carry a `source` note and a `status`. `confirmed` means the opcode appears in a real fixture's bytes and in a written reference. `candidate` means one source only. WHEN a `candidate` opcode is decoded, the decoder SHALL add an `unconfirmed-opcode` warning diagnostic carrying the opcode. It SHALL NOT change `status` to `unverifiable` for that reason alone.
19. Operator precedence SHALL NOT be used while decoding. The RPN order already fixes the tree.
20. The decoder SHALL measure AST depth while it builds nodes. IF the depth would pass 256, THEN it SHALL stop with a `nesting-too-deep` error, so that no later recursive step can overflow the stack.

### Cell references

21. A reference word pair SHALL be read as column word then row word. WHEN bit 15 of a word is set, that coordinate is relative; otherwise it is absolute.
22. An absolute column SHALL be the low 8 bits of its word and an absolute row the low 13 bits. A relative column SHALL be the low 8 bits as a signed offset, and a relative row the low 13 bits as a signed offset, both added to the origin. The `ref` node SHALL store the resolved 0-based `col` and `row` plus `colAbs` and `rowAbs`, so that no information is lost.
23. IF a resolved column is below 0 or above 255, or a resolved row is below 0 or above 8191, THEN the decoder SHALL add a `reference-out-of-grid` error with the offset. It SHALL NOT wrap around. IF the unused high bits of a word do not match its mode (zero for absolute, the sign extension for relative), THEN it SHALL add a `reserved-bits-set` warning and continue.

### Translation to the Excel AST

24. `toExcelAst` SHALL rename Lotus functions to Excel names: `AVG` to `AVERAGE`, `COUNT` to `COUNTA`, `INT` to `TRUNC`. Other listed functions SHALL keep their name.
25. `toExcelAst` SHALL reorder arguments where Lotus and Excel differ: Lotus `@PMT(principal, rate, term)` becomes `-PMT(rate, term, principal)`, `@PV(payment, rate, term)` becomes `-PV(rate, term, payment)`, and `@FV(payment, rate, term)` becomes `-FV(rate, term, payment)`. The leading minus is a `unary neg` node, because Lotus returns the positive amount and Excel returns the cash-flow sign.
26. `toExcelAst` SHALL turn Lotus zero-based offsets into Excel one-based ones: `@CHOOSE(i, a, b)` becomes `CHOOSE(i+1, a, b)`, and `@VLOOKUP(x, r, k)` and `@HLOOKUP(x, r, k)` become `VLOOKUP(x, r, k+1, TRUE())` and `HLOOKUP(x, r, k+1, TRUE())`. The `+1` SHALL be an explicit `binary add` node and constants SHALL NOT be folded.
27. `toExcelAst` SHALL turn the AND, OR and NOT operator tokens into the calls `AND(a, b)`, `OR(a, b)` and `NOT(a)`. After translation the tree SHALL hold no `and`, `or` or `not` operator nodes.
28. `toExcelAst` SHALL turn the functions NA, TRUE, FALSE, PI, NOW and RAND into zero-argument calls, which print as `NA()`, `TRUE()`, `FALSE()`, `PI()`, `NOW()` and `RAND()`.
29. WHEN a function has no Excel equivalent (ERR), `toExcelAst` SHALL add a `no-excel-equivalent` error and return no tree. `translateFormula` SHALL then set `status` to `"unverifiable"` and `excel` to `null`, keeping the Lotus `ast`.
30. WHEN a function is volatile (NOW, RAND), `translateFormula` SHALL still emit its Excel text, add a `volatile-function` warning, and set `status` to `"unverifiable"`.
31. WHEN a translation changes meaning or may differ from Lotus (INT to TRUNC, COUNT to COUNTA, MOD, the PMT, PV and FV sign flip, CHOOSE and lookup offsets, AVG, SUM, MIN and MAX over ranges that hold labels), `toExcelAst` SHALL add a `semantics-note` info diagnostic naming the function and the difference. `status` stays `"ok"`. The later verify stage is what proves or refutes the value.

### Printing Excel text

32. `printExcel` SHALL print a Lotus-free tree (requirement 27) as Excel text with no leading `=`.
33. A reference SHALL print as A1 text with a `$` before the column letters when `colAbs` is true and before the row number when `rowAbs` is true. A range SHALL print as `corner1:corner2`, each corner with its own `$` flags.
34. Operators SHALL print with Excel's precedence, from tightest to loosest: unary minus and plus; `^`; `*` and `/`; `+` and `-`; `&`; the six comparisons. The printer SHALL decide parentheses from the tree, not from the input text. A child SHALL be parenthesised when its precedence is lower than its parent's, and a right child of equal precedence SHALL be parenthesised, because every Excel binary operator is left-associative. In particular Lotus `-(a^b)` SHALL NOT print as `-a^b`, which Excel reads as `(-a)^b`.
35. A `paren` node SHALL print as its inner expression in parentheses. The printer SHALL NOT add a second pair when the structure already needs one and a `paren` node supplies it.
36. Numbers SHALL print as the shortest decimal text that reads back to the same double, with an upper-case `E` for exponents. Strings SHALL print in double quotes with each `"` doubled. Function arguments SHALL be separated by `,`.
37. IF a number constant is NaN or infinite, THEN the decoder SHALL add a `non-finite-constant` error. IF a number constant needs more than 15 significant digits, THEN the printer SHALL add a `constant-precision` info diagnostic, because Excel reads 15.

### Excel limits

38. IF a printed string literal exceeds 255 characters, or the formula text exceeds 8192 characters, THEN `translateFormula` SHALL add an `excel-limit` error and set `status` to `"unverifiable"`.

### Truncated, unknown and unbalanced streams

39. IF the opcode is not in the opcode table, THEN the decoder SHALL stop at it, because operand length is unknown, and add an `unknown-opcode` error with the opcode and offset. The result SHALL record `{ opcode, offset }` so a later feature can queue it for human review. The decoder SHALL NOT guess an operand length.
40. IF the stream ends inside a token's operand bytes, or ends before a return token, THEN the decoder SHALL add a `truncated-stream` error with the offset of the incomplete token (or of the end of the stream when the return token is missing).
41. IF a token needs more operands than the stack holds, THEN the decoder SHALL add a `stack-underflow` error with the token's opcode and offset.
42. IF the stack does not hold exactly one node when the return token is read, THEN the decoder SHALL add a `stack-imbalance` error with the depth found and the offset of the return token.
43. IF bytes follow the return token, THEN the decoder SHALL add a `trailing-bytes` info diagnostic with the count, and the formula SHALL still decode.
44. IF the `rpn` array is empty, THEN the decoder SHALL report `truncated-stream` at offset 0.
45. WHEN any error is raised, `ast` SHALL be `null` and `excel` SHALL be `null`, unless requirement 29 or 30 says otherwise.

## Acceptance

1. Every formula cell in every `wk1` and `wks` entry of `fixtures/manifest.json` either yields `status: "ok"` with Excel text, or `status: "unverifiable"` with at least one `error` diagnostic whose message names an opcode and offset. The count of the two outcomes sums to the manifest `formulas` total, and the test prints the split per fixture.
2. For the synthetic fixtures and for the real formulas listed in the differential test's golden table, the Excel text equals the hand-written expected text exactly.
3. The unit tests pass, one per opcode table entry.
4. The property tests pass: printing then re-parsing gives the same tree, and arbitrary bytes never throw.
5. `bun run typecheck` and `bun run test` exit 0.

## Out of scope

Recalculating, comparing with cached values (the verify feature), writing XLSX, the Lotus-syntax printer for the report, @functions outside requirement 17 unless a fixture needs them, WK3 token streams, named ranges, 3D references, array formulas, macros, the approval queue for unknown opcodes (this feature only hands it `{ opcode, offset }`), any use of a model.

## Open questions to settle in review

- Lotus `@INT` truncates toward zero and Excel `INT` floors, so this spec emits `TRUNC`. No fixture formula uses a negative operand, so nothing in the corpus confirms it yet. lotus-format.md asks for a differential test first. The verify feature supplies it.
- `COUNT` to `COUNTA` and the text-in-range behaviour of SUM, AVG, MIN and MAX rest on how Lotus treats labels. Treated as `semantics-note` until the engine differential shows otherwise.
- Lotus comparisons and `@TRUE` yield the numbers 1 and 0. Excel yields booleans. This spec prints `TRUE()` and `FALSE()`. Whether the XLSX stage should print `1` and `0` is a decision for that feature.
- Relative references that leave the grid are reported, not wrapped. Real Lotus may wrap modulo 256 columns and 8192 rows. Needs a fixture or lotus-oracle evidence before wrapping is allowed.
- Excel reads 15 significant digits of a numeric literal. A constant with more digits can change in Excel. This spec reports it (requirement 37) and does not work around it.
