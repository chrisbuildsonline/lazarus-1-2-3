# Design: formula token decoder and translator

## Layout

```
src/formula/
  ast.ts          Expr, Ref, Origin, operator names, depth helper
  diagnostics.ts  FormulaDiagnostic, codes, a small collector
  opcodes.ts      the opcode table: opcode, name, kind, arity, excel mapping, source, status
  decode.ts       decodeRpn(rpn, origin): DecodeResult   (stack machine over bytes)
  excel-ast.ts    toExcelAst(ast): TranslateResult        (rename, reorder, rewrite)
  print-excel.ts  printExcel(ast): PrintResult            (precedence, A1 text, literals)
  translate.ts    translateFormula(rpn, origin)           (chains the three, sets status)
  index.ts        public exports
tests/unit/formula/
  opcodes.test.ts  decode-operands.test.ts  decode-refs.test.ts  decode-operators.test.ts
  decode-functions.test.ts  decode-errors.test.ts  excel-ast.test.ts  print-excel.test.ts
  translate.test.ts  purity.test.ts
tests/unit/helpers/
  rpn-encode.ts   test-only: Lotus AST -> RPN bytes (for generators)
  excel-parse.ts  test-only: Excel text -> AST (the independent re-parser)
tests/property/formula/formula.property.test.ts
tests/differential/formula/fixtures.test.ts
```

Dependency rule (structure.md): `src/formula` imports only `src/parser` (for `ByteReader`, `a1` and the `Severity` type). No `node:*`, no DOM, no React. Tests may use `node:fs` and the helpers.

One change in `src/parser`: `index.ts` also exports `ByteReader`. Without it the formula module would copy the bounds-checked reader. The reader file itself does not change.

## Pipeline

```
rpn bytes + origin --decodeRpn--> Lotus AST --toExcelAst--> Excel AST --printExcel--> text
                         |              |                       |
                     diagnostics    diagnostics             diagnostics
```

`translateFormula` runs the three steps, concatenates diagnostics in order, and computes `status`. Each step also works alone, so tests can pin it down on its own.

The split is what makes the round-trip property exact. The Excel text names `AVERAGE`, not `AVG`, so re-parsing it can only give the Excel AST. The property is therefore `parseExcel(printExcel(x)) = x` for any Excel AST `x`, and a second one for `x = toExcelAst(lotus)` on generated Lotus ASTs.

## Types

```ts
export type Origin = { col: number; row: number };            // 0-based
export type Ref = { col: number; row: number; colAbs: boolean; rowAbs: boolean };  // resolved

export type BinaryOp =
  | "add" | "sub" | "mul" | "div" | "pow"
  | "eq" | "ne" | "lt" | "gt" | "le" | "ge"
  | "and" | "or" | "concat";
export type UnaryOp = "neg" | "plus" | "not";

export type Expr =
  | { type: "number"; value: number }
  | { type: "int"; value: number }
  | { type: "string"; value: string }
  | { type: "ref"; ref: Ref }
  | { type: "range"; from: Ref; to: Ref }
  | { type: "unary"; op: UnaryOp; arg: Expr }
  | { type: "binary"; op: BinaryOp; left: Expr; right: Expr }
  | { type: "paren"; inner: Expr }
  | { type: "call"; name: string; args: Expr[] };

export type FormulaDiagnostic = {
  severity: "error" | "warning" | "info";   // the parser's Severity type
  code: FormulaDiagnosticCode;
  offset: number;                            // index into rpn; for later stages, the end of rpn
  opcode?: number;
  message: string;                           // names opcode as 0x%02X and the offset
};

export type DecodeResult = {
  ast: Expr | null;
  diagnostics: FormulaDiagnostic[];
  unknown: { opcode: number; offset: number } | null;   // for the later approval queue
  bytesRead: number;
};
export type FormulaTranslation = {
  status: "ok" | "unverifiable";
  ast: Expr | null;          // Lotus AST
  excel: string | null;
  diagnostics: FormulaDiagnostic[];
  unknown: { opcode: number; offset: number } | null;
};
```

Codes: `unknown-opcode`, `unconfirmed-opcode`, `truncated-stream`, `stack-underflow`, `stack-imbalance`, `trailing-bytes`, `reference-out-of-grid`, `reserved-bits-set`, `nesting-too-deep`, `non-finite-constant`, `constant-precision`, `no-excel-equivalent`, `volatile-function`, `semantics-note`, `excel-limit`.

