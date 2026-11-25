# Design: WK3 formulas (F17)

## Layout

```
src/parser/
  wk3.ts            also exports unpackSmall(word); parseWk3 sets sheetIndex on each Sheet
  index.ts          exports unpackSmall
src/formula/
  opcodes-wk3.ts    WK3_OPCODES, WK3_OPCODE_TABLE, WK3_UNSUPPORTED_REFERENCES
  decode.ts         decodeRpn(rpn, origin, dialect = "wk1"); type Dialect = "wk1" | "wk3"
  translate.ts      translateFormula(rpn, origin, dialect = "wk1")
  ast.ts            Origin gets an optional sheet
  diagnostics.ts    new codes: foreign-reference, reference-kind-unsupported
  index.ts          exports the table and Dialect
src/verify/
  recalc.ts         dialectOf(sheet): "wk3" when sheet.format is "wk3"; decode() passes it and sheet.sheetIndex
  classify.ts       translateFormula(..., dialectOf(sheet)) for the Excel text
  workbook.ts       no WK3 special case: every non-DBF sheet goes through classifySheet
  value.ts          wk3FormulaNotDecoded(detail?)
fixtures/noaa-ala-wai-m3/   m3.wk3, LICENSE.txt
fixtures/noaa-ala-wai-m21/  m21tab.wk3, LICENSE.txt
scripts/lib/fixture-specs.ts  WK3_SPEC: the three formulas of wk3-sheets.wk3
tests/
  unit/formula/       decode-wk3.test.ts, opcodes-wk3.test.ts
  unit/helpers/       rpn3-encode.ts (Lotus AST to WK3 RPN, independent of src/formula)
  unit/verify/        workbook.test.ts
  property/formula/   wk3.property.test.ts
  differential/verify/ wk3-fixtures.test.ts
```

Dependency rule (structure.md) holds: `formula` imports only `parser`; `verify` imports `formula` and `parser`. The encoder in `tests/unit/helpers` does not import the decoder's table.

## One decoder, two dialects

`decodeRpn` keeps one loop and picks the table by dialect. The WK1 branches are untouched, so the existing WK1 tests guard them. What differs for `"wk3"`:

- the table is `WK3_OPCODE_TABLE`, and a byte in `WK3_UNSUPPORTED_REFERENCES` stops with `reference-kind-unsupported` before the table lookup;
- operand names `NUM10` (10-byte constant), `SNUM` (packed small number), `CREF` and `RREF` (6- and 9-byte references) are read by their own branches; WK1 operands and the WK1 `coord()` arithmetic are not used. A WK3 reference needs no arithmetic with the origin;
- `readCorner3(bits)` reads row u16, sheet u8, column u8; a sheet byte different from `origin.sheet ?? 0` returns a `foreign-reference` fault, a row above 8191 `reference-out-of-grid`;
- there is no `foreign` field in `DecodeResult`. The fault is an error diagnostic; `recalc.ts` finds the first error diagnostic and, for `foreign-reference`, builds `wk3FormulaNotDecoded(message)`.

## The WK3 table

Sources: evidence.md. `WK3_OPCODES` is the fixed rows plus every function of the WK1 `OPCODES`, each re-marked with the WK3 source. `SEEN` in the file lists the nine tokens a real file shows; those are `confirmed`, all other rows `candidate`.

| Token | Operand bytes | Meaning |
| --- | --- | --- |
| 0x00 | 10 | extended-precision constant (`NUM10`); inexact gives `constant-precision` |
| 0x01 | 6: relbits, row u16, sheet u8, col u8 | cell reference; bit 0 column relative, bit 1 row relative (LibreOffice) |
| 0x02 | 9: relbits, two 4-byte addresses | range; bits 0-2 first corner, bits 3-5 second |
| 0x03 | 0 | return |
| 0x04 | 0 | parentheses |
| 0x05 | 2 | packed small number via `unpackSmall` (`int` or `number`) |
| 0x06 | up to NUL | string, Latin-1 |
| 0x07 to 0x0B | | named and error references: stop with `reference-kind-unsupported` |
| 0x0E | 0 | negate |
| 0x0F to 0x13 | 0 | add, subtract, multiply, divide, power |
| 0x14 to 0x19 | 0 | equal, not equal, less or equal, greater or equal, less, greater |
| 0x1A, 0x1B | 0 | AND, OR |
| 0x1C | 0 | NOT |
| 0x1D | 0 | unary plus |
| 0x1E | 0 | concatenation |
| 0x1F to 0x5A | as WK1 | functions, WK1 numbers and arities |

## Verification wiring

`recalcSheet(sheet)` has no extra parameter. `decode()` calls `decodeRpn(cell.rpn, { col, row, sheet: sheet.sheetIndex }, dialectOf(sheet))`. WK1 and WKS sheets have no `sheetIndex` and the `"wk1"` dialect, so their results are unchanged. `verifyWorkbook` calls `classifySheet` for each sheet; `deps.classify` stays as an injection point for tests. The evaluator, graph, tolerance and report do not change. `precedents()` reads `ref` and `range` nodes, which are local by construction. A formula that reads a formula with a foreign reference is `unverifiable` through the precedent's failed outcome.

`wk3FormulaNotDecoded(detail?)`: with no argument the old message ("Formulas in WK3 files are not read yet..."), with one the foreign-reference message ending in the decoder's text, which names the other sheet by its Lotus letter.

## Stored result

`parseWk3` turns the 10-byte stored result into `cached` (a double). Classification compares it with the recalculated double under the existing tolerance. 191 of the 675 `m3.wk3` matches and 3 of the 7 `m21tab.wk3` matches are within tolerance, not exact (evidence.md). No rule was added.

## Tests

- `opcodes-wk3.test.ts`: unique opcodes, every entry has an LO and a GN source, confirmed list equals the nine tokens, operand and operator numbers, 0x07 to 0x0B absent, functions equal the WK1 functions and are known to the evaluator.
- `decode-wk3.test.ts`: three real formulas (m21tab T44, U45, m3 U9) with hand-decoded bytes; operand tokens; relbits; foreign reference as reference and as second corner of a range; row past the grid; every operator; functions; 0x07 to 0x0B; an unknown token; a cut stream; the WK1 dialect still reads 0x09 as add.
- `wk3.property.test.ts`: never throws on arbitrary bytes or on mutated and cut real RPN; round trip of generated trees through `rpn3-encode.ts`; a foreign sheet always gives `foreign-reference`.
- `wk3-fixtures.test.ts` (differential): every WK3 fixture of the manifest has one result per walker formula and keeps its stored value; `m3.wk3` 675 of 675 matched; `m21tab.wk3` 7 matched and V44 mismatched, with the walker showing there is no C44.
- `workbook.test.ts`: the synthetic workbook (C2 matched, D2 foreign reference naming sheet B, E2 unknown opcode); generated sheets that match or mismatch; every generated formula gets a known reason; values unchanged after verifying and writing.

## Risks

- Functions are `candidate`: no real file uses one, so a WK3 arity difference would show as a stack imbalance (`decode-error`), not a false match.
- Extended-precision stored results can differ from a double calculation in the last bits. The existing tolerance applies and is not changed.
- A file with a cleared precedent (m21tab V44) is a mismatch the engine reports truthfully. That is a finding about the file.
