# Design: verification engine

## Layout

```
src/verify/
  tolerance.ts   TOLERANCE, withinTolerance(a, b)            (the only place a tolerance exists)
  value.ts       Value, constructors, valueFromDouble (rule S27), ReasonCode, Unverifiable, Outcome
  dates.ts       dateSerial(year, month, day): number | null  (rules S18 to S20, no Date)
  decimal.ts     roundDecimal(x, n): { value } | { tie: true } (rule S09)
  ops.ts         arithmetic, comparison and logic operators over Value
  lists.ts       SUM, AVG, COUNT, MIN, MAX, STD over list items
  finance.ts     PMT, PV, FV, NPV
  lookup.ts      CHOOSE, VLOOKUP, HLOOKUP
  evaluate.ts    evaluate(ast, ctx): Outcome<Value>            (walks one Lotus AST)
  graph.ts       precedents(ast), dependency graph, iterative Tarjan, natural order
  recalc.ts      recalcSheet(sheet): Map<number, CellOutcome>
  classify.ts    compare recalculated with cached, build CellResult
  report.ts      totals, SheetVerification
  index.ts       verifySheet, verifyBytes, public types
src/workers/
  verify-protocol.ts   request/response types, handleVerifyRequest
  verify.worker.ts     installs the handler on the worker scope
src/cli/
  verify-summary.ts    verify summary for one file (imports src/verify)
scripts/
  dump-cached.ts       evidence dump (task 1)
  verify-golden.ts     writes tests/differential/verify/golden.json (task 49)
tests/unit/verify/     one file per src/verify module, plus rules.test.ts and tolerance-single.test.ts
tests/unit/workers/    verify-protocol.test.ts, verify-worker.test.ts
tests/unit/helpers/    rpn-eval.ts (moved out of gen-fixtures.test.ts), rule-table.ts
tests/differential/verify/   fixtures.test.ts, oracle.test.ts, golden.test.ts, golden.json
tests/property/verify/       arithmetic, functions, order, robustness
```

Dependency rule (structure.md, extended): `ui` -> `workers` -> `verify` -> `formula` -> `parser`, and `cli` -> `verify`. `src/verify` imports only `src/formula` and `src/parser`. It uses no `node:*`, no DOM and none of `Date`, `performance`, `Math.random`, `TextDecoder`. The tests may use `node:fs` and the helpers.

The formula module already exports everything needed: `decodeRpn`, `translateFormula`, `OPCODE_TABLE`, `OPCODES`, `MAX_DEPTH` and the `Expr` types. The parser exports `Sheet`, `Cell`, `a1`, `cellKey`, `cellsInRowMajorOrder`, `parseWk1`. Nothing in `src/parser` or `src/formula` changes in this feature.

## Pipeline

```
Sheet --(for each formula cell)--> decodeRpn --> Lotus AST --+--> precedents --> graph --> Tarjan order
                                                              |                                  |
                                                              +--------> evaluate (per cell, in order, reading precedent outcomes)
                                                                                                 |
cached double --valueFromDouble--> cached Value ---------------------------------> classify --> CellResult --> totals
```

The engine evaluates the **Lotus AST** from `decodeRpn`, not the Excel AST. The Excel AST has already rewritten the semantics under test (INT to TRUNC, the PMT sign flip, the `+1` offsets), so checking it would test the translator against itself. `translateFormula` is called once per cell, only to fill `formula` with the Excel text shown next to a result.

One consequence: `toExcelAst` fails on ERR and sets `excel` to null. That does not matter here, because the engine evaluates ERR as a value. The `formula` field is then null for that cell.

## Types

```ts
export type Value =
  | { t: "num"; v: number; label?: true }  // label: the number 0 came straight from a label cell (rule U02)
  | { t: "str"; v: string }
  | { t: "err" }
  | { t: "na" };

export type ReasonCode =
  | "exact" | "within-tolerance"                                                  // matched
  | "value-differs"                                                               // mismatched
  | "unknown-opcode" | "decode-error" | "unsupported-function" | "volatile-function"
  | "circular-reference" | "depends-on-unverifiable" | "string-result"
  | "cached-not-a-number" | "undocumented-semantics";                             // unverifiable

export type Reason = { code: ReasonCode; rule?: string; message: string };
export type Unverifiable = { code: ReasonCode; rule?: string; message: string };   // the unverifiable subset of Reason
export type Outcome<T> = { ok: true; v: T } | { ok: false; u: Unverifiable };

export type InputRow = { address: string; kind: "number" | "label" | "empty" | "formula"; value: Value | null; cached: Value | null };

export type CellResult = {
  address: string; col: number; row: number;
  status: "matched" | "mismatched" | "unverifiable";
  cached: Value | null;               // null only for a cached NaN
  recalculated: Value | null;         // null for unknown-opcode, decode-error, volatile-function, unsupported-function,
                                      // circular-reference, depends-on-unverifiable and undocumented-semantics;
                                      // a bare label result (U02) keeps its value
  reason: Reason;
  formula: string | null;             // Excel text, for display
  candidateOpcodes: number[];
  inputs?: InputRow[];                // mismatched only: first 20 direct precedents
  inputsOmitted?: number;
};

export type Totals = {
  formulas: number; matched: number; mismatched: number; unverifiable: number;
  exact: number; withinTolerance: number; byReason: Partial<Record<ReasonCode, number>>;
};
export type SheetVerification = { name: string; format: Wk1Format; tolerance: Tolerance; cells: CellResult[]; totals: Totals };
export type VerifyBytesResult = { diagnostics: Diagnostic[]; verification: SheetVerification };
```

All of these are plain data. They survive `structuredClone` and `JSON.stringify` (an infinity in a cached double is stored as the `err` or `na` value, so JSON has no `Infinity` to lose).

## Sources