The Excel AST uses the same `Expr` type. After `toExcelAst`, no `unary not`, `binary and` or `binary or` node remains, and function names are Excel names. A unit test asserts that invariant.

## Opcode table

```ts
type OpcodeEntry =
  | { opcode: number; kind: "operand"; name: "NUM" | "REF" | "RANGE" | "INT" | "STRING" | ...; source: string; status: Status }
  | { opcode: number; kind: "unary" | "binary" | "paren" | "return"; op?: ...; source: string; status: Status }
  | { opcode: number; kind: "function"; name: string; arity: number | "variable"; excel: ExcelRule; source: string; status: Status };
```

`opcodes.ts` holds one array and builds a `Map<number, OpcodeEntry>`. A unit test checks: opcodes are unique, every entry has a non-empty `source`, and `status` is `confirmed` or `candidate`.

**Do not fill the table from memory.** steering/lotus-format.md says to record each opcode with a source. Task 1 produces the evidence and task 2 writes the table from it. What is already confirmed, from the comments in `scripts/lib/fixture-specs.ts` (each cited there against LibreOffice `sc/source/filter/lotus/lotform.cxx` and real fixture bytes):

| Opcode | Meaning | Operand bytes | Evidence |
|---|---|---|---|
| 0x00 | number | 8-byte double | KSBASE.WK1 O3, 0.5 |
| 0x01 | cell reference | col u16, row u16 | testLotus123.wks C2 to C11 |
| 0x02 | range | col1, row1, col2, row2 (4 x u16) | gnome647171-1.wks A2 |
| 0x03 | return | none | last byte of every real formula |
| 0x04 | parentheses | none | KSBASE.WK1 O3 |
| 0x05 | integer | i16 | KSBASE.WK1 O3, gnome647171-1.wks A5 |
| 0x09 | add | none | KSBASE.WK1 O3 |
| 0x0B | multiply | none | testLotus123.wks C2 |
| 0x50 | @SUM | count byte, then args | gnome647171-1.wks A2 |

Everything else (string, negate, subtract, divide, power, comparisons, AND, OR, NOT, concat, unary plus, the other functions and their arities) is `candidate` until task 1 finds it in a fixture's bytes or task 2 reads it from `lotform.cxx` or the lotus-oracle lookup. A `candidate` entry without a second source stays `candidate`. Its unit test uses hand-written bytes. The differential test's golden table is what upgrades entries.

Arity is part of the evidence. Which functions take a count byte is a fact about the file format and must come from the same sources. The spec expects the variable-count set to include SUM, AVG, COUNT, MIN, MAX and CHOOSE, and that is a guess to check.

## Decoder

A loop over a `ByteReader` with an operand stack, never recursion:

```
stack = []; depth tracked per node (1 + max child depth)
loop:
  at = reader.pos
  op = reader.u8()  -> null: truncated-stream at `at` (no return token), stop
  entry = table.get(op) -> missing: unknown-opcode, record {opcode, offset}, stop
  candidate? -> unconfirmed-opcode warning (once per opcode)
  switch entry.kind
    operand:  read operand bytes (null -> truncated-stream at `at`, stop); push
    unary:    need 1 -> else stack-underflow at `at`; pop, push
    binary:   need 2 -> else stack-underflow; pop right, pop left, push
    paren:    need 1; push paren(pop)
    function: n = fixed arity, or count byte (null -> truncated-stream); need n -> else stack-underflow;
              args = last n popped in written order; push call
    return:   stack.length == 1 -> ast; else stack-imbalance; bytes left? trailing-bytes; stop
  new node depth > 256 -> nesting-too-deep, stop
```

Each iteration reads at least one byte, so the loop ends on any input. The stack holds at most one node per byte read. The depth cap keeps every later recursive step (translate, print, test re-parse) within a few hundred frames.

Reference decoding follows requirements 21 to 23:

```
abs col  = w & 0xFF                      rel col  = signExtend8(w & 0xFF) + origin.col
abs row  = w & 0x1FFF                    rel row  = signExtend13(w & 0x1FFF) + origin.row
reserved check: absolute -> bits 8..14 (col) / 13..14 (row) must be 0;
                relative -> they must equal the sign bit.
```

The fixture writer's `rel()` produces `0x8000 | (offset & 0x3FFF)` and KSBASE writes `0xBFFB` for column -5, so the sign-extension check expects exactly that pattern. If a real file breaks the rule, the warning surfaces it and decoding goes on.

