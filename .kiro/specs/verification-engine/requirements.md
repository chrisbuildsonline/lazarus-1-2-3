# Requirements: verification engine

Goal: a pure module in `src/verify` that recalculates every formula cell of a parsed WK1/WKS sheet over the Lotus AST from `src/formula`, compares each result with the double the file cached, and gives every formula cell one of three statuses: matched, mismatched or unverifiable. It runs in a Web Worker through `src/workers`, and the same core runs in Node for tests and the CLI. It does not write XLSX, build the in-app report UI, parse DBF or WK3, or call a model.

Terms:

- A *formula cell* is a `formula` cell in the parser's `Sheet`. Its *cached value* is the double the file stored. Its *recalculated value* is what the engine computes.
- A *value* is one of: number, string, ERR, NA.
- A *precedent* of a formula is a cell its AST refers to, by single reference or inside a range.
- *Natural order* means a formula is evaluated only after every formula it depends on.
- An *undocumented case* is behaviour that none of the sources in `design/refs/lotus-semantics/refs.md` defines. The engine does not guess it. The cell becomes unverifiable with reason `undocumented-semantics` and a rule id from design.md.
- A *rule id* (`S01`, `U03` and so on) names a row of the semantic rule tables in design.md. Each row cites its sources by URL.

## EARS requirements

### Entry points, purity and determinism

1. The module SHALL export `verifySheet(sheet: Sheet): SheetVerification` and `verifyBytes(bytes: Uint8Array): VerifyBytesResult`, where `verifyBytes` runs `parseWk1` and then `verifySheet`, and returns the parser diagnostics next to the verification.
2. The module SHALL be a pure function of its inputs. It SHALL import only `src/parser`, `src/formula` and its own files. It SHALL NOT import React, the DOM, `node:*` modules, the XLSX writer library, `src/cli`, `src/workers` or `src/ui`, and SHALL NOT use clocks, `Date`, `performance`, randomness, `TextDecoder` or the network.
3. The module SHALL give the same result in a Web Worker, in bun and in Node. It SHALL NOT mutate the `Sheet` it is given or keep a reference to it after returning.
4. The module SHALL NOT throw for any `Sheet` or any bytes: not for malformed formulas, cyclic references, huge ranges, deep chains or non-finite numbers. It SHALL return a result.
5. The same input SHALL give a deeply equal output, and the output SHALL NOT depend on the insertion order of `sheet.cells`, so file record order never changes a result.
6. No recursion SHALL have a depth that depends on the sheet: not on the number of cells, the length of a dependency chain or the area of a range. Recursion MAY follow the AST, whose depth is at most `MAX_DEPTH` (256) from the decoder. IF a hand-built AST is deeper, THEN the cell SHALL be unverifiable with reason `decode-error`.

### Web Worker

7. `src/workers/verify-protocol.ts` SHALL export the request and response types and `handleVerifyRequest(request): VerifyResponse`, a pure function that calls `verifyBytes` and runs in Node without a worker.
8. `src/workers/verify.worker.ts` SHALL only install the handler on the worker scope. It SHALL hold no verification logic.
9. Messages SHALL carry only structured-clone data: no functions, no class instances, no `Map`. A request SHALL carry the file bytes as an `ArrayBuffer` and an integer `id`. A response SHALL carry the same `id`.
10. Neither `src/workers` nor `src/verify` SHALL call `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon` or `importScripts`. File contents and values derived from them SHALL NOT leave the page.
11. IF a request is malformed, THEN the handler SHALL answer with an `error` response that has the same `id` when one is readable. IF the core raises an unexpected exception, THEN the handler SHALL answer with an `error` response and the message. It SHALL NOT drop the request silently.

### Result shape