Every rule below cites at least one URL from `design/refs/lotus-semantics/refs.md`. The local copy sits in that folder. "MAN ch.19" is the alphabetical function reference in the 1983 manual. The text extract keeps the page markers (`19-5` and so on), which are used here as locators. The extract is OCR text, so a locator names the entry and a short quote, and the rule test (task 2) checks that every cited URL is on the allowed list.

| Key | URL |
|---|---|
| MAN | https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf |
| R23 | https://pdfcoffee.com/lotus-1-2-3-v23-functions-and-macros-guide-pdf-free.html |
| V9 | https://www.oasis-open.org/committees/office/repository/miscellane1380/lotus123v9ssfn70enpdf@1153517929.5948 |
| MEMB | http://parsifal.membrane.com/work/ref0001.htm |
| MSL | https://learn.microsoft.com/en-us/troubleshoot/microsoft-365-apps/excel/wrongly-assumes-1900-is-leap-year |
| WEIR | https://www.robweir.com/blog/2006/10/leap-back.html |
| LOFORM | https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/lotus/lotform.cxx |
| WSFF2 | https://oss.sheetjs.com/notes/lotus/WSFF2.TXT |

**WSFF2 is the one source outside `refs.md`.** It is listed in `design/refs/lotus/SOURCES.md` (the file-format notes Lotus put in the public domain). Nothing in `refs.md` says how a FORMULA record stores ERR and NA, so rule S27 cites it. Review should accept or reject that one exception.

LibreOffice help pages (Calc, not Lotus) are listed in `refs.md` and are used only to contrast: they show what Calc does differently, and they are never the source of a Lotus rule.

## Semantic rules

Rule ids are used in `reason.rule`, in test names and in `requirements.md`. `tests/unit/verify/rules.test.ts` fails if a rule has no cited allowed URL, or if its id appears in no test file.