Numbers: the double is read as is. A non-finite double raises `non-finite-constant` and stops the walk with an error, because the Excel text cannot show it.

## Translation (`toExcelAst`)

A recursive map over the tree (depth is capped at 256, so recursion is safe). Rules from requirements 24 to 31, in a table keyed by Lotus function name:

| Lotus | Excel AST | Note emitted |
|---|---|---|
| SUM MIN MAX ABS SQRT IF ROUND DATE NPV | same name, same args | none for IF ROUND ABS SQRT DATE NPV; `semantics-note` for SUM MIN MAX only when an argument is a `range` (labels in range) |
| AVG | `AVERAGE(args)` | same note as above |
| COUNT | `COUNTA(args)` | `semantics-note`: Excel COUNT counts numbers only |
| INT | `TRUNC(x)` | `semantics-note`: Lotus truncates, Excel INT floors |
| MOD | `MOD(a, b)` | `semantics-note`: sign of result for negative operands |
| PMT | `neg(PMT(rate, term, principal))` | `semantics-note`: order and sign |
| PV | `neg(PV(rate, term, payment))` | same |
| FV | `neg(FV(rate, term, payment))` | same |
| CHOOSE | `CHOOSE(add(i, int 1), ...rest)` | `semantics-note`: zero-based index |
| VLOOKUP, HLOOKUP | `X(x, r, add(k, int 1), TRUE())` | `semantics-note`: zero-based offset, sorted match |
| NA TRUE FALSE PI | `call` with no args | none |
| NOW RAND | `call` with no args | `volatile-function` warning (status becomes unverifiable) |
| ERR | none | `no-excel-equivalent` error |
| and / or / not | `call AND/OR/NOT` | none |

Operators `add`, `sub`, `mul`, `div`, `pow`, comparisons, `concat`, `neg`, `plus` and `paren` pass through unchanged.

Mutual-order detail: the table maps a Lotus argument list to an Excel argument list by index, for example PMT: Lotus `[principal, rate, term]` to Excel `[rate, term, principal]`. A call with the wrong argument count cannot come from the decoder (arity is from the table) but can come from a hand-built AST. `toExcelAst` then adds a `no-excel-equivalent` error instead of reading past the argument list. A unit test covers it.

## Printing (`printExcel`)

Precedence numbers, higher binds tighter (Excel):

```
unary neg/plus 6   pow 5   mul/div 4   add/sub 3   concat 2   comparisons 1   operands/calls/paren 9
```

`print(node, parentPrec, side)`: child precedence below `parentPrec` gets parentheses. A right child with equal precedence also gets them. Unary operators print their operand at precedence 6, so `-(a^b)` keeps its parentheses and `(-a)^b` prints `-a^b`. A negative number constant prints with its sign and no parentheses: Excel reads `-2.5^2` as `(-2.5)^2`, which is what a negative constant means.