12. `SheetVerification` SHALL hold `name`, `format`, `tolerance`, `cells` and `totals`. `cells` SHALL be a list of `CellResult`. v1 produces one sheet per file.
13. The module SHALL produce exactly one `CellResult` for each formula cell and none for other cell kinds. The list SHALL be in row-major order.
14. A `CellResult` SHALL hold `address` (A1 text), `col`, `row`, `status`, `cached`, `recalculated`, `reason`, `formula` (Excel text from `translateFormula`, or null) and `candidateOpcodes`. A mismatched result SHALL also hold `inputs`.
15. `status` SHALL be exactly one of `matched`, `mismatched`, `unverifiable`.
16. `matched` SHALL mean both values exist and are equal within the tolerance (requirements 26 to 28). `mismatched` SHALL mean both values exist and differ. `unverifiable` SHALL mean the engine cannot prove either.
17. `reason` SHALL be `{ code, rule?, message }` with `code` from one closed set: `exact`, `within-tolerance` (matched); `value-differs` (mismatched); `unknown-opcode`, `decode-error`, `unsupported-function`, `volatile-function`, `circular-reference`, `depends-on-unverifiable`, `string-result`, `cached-not-a-number`, `undocumented-semantics` (unverifiable). `rule` SHALL carry the design.md rule id when the cause is a rule.
18. `reason.message` SHALL be plain language for a non-engineer, SHALL name cell addresses where it refers to other cells, and SHALL NOT contain stack or internal type names. For an opcode problem it SHALL include the opcode as `0x%02X` and the offset.
19. `cached` SHALL be the stored double, shown as a value (requirement 22). The module SHALL NOT round, edit, replace or "fix" it, and SHALL NOT change the tolerance or any rule to make a cell match.
20. `totals` SHALL hold `formulas`, `matched`, `mismatched`, `unverifiable`, `exact` (matched with reason `exact`), `withinTolerance`, and `byReason` (a count per reason code). `matched + mismatched + unverifiable` SHALL equal `formulas`, and `formulas` SHALL equal the number of formula cells in the sheet.
21. The module SHALL NOT call a model. No number in the result SHALL come from anywhere except the parser and this engine (ai-boundaries.md).

### Cached values

22. A cached or stored double of `+Infinity` SHALL read as ERR, and `-Infinity` as NA (rule S27). The same reading SHALL apply to INTEGER and NUMBER cells used as inputs. IF an input cell holds NaN, THEN a formula that needs it SHALL be unverifiable (rule `U12`).
23. IF the cached double is NaN, THEN the cell SHALL be unverifiable with reason `cached-not-a-number`. The recalculated value SHALL still be computed and reported when the engine can compute it.
24. Comparison by kind: number against number uses the tolerance; ERR matches only cached ERR; NA matches only cached NA. A number against ERR or NA, or ERR against NA, SHALL be `mismatched`.
25. IF the recalculated value is a string, THEN the cell SHALL be unverifiable with reason `string-result`, because the parser does not read the cached text of a string formula (open question 4).

### Tolerance

26. The tolerance SHALL be defined in exactly one place, `src/verify/tolerance.ts`, as one exported constant `TOLERANCE` and one function `withinTolerance(a, b)`. No other file in `src/` SHALL contain a numeric comparison tolerance, an `epsilon` or a call to `Number.EPSILON`.
27. Two finite doubles SHALL be equal within tolerance when `|a - b| <= max(TOLERANCE.relative * max(|a|, |b|), TOLERANCE.absolute)`. Bit-identical doubles (`Object.is`, with `-0` equal to `0`) SHALL always be equal.
28. WHEN the two doubles are identical, the reason SHALL be `exact`. WHEN they are equal only by tolerance, the reason SHALL be `within-tolerance` and the message SHALL give the relative difference.
29. `SheetVerification.tolerance` SHALL copy `TOLERANCE`, so that the report can state it.

### Dependencies and order