| Id | Rule | Sources (URL, locator) |
|---|---|---|
| S01 | A label cell counts as 0. An empty cell counts as 0 when listed on its own and is ignored when it is part of a range. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf ch.19 "Empty Cells" (19-2): "Cells with label entries are the same as zeros. An empty cell counts as a zero if specified individually ... ignored altogether if specified as part of a range". R23 https://pdfcoffee.com/lotus-1-2-3-v23-functions-and-macros-guide-pdf-free.html @AVG notes: "Labels count as zero ... blank cells listed individually increase the total number of items". |
| S02 | SUM adds its items. Labels are 0, empty range cells are ignored. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf @SUM (19-16): "Label cells count as zeros. Empty cells are ignored." |
| S03 | AVG is SUM divided by COUNT. It is ERR when there is nothing to average. A blank cell listed on its own is one item worth 0. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf @AVG (19-5): "@AVG(list) -> @SUM(list)/@COUNT(list)", "If there are no values to be averaged, the result is ERR". R23 https://pdfcoffee.com/lotus-1-2-3-v23-functions-and-macros-guide-pdf-free.html @AVG example: A1..A5 gives 43.75, and A1,A2,A3,A4,A5 with A4 blank gives 35. |
| S04 | COUNT counts 1 for each argument that is not a range, whatever it holds (an empty cell, ERR, NA). For a range it counts the non-empty cells, labels included. It does not propagate ERR or NA. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf @COUNT (19-6): "@COUNT(0) -> 1", "@COUNT(@ERR) and @COUNT(@NA) -> 1 (These are the only cases in which the ripple-through-the-worksheet effect of NA and ERR is halted)", "@COUNT(H54) 1 even if cell H54 is empty", "@COUNT(A1..A4) -> 3". |
| S05 | MIN and MAX ignore empty range cells, count labels as 0, and are ERR when the list has no entries. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf @MAX/@MIN (19-12): "If there are no entries in the list, the function returns the result ERR", "@MIN(H1..H3) -> 14 (not 0)" with H3 empty; "Cells with label entries are the same as zeros" (19-2). |
| S06 | STD is the population standard deviation. It is ERR when COUNT is 0. Labels are 0, empty range cells are ignored. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf @STD (19-15): "population standard deviation", "If @COUNT(list) is zero, the result is ERR", "@STD(A1..A4) -> 6.159076" for 45.60, 33.01, 41.00, 49.57. |
| S07 | INT truncates toward zero. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf @INT (19-11): "@INT(1.258) -> 1", "@INT(-1.258) -> -1". |
| S08 | MOD(x, y) = x - y * INT(x / y). It is ERR when y is 0. The sign follows x. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf @MOD (19-12): "1-2-3 calculates this as: x - (y*@INT(x/y)). If y = 0, the result is ERR", "@MOD(15,7) -> 1". V9 https://www.oasis-open.org/committees/office/repository/miscellane1380/lotus123v9ssfn70enpdf@1153517929.5948 @MOD: "The sign of the result matches the sign of x." |
| S09 | ROUND(x, n) rounds x to n decimal places. n is cut to an integer and must lie in -15..15. Negative n rounds to tens, hundreds and so on. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf @ROUND (19-14): "n is truncated to an integer and must be in the range from -15 to +15", table for 7145.258 with n = -3..3 giving 7000, 7100, 7150, 7145, 7145.3, 7145.26, 7145.258. V9 https://www.oasis-open.org/committees/office/repository/miscellane1380/lotus123v9ssfn70enpdf@1153517929.5948 @ROUND. Contrast only: Calc rounds halves away from zero (https://help.libreoffice.org/latest/en-US/text/scalc/01/04060106.html?DbPAR=CALC). No Lotus source gives the halfway rule, hence `U03`. |
| S10 | ABS is the absolute value. SQRT of a negative number is ERR. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf @ABS (19-4), @SQRT (19-15): "If x is negative, the result is ERR", "@SQRT(2) -> 1.4142". |
| S11 | PI is pi. TRUE is 1. FALSE is 0. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf @PI (19-13), @TRUE (19-16): "The value 1", @FALSE (19-9): "The value 0". |
| S12 | NA and ERR are values. A cell that depends on an NA or ERR cell takes that value. COUNT is the one exception (S04). Only the cells that a formula needs count (the unchosen branch of IF does not). | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf ch.5 (5-5): "Any cell whose value depends on an NA cell also has the value NA", "the ERR value ripples throughout the worksheet", @ERR (19-8), @NA (19-12), `@IF(B14>3.2,@ERR,B14)` (19-9). |
| S13 | An impossible calculation is ERR: division by zero, and by the same reading any result that is not a finite number (overflow, the root or power of a negative number). | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf ch.5 (5-5): "a formula that defines an impossible calculation (e.g. divide a number by zero)", "Whenever a cell contains a formula that defines an impossible calculation, 1-2-3 displays ERR". @EXP (19-9): "If the argument x is very large (approximately 230), the value is ERR". The step from "divide by zero" to "any non-finite result" is this spec's reading of "impossible calculation". |
| S14 | A true comparison is 1 and a false one is 0. Any nonzero number counts as true. The logical operators give 1 or 0. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf ch.8 (8-20, 8-21): "If 1-2-3 calculates a statement to be TRUE, it assigns the statement the value 1 ... any nonzero number is equivalent to TRUE", operators `#NOT#`, `#AND#`, `#OR#`. Comparison is exact IEEE comparison: no source mentions a tolerance, so a difference would show as a mismatch. |
| S15 | IF takes the second argument when the condition is nonzero, else the third. Only the chosen branch is the result. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf @IF (19-10): "If x is non-zero (TRUE), then the result is the true-value argument", and the @ERR example in S12. R23 https://pdfcoffee.com/lotus-1-2-3-v23-functions-and-macros-guide-pdf-free.html @IF: "useful in preventing ERR, NA, and calculation errors ... to prevent division by zero". |
| S16 | CHOOSE(x, v0, ..., vn) returns v(INT x). It counts from 0. It is ERR when x < 0 or x > n. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf @CHOOSE (19-5, 19-6): "If x = 0, then @CHOOSE -> v0", "If x < 0 or x > n, then @CHOOSE -> ERR", "The result is the value in cell B1 if H20 contains 1.3". LOFORM https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/lotus/lotform.cxx `LotusToSc::DoFunc`, `case ocChoose` adds 1 to the index when converting to Calc, which counts from 1. |
| S17 | VLOOKUP(x, range, k) finds the last row of the first column whose key is not above x (keys ascending), then returns the cell k columns right, k counted from 0. HLOOKUP is the same with rows and columns exchanged. ERR when the first key is above x, or k is negative or beyond the range. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf @VLOOKUP (19-17), @HLOOKUP (19-9, 19-10): "locates the first value in the lookup column that exceeds the selector value, x. Then, it backs up to the previous row", "the lookup column is 0, the next column is 1", "If the first cell in the lookup column exceeds the selector value, the result is ERR. If column is negative or exceeds the number of columns in the lookup range, the result is ERR", `@HLOOKUP(INCOME,TAXTABLE,STATUS) -> 381 if INCOME = 6089 and STATUS = 2`. LOFORM https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/lotus/lotform.cxx `case ocHLookup`, `case ocVLookup`: last parameter incremented. The manual's second HLOOKUP example (599 for STATUS = 3) contradicts its own table (status 3 is the Separate row, 709), so it is not used as a test. |
| S18 | DATE(year, month, day): year counts from 1900 (0 is 1900, 199 is 2099). A month or day that does not exist is ERR. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf @DATE (19-6, 19-7): "The year argument must have a value between 0 (standing for 1900) and 199 (standing for 2099)", "@DATE(83,14,8) -> ERR", "@DATE(83,4,31) -> ERR", "@DATE(82,9,27) -> 30221". MEMB http://parsifal.membrane.com/work/ref0001.htm: "you add 100 to the last two digits of the year (if you are using the @DATE function)", "@DATE(1,2,4) stands for February 4, 1901 ... value 401". LOFORM https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/lotus/lotform.cxx `case ocGetYear` subtracts 1900: Lotus year numbers count from 1900. |
| S19 | Serial anchors: 1900-01-01 is 1, 1900-01-02 is 2, 1901-01-01 is 367, 1989-01-01 is 32509, 1999-12-31 is 36525, 2000-01-01 is 36526, 2099-12-31 is 73050. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf @DATE (19-6): "Jan 1, 1900 = 1", "Jan 2, 1900 = 2", "Jan 1, 1901 = 367", "Dec 31, 1999 = 36525", "Jan 1, 2000 = 36526". MEMB http://parsifal.membrane.com/work/ref0001.htm: "January 1, 1989 is date number 32509", "December 31, 2099 (date number 73050)". **Conflict:** MAN prints "Dec 31, 2099 = 73049" on 19-6. Its own anchors and MEMB give 73050 (36525 days after 36526 less one), so the spec uses 73050. |
| S20 | 1900 is treated as a leap year: serial 59 is 1900-02-28, serial 60 is the nonexistent 1900-02-29, serial 61 is 1900-03-01. From serial 61 on, the serial equals the days since 1899-12-30. | MSL https://learn.microsoft.com/en-us/troubleshoot/microsoft-365-apps/excel/wrongly-assumes-1900-is-leap-year: "When Lotus 1-2-3 was first released, the program assumed that the year 1900 was a leap year". WEIR https://www.robweir.com/blog/2006/10/leap-back.html: "serial value 59 corresponds to February 28, and serial value 61 corresponds to March 1, the next day, allowing the (nonexistent) date February 29 to have the serial value 60". |
| S21 | PMT(principal, interest, term) = principal * interest / (1 - (1 + interest)^-term). The principal comes first. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf @PMT (19-13): "@PMT(50000,14.5%/12,25*12) -> 621.0815". V9 https://www.oasis-open.org/committees/office/repository/miscellane1380/lotus123v9ssfn70enpdf@1153517929.5948 @PMT(principal;interest;term). LOFORM https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/lotus/lotform.cxx `if( eOc == ocPMT )`: reorders the three arguments for Calc. |
| S22 | PV(payment, interest, term) = payment * (1 - (1 + interest)^-term) / interest. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf @PV (19-14): "1-2-3 uses pmt as the per-period payment, int as the per-period interest rate, and term as the number of periods", payments at the end of each period. V9 https://www.oasis-open.org/committees/office/repository/miscellane1380/lotus123v9ssfn70enpdf@1153517929.5948 @PV(payments;interest;term). |
| S23 | FV(payment, interest, term) = payment * ((1 + interest)^term - 1) / interest. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf @FV (19-9): "@FV(1000,14.5%,5) -> 6675.9352". V9 https://www.oasis-open.org/committees/office/repository/miscellane1380/lotus123v9ssfn70enpdf@1153517929.5948 @FV(payments;interest;term). |
| S24 | NPV(interest, range) = sum over the range of value_i / (1 + interest)^i, with i counted from 1. The range is in one row or one column. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf @NPV (19-13): "The first cash flow is assumed to be made at the end of the first period", "The range must be in a single column or single row", four receipts of 400 at 10.5% give 1254.343. |
| S25 | NOW and RAND change on every recalculation, so no stored value can check them. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf @RAND (19-14): "Each time 1-2-3 recalculates the worksheet, the value of this function changes"; @TODAY (19-16). MEMB http://parsifal.membrane.com/work/ref0001.htm: "@NOW evaluates to the date and time number for the current date and time". LOFORM https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/lotus/lotform.cxx table entry 55 "Today" (`ocGetActDate`), the opcode the table here names NOW. |
| S26 | Natural order: a formula is calculated after the formulas it depends on. A circular reference is a defect the program flags. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf ch.10 (10-5, 10-6): "It does not recalculate a formula until it has already processed all other formulas it depends on", "Whenever 1-2-3 detects a circular reference in a worksheet using Natural order, it displays a CIRC indicator". |
| S27 | A stored double with sign 1, exponent 0x7FF, fraction 0 means NA (negative infinity). Sign 0, exponent 0x7FF, fraction 0 means ERR (positive infinity). Other NaN patterns are special (strings in Symphony) and not read as numbers. | WSFF2 https://oss.sheetjs.com/notes/lotus/WSFF2.TXT NUMBER record, "Special Values: NA: S = 1 Exponent = 7FF Fraction = 0, ERR: S = 0 Exponent = 7FF Fraction = 0, STRING: S = 0 Exponent = 7FF Fraction = non-zero". Not in `refs.md` (see Sources). MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf ch.5 (5-5): "1-2-3 handles these situations by using two special numbers". Task 1 checks that no fixture contradicts this. |