Where Lotus and Excel precedence differ, the tree is the authority: the Lotus RPN fixed the order, and the printer only adds the parentheses Excel needs to read that order back. The known difference is unary minus against `^` (Lotus `-2^2` is -4, Excel's is 4). Because the decoder works from RPN, it never has to decide this; only the printer does. A unit test covers `neg(pow(2,2))` and `pow(neg(2),2)` as separate cases.

Recursion depth equals tree depth (at most 256 from the decoder). For a tree built by hand with more depth, `printExcel` checks the same cap and returns `nesting-too-deep` instead of overflowing.

Literals:

- number: `String(value)` gives the shortest string that round-trips. Replace `e` by `E`. Check `sig digits > 15` for `constant-precision`. `-0` prints `0` (documented, Excel has no negative zero literal).
- int: decimal.
- string: `"` + text with `"` doubled + `"`. Length over 255 raises `excel-limit`.
- ref: column letters from `a1`'s algorithm (use `a1(col, 0)` and strip the digit, or a local `columnName`), `$` flags per axis.
- call: `NAME(arg,arg)` with no spaces. Zero-argument calls print `NAME()`.

Whole text over 8192 characters raises `excel-limit` in `translateFormula`.

## Status

```
status = diagnostics.some(error) || volatile-function present ? "unverifiable" : "ok"
excel  = null when decode failed or no-excel-equivalent; otherwise the printed text
```

`volatile-function` is a warning, so it needs its own clause. A single function `isUnverifiable(diagnostics)` holds the rule and the unit tests pin it.

## Test helpers

- `rpn-encode.ts`: encodes a Lotus `Expr` to RPN bytes using the opcode table. It needs the table's opcodes, so it imports `src/formula/opcodes.ts`. The helper exists only to feed generators. It is NOT used for the per-token unit tests, which use literal byte arrays from the evidence in task 1, so a wrong opcode number cannot be hidden by an encoder that makes the same mistake.
- `excel-parse.ts`: a small recursive-descent parser for the printer's output grammar (numbers, strings with `""`, `$A$1` refs, `A1:B2` ranges, unary `-` `+`, binary operators with Excel precedence and left association, parentheses, calls with comma-separated arguments). It does not import `src/formula/print-excel.ts`. It returns `paren` nodes for parentheses and `number` nodes for all numeric literals, since text cannot tell `int` from `number` (see `normalize` below). It is not part of the shipped bundle.

Equality for the round trip is `normalize(a) deepEquals normalize(b)`, where `normalize`: turns `int` into `number`, and removes `paren` nodes (the printer may add or reuse parentheses, so a `paren` node is a presentation fact, tested by its own example tests). Number constants in generated trees are finite, non-negative, and not `-0`: a leading `-` reads back as `unary neg`, which is the same value but a different tree. Negative constants have example tests on the printed text.

## Differential test

For each manifest entry with format `wk1` or `wks`:

1. Parse with `parseWk1`, take every `formula` cell, and run `translateFormula(cell.rpn, { col, row })`.
2. Count outcomes. Assert `ok + unverifiable === entry.counts.formulas`, and print the split per fixture.
3. For each `unverifiable`: assert at least one `error` diagnostic and that its message contains `0x` and the offset when the code is `unknown-opcode`, `stack-underflow` or `truncated-stream`.
4. For each `ok`: assert `excel` is non-empty and that `parseExcel(excel)` succeeds (the re-parser accepts our own output on real data).
5. Golden table: for synthetic fixtures and the real formulas whose text can be read by a human from the file, an exact expected string, for example `formulas.wk1`: A2 `A1+B1`, B2 `A1*C1`, C2 `SUM(A1:C1)`, A3 `(A1+B1)*2`, B3 `0.5*B1`, C3 `SUM(A2:C2)+A3`. `mixed.wk1`: D2 `B2*C2`, B4 `SUM(B2:B3)`. `dates.wk1`: A8 `A6+1`. `gnome647171-1.wks` A2 `SUM(A1:B1)`, `testLotus123.wks` C2 `A2*B2`. These come from the comments in `scripts/lib/fixture-specs.ts` and the manifest, not from the new code's output. KSBASE entries are added after task 1, only for formulas that a human has read from the bytes.
6. The test enumerates the manifest at run time and fails if no wk1/wks entry has formulas.

Any real formula that comes back `unverifiable` is a finding: read its bytes, decide whether the table or the file is wrong, write it in the test header. Do not loosen a check.

## Property tests (fast-check)

In `tests/property/formula/formula.property.test.ts`:

- **Excel round trip**: arbitrary Excel `Expr` (generator below) satisfies `normalize(parseExcel(printExcel(x))) = normalize(x)`.
- **Lotus round trip through translation**: arbitrary valid Lotus `Expr` satisfies `normalize(parseExcel(print(toExcelAst(l)))) = normalize(toExcelAst(l))`.
- **Encode then decode**: `decodeRpn(encode(l), origin).ast` equals `l`, with relative and absolute refs chosen so that the resolved cell stays in the grid.
- **Arbitrary bytes never throw**: `fc.uint8Array({ maxLength: 512 })` and an origin from the full u16 range, including out-of-grid. The result is well formed: status matches the diagnostics (requirements 6 and 7), offsets are within `[0, length]`, and `ast === null` when an error exists (except requirements 29 and 30).
- **Biased bytes never throw**: streams built from table opcodes with random operand bytes, with and without a return token, so that deep paths run.
- **Mutated fixture formulas**: take every real formula's `rpn`, flip, truncate, insert and delete bytes. Never throws.
- **Deep nesting**: a stream of 60 000 negate tokens after one operand returns `nesting-too-deep`, and does not overflow the stack.

Generator for `Expr`: recursive with `fc.letrec`, depth-limited to 6. Numbers `fc.double({ min: 0, noNaN: true, noDefaultInfinity: true })` with `-0` mapped to `0`. Strings from printable Latin-1 including `"`. Refs inside the grid with random abs flags. Ranges with two refs. Calls drawn from the table's Excel names with the right arity. Operators over all `binary` ops. The Lotus generator uses Lotus names and the operator forms for AND, OR and NOT.

Seeds are printed on failure. A failing seed becomes a plain unit test.

## Unit tests

One test per opcode table entry, with a hand-written byte array and the expected AST node, from evidence. Plus, per file:

- `decode-operands`: number (0, 0.5, max double, a NaN bit pattern giving `non-finite-constant`), int (0, -1, 32767, -32768), string (empty, with a `"`, high bytes, no NUL gives `truncated-stream`).
- `decode-refs`: absolute and relative, mixed flags per axis, relative negative offsets from KSBASE-style words (`0xBFFB`, `0xBFFF`), a ref that leaves the grid on each side, a `reserved-bits-set` case, a range with mixed flags.
- `decode-operators`: each operator and its operand order, `paren` kept, unary minus on a constant.
- `decode-functions`: fixed arity, variable arity with count 0, 1, 2 and 255, argument order, `unconfirmed-opcode` once per opcode.
- `decode-errors`: unknown opcode (message has opcode and offset, `unknown` set), empty array, cut at every length of a known good formula, no return token, stack underflow for each token kind, `stack-imbalance` with two nodes and with zero, bytes after return, depth 257.
- `excel-ast`: every row of the translation table, including zero-argument calls, the `toExcelAst` invariant (no and, or, not left), ERR, a function with the wrong argument count.
- `print-excel`: precedence cases (`neg(pow)`, `pow(neg)`, `a-(b-c)`, `(a-b)-c`, `a^(b^c)`, `a&b=c`), `$` combinations, string quoting, number forms (`1E+100`, `0.1`, `1.5E-7`), `constant-precision`, `excel-limit`.
- `translate`: status rules, volatile (text kept, status unverifiable), unknown opcode (excel null), the `isUnverifiable` function.
- `purity`: like `tests/unit/parser/purity.test.ts`, over `src/formula`. The import check allows `../parser/` and own files only.

Every unit test is written red first, per tech.md.

## Decisions and trade-offs

- **Two ASTs from one type, with a translation step in between.** Chosen over printing Lotus names straight to Excel text. The step is where the semantics-changing rewrites live, so they can be tested and listed in the report. The cost is one extra pass.
- **Stack machine, not recursive descent.** RPN decodes in one forward pass. It terminates on any bytes and has no recursion on untrusted depth. The depth cap protects the later recursive steps.
- **Stop at the first unknown opcode.** The alternative, skipping ahead, needs operand lengths that an unknown opcode does not give. A wrong guess would produce a plausible but wrong formula. The unknown opcode and offset go to the approval queue (later feature).
- **Resolve relative references while decoding.** The AST then needs no origin to print, and a `ref` means the same cell wherever it is read. The cost is that the original encoding is not kept. The encoding is reproducible from `ref`, `origin` and the flags.
- **Out-of-grid reference is an error, not a wrap.** Wrapping would produce a valid-looking cell that may not be the one Lotus used. See open questions.
- **Print `TRUE()` and `FALSE()`.** Keeps the formulas readable. The boolean-or-number question is the XLSX stage's.
- **Re-parser is a test helper.** The shipped code only prints. Putting the parser in `tests/` keeps it independent of the printer and out of the bundle. If a later feature (a diff in lotus-oracle) needs it, promote it then.
- **Mapped names beyond the listed ones need evidence.** Adding @LN or @YEAR is a table entry and a unit test, once a fixture uses it.

## Risks

- **The opcode table may be wrong in places.** The only protection is evidence: fixtures and lotform.cxx. Candidate entries are warned, not trusted. The verify feature's cached-value comparison is the final proof for every cell.
- **Semantic differences hide behind equal names.** `SUM` over labels, `MOD` on negatives, `INT` on negatives. The `semantics-note` diagnostics make them visible in the report. Nothing here claims equivalence.
- **The fixtures have few formulas** (185 in total, 160 of them in KSBASE.WK1). Functions such as PMT, PV, FV, CHOOSE and the lookups may not appear in any fixture, so their decoding rests on one source until a synthetic fixture covers them. Task 37 adds synthetic fixtures through the generator; it needs an expected cached value computed by hand, never by the new code.
- **Excel reads 15 digits.** Reported, not corrected.
- **Latin-1 strings** can differ from LMBCS for bytes at 0x80 and above, the same open point as the parser's labels.