30. The module SHALL build a static dependency graph from the AST: every reference and every cell inside every range counts, in every branch of IF and CHOOSE, whether or not the branch is taken.
31. The module SHALL evaluate formula cells in natural order (rule S26), by an order that depends only on cell addresses and references. The file order and the insertion order of `sheet.cells` SHALL NOT matter.
32. The module SHALL build and walk the graph iteratively (no recursion on chain length), and SHALL expand a range against the formula cells that exist in it, so a range of 256 x 8192 cells over a sparse sheet costs no more than the number of cells in the sheet.
33. IF formula cells form a cycle, including a cell that refers to itself, THEN every cell in the cycle SHALL be unverifiable with reason `circular-reference`, and the message SHALL name the cells of the cycle (the first 8, then a count).
34. IF a formula needs the value of a precedent that is unverifiable, THEN it SHALL be unverifiable with reason `depends-on-unverifiable`, naming the first such precedent and its reason. A formula whose result does not need that value SHALL NOT be affected: COUNT (requirement 49), the untaken branch of IF (requirement 46) and the unchosen arguments of CHOOSE (requirement 55).
35. IF a precedent is mismatched, THEN dependents SHALL use the precedent's recalculated value, as a real recalculation does. The `inputs` of a mismatched dependent SHALL show each direct precedent's recalculated and cached value, so a reader can see where the first difference began.

### Reading cells

36. WHEN a formula refers to an INTEGER or NUMBER cell, the value SHALL be that number (requirement 22 for infinities).
37. WHEN a formula refers to a formula cell, the value SHALL be its recalculated value, which exists by natural order, or its unverifiable state.
38. WHEN a formula refers to a label cell inside an arithmetic operator, a function that takes a number, or a list function, the value SHALL be 0 (rule S01).
39. WHEN a single reference names an empty cell, the value SHALL be 0. WHEN a range includes empty cells, a list function SHALL ignore them (rule S01). Whether a cell is empty SHALL depend only on whether the sheet holds a cell there, not on any value.
40. IF a label or an empty cell is an operand of a comparison, or a label is the whole result of a formula, or an operand is a string, THEN the cell SHALL be unverifiable with reason `undocumented-semantics` and rule `U01` or `U02`.
41. WHEN a range appears anywhere except as an argument of SUM, AVG, COUNT, MIN, MAX, STD, as the second argument of NPV, VLOOKUP or HLOOKUP, the cell SHALL be unverifiable (rule `U10`). The two corners of a range SHALL be normalised to min and max before use.

### Operators, errors and logic

42. The engine SHALL evaluate add, subtract, multiply, divide, power, negate and unary plus on doubles (rule S13). Parentheses SHALL change nothing.
43. IF a result is not finite, THEN it SHALL be ERR, including division by zero and overflow (rule S13). IF the power of zero to zero is evaluated, THEN the cell SHALL be unverifiable (rule `U04`).
44. WHEN an operand is ERR or NA, the result SHALL be that ERR or NA, and an operand error SHALL win over the operation's own ERR (rule S12). IF operands include both ERR and NA, THEN the cell SHALL be unverifiable (rule `U08`).
45. Comparisons SHALL yield 1 or 0 using exact IEEE comparison. AND, OR and NOT SHALL yield 1 or 0, treating any nonzero number as true (rule S14).
46. WHEN IF is evaluated, only the condition and the chosen branch SHALL contribute to the value and to error propagation (rule S15). A nonzero condition SHALL choose the second argument.
47. The string concatenation operator and any string operand SHALL make the cell unverifiable (rule `U01`).

### Functions