## Undocumented cases

None of the sources above defines these. The engine does not guess. The cell is unverifiable with reason `undocumented-semantics` and `rule` set to the id. A fixture that later shows the real behaviour turns one of them into a rule with a source.

| Id | Case | Why it stays unverifiable |
|---|---|---|
| U01 | A string value as an operand of an operator or function, a string concatenation, or a label or empty cell as an operand of a comparison. | MAN https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf (1983) has no string formulas. R23 https://pdfcoffee.com/lotus-1-2-3-v23-functions-and-macros-guide-pdf-free.html says labels count as 0 in list functions only. Release 2 and later compare label text, so treating a label as 0 in `C3=C4` could be wrong. |
| U02 | The whole result of a formula is a label (`+A1` where A1 is a label, or IF/CHOOSE/a lookup returning one). | Release 2 and later return the label text. The `label` flag on a number value marks it, and arithmetic clears the flag. |
| U03 | ROUND with the digit after n exactly 5 followed by zeros in the 15-digit decimal form of x, or with n outside -15..15. | The manual gives the n range but not the halfway rule or what happens outside it. |
| U04 | 0 raised to the power 0. | No source. |
| U05 | PMT, PV or FV with interest 0. | The formulas divide 0 by 0. Lotus may return principal/term, but no source says so. |
| U06 | DATE with a year outside 0..199, or any non-integer argument. | The manual gives the year range and ERR for bad month and day, nothing for these. |
| U07 | CHOOSE with x between -1 and 0 exclusive. VLOOKUP/HLOOKUP with a fractional offset, a key that is not a number, keys that are not ascending, or a selector that is a string. | The manual says keys "must be in ascending order" and gives no result when they are not. |
| U08 | Operands include both ERR and NA. | No source says which wins. |
| U09 | NPV over a range that holds a label or an empty cell, or is not one row or one column. | The manual states the range requirement but not the result. A blank would shift the period count. |
| U10 | A range used where a single value is expected. | No source. |
| U11 | A list function with zero arguments. | Lotus cannot enter one, and no source defines the result. |
| U12 | An INTEGER or NUMBER input cell whose stored double is NaN. | S27 says only that such a pattern is special, not what number it stands for. |

## Tolerance

`src/verify/tolerance.ts`:

```ts
export const TOLERANCE = { relative: 1e-12, absolute: 1e-12 } as const;  // measured in task 50: stays 1e-12 (see below)
export function withinTolerance(a: number, b: number): boolean
```

`withinTolerance` is true when `Object.is(a, b)` (also treating -0 as 0), or `|a - b| <= max(relative * max(|a|, |b|), absolute)`. It is false for any NaN or infinity unless the doubles are identical. The absolute floor exists so that a cancellation result such as `0.1 + 0.2 - 0.3` (about 5.6e-17) is not called different from a stored 0.