48. SUM SHALL add the items of its list. Labels count as 0, empty cells in a range are ignored, and an ERR or NA item propagates (rules S01, S02, S12).
49. COUNT SHALL count 1 for each non-range argument whatever its value, including ERR, NA and an empty cell, and the number of non-empty cells for each range. It SHALL NOT propagate ERR or NA (rules S04, S12).
50. AVG SHALL equal SUM divided by COUNT, and SHALL be ERR when COUNT is 0 (rule S03). A blank cell listed on its own SHALL add 0 to the sum and 1 to the count; a blank inside a range SHALL add neither.
51. MIN and MAX SHALL give the least and greatest item, with labels as 0 and empty range cells ignored, and ERR when there are no items (rule S05).
52. STD SHALL be the population standard deviation of its items, and ERR when the item count is 0 (rule S06).
53. INT SHALL truncate toward zero. ABS SHALL be the absolute value. SQRT of a negative number SHALL be ERR (rules S07, S10).
54. MOD(x, y) SHALL be `x - y * INT(x / y)` and SHALL be ERR when y is 0 (rule S08).
55. CHOOSE(x, v0, ..., vn) SHALL use the integer part of x as an offset counted from 0, and SHALL be ERR when x is below 0 or above n. Only the chosen argument SHALL contribute to the value and to error propagation (rule S16). IF x is between -1 and 0, THEN the cell SHALL be unverifiable (rule `U07`).
56. VLOOKUP(x, range, k) and HLOOKUP(x, range, k) SHALL find the last key not above x in the first column (or row), then return the cell k places along, with k counted from 0, and SHALL be ERR when the first key is above x or k is negative or beyond the range (rule S17). WHEN the keys are not ascending or a key is not a number, the cell SHALL be unverifiable (rule `U07`).
57. ROUND(x, n) SHALL round x to n decimal places, with n cut to an integer in the range -15 to 15 (rule S09). WHEN x is exactly halfway at digit n in its 15-digit decimal form, or n is outside the range, the cell SHALL be unverifiable (rule `U03`).
58. PI SHALL be the double nearest to pi, TRUE SHALL be 1 and FALSE SHALL be 0. NA and ERR SHALL be the values NA and ERR (rules S11, S12).
59. DATE(year, month, day) SHALL give the serial number counted from 1 for 1900-01-01, with year as years since 1900 from 0 to 199, and SHALL be ERR when the month or day does not exist (rules S18, S19). IF the year is outside 0 to 199 or any argument is not an integer, THEN the cell SHALL be unverifiable (rule `U06`).
60. The date arithmetic SHALL treat 1900 as a leap year: serial 59 is 1900-02-28, serial 60 is 1900-02-29, serial 61 is 1900-03-01, and serials from 61 on equal the number of days since 1899-12-30 (rule S20). DATE(0, 2, 29) SHALL give 60. The engine SHALL NOT use `Date`.
61. PMT(principal, interest, term) SHALL be `principal * interest / (1 - (1 + interest)^-term)`. PV(payment, interest, term) SHALL be `payment * (1 - (1 + interest)^-term) / interest`. FV(payment, interest, term) SHALL be `payment * ((1 + interest)^term - 1) / interest`. IF interest is 0, THEN the cell SHALL be unverifiable (rules S21 to S23, `U05`).
62. NPV(interest, range) SHALL be the sum of each value divided by `(1 + interest)^i`, with i counted from 1, over a range in one row or one column (rule S24). IF the range holds a label or an empty cell, or is not one row or one column, THEN the cell SHALL be unverifiable (rule `U09`).
63. IF a formula contains NOW or RAND anywhere, THEN the cell SHALL be unverifiable with reason `volatile-function` and its recalculated value SHALL be null (rule S25).
64. IF a formula contains a function name the engine has no implementation for, THEN the cell SHALL be unverifiable with reason `unsupported-function`, naming the function. The engine's function list SHALL be checked against `OPCODES` by a test, so a function added to the opcode table without an implementation fails a test.
65. A list function called with no arguments SHALL make the cell unverifiable (rule `U11`).

### Decoder results

66. The module SHALL decode each formula with `decodeRpn` and evaluate its Lotus AST. It SHALL use `translateFormula` only to fill `formula` with the Excel text.
67. IF the decoder reports `unknown-opcode`, THEN the cell SHALL be unverifiable with reason `unknown-opcode`, naming the opcode and offset.
68. IF the decoder reports any other error, THEN the cell SHALL be unverifiable with reason `decode-error`, carrying the first error's code and message.
69. WHEN the decoder reports `unconfirmed-opcode` warnings, the cell SHALL still be evaluated, and `candidateOpcodes` SHALL list the candidate opcodes it uses (sorted, no repeats). A cell that uses only confirmed opcodes SHALL have an empty list. This feature SHALL NOT change any status in `src/formula/opcodes.ts`.

### Command line