Why these numbers: 1-2-3 ran on an 8087 with 80-bit intermediates and stored 64-bit results, so a chain of operations can differ from 64-bit arithmetic by a few units in the last place per step. A relative 1e-12 is about 4500 times the double rounding step, wide enough for tens of operations, narrow enough that a wrong rule shows as a mismatch. Measured in task 50 (`docs/verify-evidence.md`): on every real fixture the largest difference is 0, and all matches are bit-exact. The corpus gives no difference to set the digits from, so the tolerance stays 1e-12. The earlier condition that the largest difference be "well above the rounding step for at least one real cell" is dropped, because it cannot hold when nothing differs. `golden.test.ts` pins the largest relative difference at 0, so a real file that needs the tolerance shows up as a test failure. The report prints `exact` and `withinTolerance` counts separately, so a reader can see how much the tolerance did.

`tests/unit/verify/tolerance-single.test.ts` reads every `.ts` file under `src/verify`, `src/workers` and `src/cli` except `tolerance.ts` and fails on `Number.EPSILON`, the word `epsilon` and any `1e-` literal. Other code calls `withinTolerance`.

## Values and cells

```
valueFromDouble(d): +Infinity -> err, -Infinity -> na (S27), NaN -> null, else num
```

Reading a cell while evaluating:

| Cell | Read as |
|---|---|
| none (empty) | `empty` |
| integer, number | `num` through `valueFromDouble`. A NUMBER record can hold NaN bits (the Symphony string pattern in S27). The parser keeps them, and a formula that needs such a cell is unverifiable with `U12`. |
| label | `label` |
| formula | its `CellOutcome`: `{ ok: true, value }` or `{ ok: false, u }` |

How `empty` and `label` convert depends on where they appear (rules S01, U01, U02):

- In an arithmetic operator, a number function, or as a list item that is not a range: 0.
- Inside a range given to a list function: empty is skipped, label is 0.
- In a comparison: unverifiable `U01`.
- A bare label as the whole result, or passed through IF/CHOOSE/a lookup to the result: the number 0 carries `label: true`, and `classify` turns that into `U02`. Any operator or function clears the flag.

## Evaluation

`evaluate(expr, ctx): Outcome<Value>`, recursive over the AST (depth at most `MAX_DEPTH`, requirement 6). `ctx` offers:

```ts
read(col, row): CellRead                               // see the table above
rangeItems(from, to): Iterable<CellRead>               // row-major; normalised corners; sparse
```

Before walking, `evaluate` scans the whole AST once for two static conditions: any `NOW` or `RAND` call (`volatile-function`, S25), and any call name with no implementation (`unsupported-function`). Both are cell-level. A volatile call in a branch that would not be taken still makes the cell unverifiable, which matches how `translateFormula` treats it.

| Node | Rule |
|---|---|
| `number`, `int` | `num` |
| `string` | `str` (U01 if it is used, `string-result` if it is the result) |
| `ref` | `read`, converted by position (above) |
| `range` | only as an argument in the places requirement 41 lists; elsewhere `U10` |
| `paren` | the inner value |
| `unary neg`, `plus` | arithmetic on the operand, ERR/NA propagate |
| `unary not`, `binary and`, `or` | S14, results 1 or 0 |
| `binary add sub mul div pow` | doubles; non-finite result is ERR (S13); `0^0` is U04 |
| `binary eq ne lt gt le ge` | exact comparison; 1 or 0 (S14) |
| `binary concat` | U01 |
| `call IF` | S15: evaluate the condition, then only the chosen branch |
| `call CHOOSE` | S16: evaluate x, then only the chosen argument |
| other calls | evaluate the arguments the function needs, then the function from `lists.ts`, `finance.ts`, `lookup.ts` or a small table |

ERR/NA handling lives in one helper, `propagate(values)`: if any value is ERR or NA, return it (U08 when both kinds are present). Every operator and function calls it on the operands it uses, before doing its own arithmetic (requirement 44). Functions that evaluate lazily (IF, CHOOSE) and COUNT call it only on the values they use.

List functions take an item list built from the arguments: a non-range argument is one item (a `num`, or 0 for a label or empty cell, flagged `listed: true` so AVG and COUNT count it), and a range yields its non-empty cells with labels as 0. Items are processed in argument order and, inside a range, in row-major order, so the sum order is fixed and documented. A floating-point sum depends on that order by a few units in the last place, which the tolerance covers.

### Algorithms

**Dates (`dates.ts`).** Inputs are integers; otherwise `null`. With `Y = 1900 + year`:

```
leap(Y)      = Y == 1900 || (Y % 4 == 0 && (Y % 100 != 0 || Y % 400 == 0))     // the quirk, S20
leapsBefore(Y) = 0 for Y = 1900, else (floor((Y-1)/4) - floor((Y-1)/100) + floor((Y-1)/400)) - 460 + 1
                 (460 real leap years up to 1899; the +1 counts 1900)
serial       = 365 * (Y - 1900) + leapsBefore(Y) + daysBeforeMonth(Y, month) + day
```

with `daysBeforeMonth` from the month lengths and `leap(Y)`. Month outside 1..12 or day outside the month gives `null`, which the caller turns into ERR (S18). Checks on paper: 2000-01-01 gives 36500 + 25 + 0 + 1 = 36526; 1989-01-01 gives 32485 + 23 + 0 + 1 = 32509; 1900-02-29 gives 60; 1900-03-01 gives 61. The independent test helper builds a day-by-day table from serial 1 and does not share this arithmetic.

**Decimal rounding (`decimal.ts`).** `roundDecimal(x, n)` avoids `x * 10^n`, whose error can push a value across a halfway point:

1. `d = |x|.toPrecision(15)`, split into the digit string, and the decimal exponent.
2. The cut is `e + n` digits from the left, where `e` is the digit count before the decimal point. If the cut is at or beyond 15, return `x`. If it is below 0, return 0.
3. Look at the digit string after the cut. If it starts with `5` and every later digit is `0`, return `{ tie: true }`, which the caller turns into `U03`.
4. Otherwise round up when the first dropped digit is 5 or more, add the carry, and read the result back with `Number(text)`, so the result is the double nearest to that decimal. Restore the sign.