70. `lazarus <path> --verify` SHALL parse every WK1/WKS file it lists and add a verify summary: formulas, matched, mismatched and unverifiable. Without `--verify`, the output and exit codes SHALL NOT change.
71. In text mode the summary SHALL be one more tab-separated field on the file's line. In `--json` mode each WK1/WKS entry SHALL gain a `verify` object with the same four counts plus `exact`, `withinTolerance` and `byReason`. Entries for other formats SHALL have neither.
72. A file with mismatched or unverifiable cells SHALL NOT change the exit code. IF a WK1/WKS file has parser `error` diagnostics, THEN the line SHALL say so and the verify counts SHALL still describe the cells that parsed.
73. `src/cli` MAY import `src/verify` and `src/parser`. The summary logic SHALL live in `src/cli/verify-summary.ts`, so `inventory.ts` keeps its rule of importing only `node:*`.

## Acceptance

1. Every formula cell in every synthetic fixture of `fixtures/manifest.json` is `matched`: 27 of 27 today, and 100 percent of any synthetic formula added later.
2. The real fixtures (`KSBASE.WK1`, `testLotus123.wks`, `gnome647171-1.wks`) report measured matched, mismatched and unverifiable counts. They are written to the committed golden table `tests/differential/verify/golden.json`. Every mismatched or unverifiable cell in it has a human-written `finding` that says why.
3. For each wk1/wks fixture, `matched + mismatched + unverifiable` equals the manifest `counts.formulas`.
4. The exact evaluator from `tests/unit/fixtures/gen-fixtures.test.ts`, moved to a shared helper, agrees with the engine on all 27 synthetic formulas. The helper does not import `src/verify`.
5. Unit tests cover every function and every rule id in design.md. Every example the Lotus manual prints for a function is a test (design.md lists them).
6. Property tests pass: arithmetic invariants, function invariants, order independence, determinism, and no throw on arbitrary bytes, mutated fixtures and random cyclic sheets.
7. `bun run lazarus fixtures --verify` prints the same counts as the golden table.
8. `bun run typecheck` and `bun run test` exit 0.

## Out of scope

Writing XLSX, the report UI and its worker client, DBF and WK3 verification, reading the cached text of a string formula (a `wk1-parser` follow-up), @functions that no opcode table entry names, string functions and string operators, the approval queue for unknown opcodes, editing any status in `opcodes.ts`, macros, Lotus recalculation order settings other than natural (rule S26), and any model call.

## Open questions to settle in review

1. KSBASE.WK1's N cells compare C and D cells, and its O cells depend on the N cells. If those C and D cells are labels, the engine marks all 160 formulas unverifiable under requirement 40. Task 1 reads the cell kinds from the file before any rule is fixed. The answer decides whether label comparison needs a source, a parser change or a documented limit.
2. The tolerance values in design.md are provisional. Task 3 sets them, and task 50 finalises them from the measured differences on the real fixtures, with review sign-off. The spec fixes the rule, the single location and the report wording, not the digits.
3. ROUND halfway cases and the 15-digit decimal form (rule `U03`) rest on an engineering choice, not a Lotus source. A real fixture that rounds a halfway value would settle it. None is known.
4. The cached text of a string formula (gnome647171-1.wks A5, a result of "Odd" or "Even") sits in a record the parser skips. Until a parser task reads it, string results stay unverifiable.
5. A dependent of an unverifiable precedent is unverifiable (requirement 34). A softer rule would check it against the precedent's cached value and call it conditionally matched. This spec does not add a fourth state, since product.md fixes three.
6. Lotus can save a file with row-wise or column-wise recalculation, and a low iteration count, so a cached value may be stale by Lotus's own rules. The parser skips those records. A mismatch in such a file is a finding, not proof of an engine bug. The report cannot say which until the parser reads the settings.
7. The Lotus manual gives Dec 31, 2099 as 73049 on one page. Its other anchors (1900-01-01 is 1, 2000-01-01 is 36526) and the Membrane page give 73050. The spec follows the arithmetic. See design.md rule S19.
8. `--verify` is opt-in so that the existing CLI contract and tests stay as they are. Making it the default is a one-line change if review prefers it.