The 15-digit form is what a double reliably keeps, and it is an engineering choice, not a Lotus rule (open question 3). Any x within about 1e-15 of a halfway point is treated as a tie.

**Dependency graph and order (`graph.ts`).**

- `precedents(ast)` walks the AST and returns the references and ranges in it. Corners are normalised.
- The graph has one node per formula cell and an edge to each formula cell a reference or a range reaches. Plain value cells need no node, because their value is fixed.
- For a range of area A over F formula cells, the builder enumerates the range if `A <= F`, and otherwise tests each formula cell against the rectangle.
- Order comes from an **iterative Tarjan** over the graph, with roots taken in ascending `cellKey` order and edges in ascending order. Tarjan emits a component only after every component it points to, so the emission order is a valid natural order (S26) and depends on addresses only. A component of one cell with no self edge is an ordinary cell. A component of two or more cells, or one cell with a self edge, is a cycle.
- No recursion is used: the DFS keeps its own stack of `(node, next edge index)` frames, so a chain of 100 000 formulas cannot overflow.

**Recalculation (`recalc.ts`).** For each component in order: a cycle gives every member `circular-reference`; any other cell is evaluated with a `ctx.read` that looks up the precedent's `CellOutcome` (already set, because of the order). If the read hits an `{ ok: false }` outcome while the value is needed, the cell gets `depends-on-unverifiable` with the first such precedent's address and reason. Outcomes are kept in a `Map<number, CellOutcome>`. The `Sheet` is not changed.

**Classification (`classify.ts`).** Given the cached `Value | null` and the outcome:

| Outcome | Cached | Status and reason |
|---|---|---|
| unverifiable | anything | `unverifiable`, the outcome's reason |
| `str` value | anything | `unverifiable`, `string-result` |
| `num` value with the `label` flag | anything | `unverifiable`, `undocumented-semantics`, `U02` |
| ok | `null` | `unverifiable`, `cached-not-a-number` |
| `num` | `num` | `matched` (`exact` or `within-tolerance`) or `mismatched` (`value-differs`) |
| `err` | `err` | `matched`, `exact` |
| `na` | `na` | `matched`, `exact` |
| any other pair | | `mismatched`, `value-differs` |

Decode problems come first: `decodeRpn` errors give `unknown-opcode` (with the opcode and offset) or `decode-error` before evaluation starts, and those cells have `recalculated: null`. A mismatched result also gets `inputs` (first 20 direct precedents, with `inputsOmitted` for the rest) and the `formula` text. Messages are written for estate executors and archivists, for example "This formula uses @NOW, which gives a different answer every time it is calculated. It cannot be checked against the stored number." The technical detail follows in brackets.

## Worker

`verify-protocol.ts`:

```ts
export type VerifyRequest = { type: "verify"; id: number; name?: string; bytes: ArrayBuffer };
export type VerifyResponse =
  | { type: "result"; id: number; result: VerifyBytesResult }
  | { type: "error"; id: number | null; message: string };
export function handleVerifyRequest(request: unknown): VerifyResponse
```

`handleVerifyRequest` validates the shape, wraps the buffer in a `Uint8Array`, calls `verifyBytes`, and catches anything unexpected so the page always gets an answer. This is the one `try/catch` in the feature. The property tests prove the core itself does not throw, so the catch only guards against a bug.

`verify.worker.ts`:

```ts
import { installVerifyWorker } from "./verify-protocol.ts";
installVerifyWorker(self as unknown as WorkerScopeLike);   // onmessage -> handleVerifyRequest -> postMessage
```

`installVerifyWorker(scope)` takes the minimal `{ onmessage, postMessage }` surface, so a test passes a fake scope in Node. Parsing and recalculation both run inside the worker, so the page stays free (tech.md). The UI wiring (`new Worker(new URL(...), { type: "module" })`) belongs to the UI feature. A test confirms the worker file imports only `./verify-protocol.ts` and the protocol imports only `../verify/index.ts`, `../parser/index.ts` and its own types.

Memory: one `CellResult` per formula and one `Outcome` per formula, no copy of the file. Progress messages and cancellation are not part of v1 (YAGNI); the work is linear in formulas plus range expansion.

## CLI

`src/cli/verify-summary.ts` exports `summarizeFile(bytes): VerifySummary | null` (null unless the bytes parse as WK1/WKS). It calls `verifyBytes` and returns `{ formulas, matched, mismatched, unverifiable, exact, withinTolerance, byReason, parseErrors }`. `lazarus.ts` calls it for each entry whose format is `wk1` or `wks` when `--verify` is given.

- Text line: the current fields, then a field such as `verify: 10 formulas, 10 matched, 0 mismatched, 0 unverifiable`, tab-separated, so one line per file stays one line. A file with parser errors adds `(parser errors: 2)`.
- `--json`: those entries gain `verify` (the object above without `parseErrors` when zero).
- stderr: the existing notice stays without `--verify`. With `--verify` the notice is replaced by `lazarus: verify: formulas are recalculated and compared with the values stored in the file. Stored values are never changed.`
- Exit codes: unchanged. `--verify` is added to the usage line.

`--verify` is opt-in because the walk then reads and recalculates every spreadsheet, not just hashes it, and so the existing CLI tests and their exact output stay valid. The `src/cli` import test (`imports only node:crypto, node:fs, node:path and its own modules`) is extended on purpose: `verify-summary.ts` may import `../verify/index.ts`, and no other file in `src/cli` may.

## Tests

Every test is written red first (tech.md). Test files mirror source paths.

**Unit, one file per module.** Each cites rule ids in test names, for example `it("S08: MOD(-15, 7) is -1", ...)`. Examples printed in the sources serve as independent expected values:

| Rule | Examples used |
|---|---|
| S02, S03 | `@AVG(2,7,4,22)` is 8.75. R23 example: four numbers summing to 175 plus one blank, range average 43.75 and listed average 35. |
| S04 | `@COUNT(0)` is 1, `@COUNT(@ERR)` is 1, `@COUNT(H54)` is 1 for an empty H54, a range with one blank of four cells is 3. |
| S05 | H1 = 56, H2 = 14, H3 empty, H4 = -20: MAX(H1..H4) is 56, MIN(H1..H4) is -20, MIN(H1..H3) is 14. |
| S06 | STD of 45.60, 33.01, 41.00, 49.57 is 6.159076 to six places. STD of 10 and 11.5 is 0.75. |
| S07, S08 | INT(1.258) is 1, INT(-1.258) is -1, MOD(15, 7) is 1, MOD(-15, 7) is -1, MOD(x, 0) is ERR. |
| S09 | ROUND(7145.258, n) for n from -3 to 3 gives 7000, 7100, 7150, 7145, 7145.3, 7145.26, 7145.258 exactly. ROUND(2.5, 0) and ROUND(0.125, 2) are `U03`. |
| S10 | ABS(-6.2) is 6.2, SQRT(2) is 1.4142 to four places, SQRT(-1) is ERR. |
| S12, S13 | 1/0 is ERR, ERR + 1 is ERR, NA * 2 is NA, ERR + NA is `U08`, a huge product is ERR, COUNT(ERR cell) is 1. |
| S14, S15 | 3 > 2 is 1, 2 > 3 is 0, AND, OR, NOT on 0, 1, 2. IF(1, 5, 1/0) is 5, IF(0, 1/0, 7) is 7, IF(ERR, 1, 2) is ERR. |
| S16 | CHOOSE(0, a, b, c) is a, CHOOSE(1.3, ...) is the second, CHOOSE(2.95, ...) is the third, CHOOSE(-1, ...) and CHOOSE(3, a, b, c) are ERR. |
| S17 | Table with keys 6000, 6050, 6100, 6150, 6200 and a status row of 373, 381, 389, 397, 405 as row 2: HLOOKUP(6089, table, 2) is 381, HLOOKUP(5999, table, 2) is ERR, offset 5 is ERR. VLOOKUP on the transposed table agrees. Unsorted keys are `U07`. |
| S18 to S20 | DATE(82,9,27) is 30221, DATE(1,2,4) is 401, DATE(0,1,1) is 1, DATE(0,2,28) is 59, DATE(0,2,29) is 60, DATE(0,3,1) is 61, DATE(1,1,1) is 367, DATE(89,1,1) is 32509, DATE(99,12,31) is 36525, DATE(100,1,1) is 36526, DATE(100,2,29) is 36585 (2000 is a leap year, and `dates.wk1` stores 36585), DATE(199,12,31) is 73050, DATE(83,14,8), DATE(83,4,31), DATE(0,2,30) and DATE(1,2,29) are ERR, DATE(200,1,1) is `U06`. |
| S21 to S24 | PMT(50000, 0.145/12, 300) is 621.0815 to four places, FV(1000, 0.145, 5) is 6675.9352 to four places, NPV(0.105, four values of 400) is 1254.343 to three places, PV(PMT(p, i, n), i, n) is p within tolerance. Interest 0 is `U05`. |
| S25 | NOW, RAND anywhere in a formula, including inside an untaken IF branch. |
| S26 | Two cells referring to each other, a cell referring to itself, a cell downstream of a cycle, a long chain. |
| S27 | `+Infinity` is ERR, `-Infinity` is NA, NaN is null. |

One test pins the last item in the requirement 64 sense: `OPCODES` function names with no implementation fail the test. Another checks that every function in the engine's table appears in `OPCODES`.

**Differential (`tests/differential/verify/`).**

- `fixtures.test.ts`: for every wk1/wks entry of the manifest at run time, `verifyBytes` gives totals whose three counts sum to `counts.formulas`, no cell missing or doubled, and for `origin: "synthetic"` every cell is `matched`. The test prints the split per fixture. It fails if the manifest has no wk1/wks formulas.
- `oracle.test.ts`: the evaluator from `gen-fixtures.test.ts` moves to `tests/unit/helpers/rpn-eval.ts` as `evalRpn`, with that test importing it from there (the move changes no behaviour, and its `checked === 27` assertion stays). The differential test runs `evalRpn` and the engine on all 27 synthetic formulas and requires the same value. The oracle reads precedent cached values and the engine uses recalculated ones, and the fixtures are chosen so they coincide, so equality also checks the engine's dependency order. The helper does not import `src/verify` or `src/formula`, so it stays independent of the code under test. It has its own limits (no label, empty or error handling, no CALC order), and the property test uses it only on the subset it handles.
- `golden.test.ts`: reads `tests/differential/verify/golden.json` and compares it with the measured totals of the three real fixtures. The JSON holds, per fixture: the three counts, `exact`, `withinTolerance`, `byReason`, the largest relative difference among matched cells, the candidate opcodes used by matched cells, and `groups`: one entry per non-matched `(reason, rule)` with a `count`, up to 5 example addresses and a human-written `finding`. The test fails when a measured number differs from the golden one, and when any group has an empty `finding`. `bun run verify:golden` regenerates the file and keeps existing findings by `(reason, rule)`, leaving new groups with an empty finding so the test fails until a human fills it. The golden file is reviewed in the diff. It is never edited to make a cell match.

**Property tests (fast-check).** In `tests/property/verify/`:

- Arithmetic: `a + b` equals `b + a` and `a * b` equals `b * a` on finite doubles; `x + 0`, `x * 1`, `--x` and `x - x` (finite x) are identities; division by zero is always ERR; ERR (or NA) in either operand of any operator gives that error; comparisons give 0 or 1; `NOT(NOT(x))` is 1 for nonzero x; `IF(c, a, b)` equals a or b by c.
- Functions: `ROUND(ROUND(x, n), n)` equals `ROUND(x, n)`, and `|ROUND(x, n) - x| <= 0.5 * 10^-n` plus tolerance; `INT(-x) = -INT(x)` and `|INT(x)| <= |x|`; `MOD(x, y) + y * INT(x / y)` equals x within tolerance and `|MOD| < |y|`; `SUM` equals the left fold in row-major order; `AVG = SUM / COUNT`; `PV(PMT(p, i, n), i, n)` equals p within tolerance; `FV = PV * (1 + i)^n` within tolerance; `DATE` round trip with the independent day-by-day helper, and `DATE(y, m, d + 1) - DATE(y, m, d) = 1` inside a month.
- Order: shuffle the insertion order of `sheet.cells` (a new Map built in random order) and the output is deeply equal. Verify the same bytes twice, deeply equal.
- Robustness: arbitrary bytes into `verifyBytes`, mutated real fixtures, and random sheets built from random references (cycles included) never throw, always terminate, and satisfy the totals invariant of requirement 20. A random sheet with a dependency chain of 100 000 formulas finishes (built directly as a `Sheet`, not through the 8192-row file format).
- Engine against the oracle: random integer-input formulas over the opcodes `evalRpn` supports (add, multiply, SUM, ABS, INT, ROUND, IF with literal conditions) agree exactly.

**Purity and worker tests.** `tests/unit/verify/purity.test.ts` adapts `tests/unit/formula/purity.test.ts`: imports only `../parser/` or `../formula/` or own files, and none of the forbidden APIs. `tests/unit/workers/` tests `handleVerifyRequest` on a fixture buffer, a garbage buffer, a malformed message, and `installVerifyWorker` with a fake scope, and scans `src/workers` and `src/verify` for network APIs (requirement 10).

## Evidence first

Task 1 adds `scripts/dump-cached.ts` and records `evidence.md` in this folder before any rule is coded. For every formula in the real fixtures it prints the cached double as hex bits, then the kind of each cell its decoded references point at (number, integer, label, empty, formula). It settles three things the rules depend on: whether any real cached value is an infinity or NaN (rule S27), whether KSBASE's C3, C4, D3, D4 and their neighbours are labels or numbers (open question 1), and what the cached bits of gnome647171-1.wks A5 are (open question 4). The script uses the parser and decoder only, so the evidence does not depend on the engine.

## Decisions and trade-offs

- **Evaluate the Lotus AST, not the Excel AST.** The Excel AST has already applied the rewrites whose meaning we want to test. The cost is a second walker next to the printer, which is what a recalculation engine is.
- **Full recalculation with recalculated precedents, not "each cell against its precedents' cached values".** The second is a local check that isolates each cell, and the first is what the XLSX will do when opened. Chosen: the first, since it matches the product's claim that the file recalculates to the same numbers, and `inputs` shows the cached values of precedents so a human can still see where a chain first broke. The cost: one mismatch can cascade to dependents.
- **A dependent of an unverifiable cell is unverifiable.** The alternative, to substitute the precedent's cached value and call the result matched, claims more than we proved and needs a fourth state. See open question 5.
- **Undocumented behaviour is unverifiable, not a default.** It lowers the matched count on files that rely on those edges, and it never claims a match we cannot support. Each row of the U table is a candidate for a source later.
- **Comparison with a label is `U01`, not 0.** KSBASE may depend on it (open question 1). The alternative treats labels as 0 everywhere, as the 1983 manual does for functions, and risks false matches on Release 2 files, where equal labels compare equal.
- **Static checks for NOW, RAND and unsupported functions.** A volatile call in an untaken branch still makes the cell unverifiable. The alternative is exact, but it would disagree with `translateFormula`, which marks the formula unverifiable by its text.
- **Iterative Tarjan.** The cost over Kahn's algorithm is a longer function. The gain is cycle membership and an evaluation order in one pass, with no recursion.
- **Decimal-string rounding.** `x * 10^n` and `Math.round` misplace values like 1.005 and 8.345. The string method gives one answer in every runtime. The cost is a 15-digit assumption.
- **Tolerance by relative and absolute parts, in one file.** One rule, one place, printed in the report. A per-function tolerance would hide which function needed it.
- **`--verify` is opt-in.** See the CLI section.

## Risks

- **Cached values may come from 80-bit arithmetic.** Matches by tolerance are reported as `within-tolerance` and counted, so the claim never looks stronger than it is. If the real fixtures need a looser tolerance than 1e-12, the review decides, and the number is documented in the report.
- **A table opcode may be wrong.** Most opcodes are `candidate`, so a mismatch may be a decoder fault rather than an engine fault. `candidateOpcodes` on every cell and the golden table's list of candidate opcodes in matched cells give a human the evidence to promote an entry. The synthetic fixtures use the same table, so only the three real fixtures count as independent evidence for it. This feature does not change `opcodes.ts`.
- **Few real formulas.** 174 of the 201 formulas are real, and 160 of them are KSBASE's AND, IF and equals. Most function rules (PMT, DATE, lookups) are checked only against synthetic fixtures and the manual's examples, which is why each rule has examples from the manual as a second check.
- **The manual's text is OCR.** Some numbers are garbled, and the quotes in the rule tables are normalised from it. Tests use only values that two spots in the text agree on. The rules test checks that cited URLs are on the allowed list, not that a quote matches, so review checks each quote against the local text file.
- **Stale cached values.** A file saved with row-wise recalculation or a low iteration count can hold values that Lotus itself would call stale (open question 6). The result is a mismatch that is a finding about the file, which the golden `finding` field is for.
- **Large ranges.** A range over the whole grid is handled by filtering the sorted cell list, so the cost is the number of cells times the number of such ranges. A sheet with thousands of full-grid ranges would be slow, which no fixture shows.
- **String results.** Any formula that returns text is unverifiable until the parser reads the cached text. In the corpus that is one cell.
