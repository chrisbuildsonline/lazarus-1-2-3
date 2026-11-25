# Evidence: WK3 formulas (F17)

What the WK3 decoder rests on, and what it measured. Built in commits 1829443, 48212fd and f08559c. The code is `src/formula/opcodes-wk3.ts`, `src/formula/decode.ts` (dialect "wk3") and `src/verify/recalc.ts`.

## Sources

Copies are in `docs/sources/wk3/`. LO = LibreOffice, GN = Gnumeric.

| Fact | Source |
| --- | --- |
| Token numbers, operand lengths, operator numbers | LO `sc/source/filter/lotus/lotform.cxx`: `LotusToSc::Convert` with `bWK3` set (around line 384), tables `IndexToTypeWK123` and `IndexToTokenWK123`. GN `plugins/lotus-123/lotus-formula.c`: `lotus_parse_formula_new` (around line 731) and `functions_lotus`. |
| One reference: relbits u8, row u16, sheet u8, column u8; coordinates stored as they are | LO `LotusToSc::ReadSRD` (around line 320). GN `get_new_cellref` (around line 714). |
| 10-byte constant (token 0x00) | LO `ScfTools::ReadLongDouble`, GN `lotus_load_treal`. |
| Packed small number (token 0x05) | LO `tool.cxx` `SnumToDouble`, GN `lotus_smallnum`. The decoder calls `unpackSmall`, exported from `src/parser/wk3.ts`, the same function `parseWk3` uses for SMALLNUM cells. |
| Function numbers 0x1F to 0x5A | Same numbers and arities as WK1 in LO `IndexToTypeWK123` and GN `functions_lotus`. |
| Named and error references 0x07 to 0x0B | LO `FT_Nrref`, `FT_Absnref`, `FT_Erref`, `FT_Ecref`, `FT_Econstant`. Known, not read. |

## License of the real files

`fixtures/noaa-ala-wai-m3/m3.wk3` and `fixtures/noaa-ala-wai-m21/m21tab.wk3` come from NOAA NCEI data set G02887 (https://www.ngdc.noaa.gov/mgg/geology/data/g02887/). The NCEI metadata record `gov.noaa.ngdc.mgg.geology:G02887` says, under "NCEI Copyright Statement": "Produced by the NOAA National Centers for Environmental Information. Not subject to copyright protection within the United States." and "Access to this dataset is unrestricted." Redistribution is allowed. Each folder has a `LICENSE.txt` with the source URL, citation and sha256. Saved pages are in `docs/sources/wk3-corpus/`.

## Token inventory of the real files

Tokens used by the 683 formulas of the two files: 0x01 cell reference, 0x03 return, 0x04 parentheses, 0x05 packed small number, 0x0F add, 0x10 subtract, 0x11 multiply, 0x12 divide, 0x1D unary plus. Nothing else.

- No foreign reference, no named or error reference (0x07 to 0x0B), no range, no string, no 10-byte constant and no function token appear.
- So these table rows stay `candidate` (and decoding one adds an `unconfirmed-opcode` warning): 0x00, 0x02, 0x06, 0x0E, 0x13 to 0x1C, 0x1E and every function. Only the nine tokens above are `confirmed` (`SEEN` in `opcodes-wk3.ts`; `tests/unit/formula/opcodes-wk3.test.ts` pins the list).
- Open questions 38 and 39 of requirements.md: no formula in these files uses a string token or a function, so no stored text or error result was seen; the question stays open and a non-numeric stored result stays `unverifiable`. Both files are read as WK3 by `detectKind`; the BOF version word is not recorded here.

## Hand-decoded examples

Format: relbits, row u16 (0-based), sheet, column (0-based). Packed words are described in `lotus-format.md`.

**m21tab.wk3 T44** `01 07 2b00 00 0b  01 07 2b00 00 0a  12  05 c800  11  03`
Reference L44 (row 0x2b = 43, column 0x0b = 11), reference K44 (column 10), divide, packed word 0x00C8 (bit 0 clear, 200 >> 1 = 100), multiply, return. Result: `L44/K44*100`.

**m21tab.wk3 U45** `01 07 2c00 00 0b  05 4d00  10  03`
L45, then packed word 0x004D: bit 0 set, scale index (0x4D >> 1) & 7 = 6 (divide by 16), mantissa 0x4D >> 4 = 4, so 4 / 16 = 0.25. Subtract. Result: `L45-0.25`. With L45 = 0.591 the value is 0.341, the stored result.

**m3.wk3 U9** `(+S9/($C9)*$B9*10)-($S$40*10/$C$40)`
Relbits 7 for S9 (all relative), 6 for `$C9` and `$B9`, 0 for `$S$40` and `$C$40`. With S9 = 655, C9 = 56.16, B9 = 0.4115, S40 = 5.37, C40 = 53.62: 47.99369 - 1.00149 = 46.99219. Stored: 46.992186794324525.

**m3.wk3 E59** `(E56+E57)/2/E58` uses 0x0F (add) with parentheses.

These bytes are asserted in `tests/unit/formula/decode-wk3.test.ts`.

## Relbits finding

LO `ReadSRD` reads bit 0 as "column relative" and bit 1 as "row relative". GN `get_new_cellref` reads the two the other way round. `m3.wk3` decides for LO: the reference to column C in the formulas of columns U and V has relbits 6 (bit 0 clear, bit 1 set). Read the LO way it stays on column C and follows the row (U9 reads `$C9`, and the same holds down to U41), which is what the recalculated values need. Read the GN way the column would move. The decoder uses the LO reading, and every one of the 675 formulas of `m3.wk3` matches.

## Before and after

Before F17, all 683 formulas of the two files were `unverifiable` with `wk3-formula-not-decoded`.

| File | Formulas | Matched | Mismatched | Unverifiable |
| --- | ---: | ---: | ---: | ---: |
| `m3.wk3` before | 675 | 0 | 0 | 675 |
| `m3.wk3` after | 675 | 675 (484 exact, 191 within tolerance) | 0 | 0 |
| `m21tab.wk3` before | 8 | 0 | 0 | 8 |
| `m21tab.wk3` after | 8 | 7 (4 exact, 3 within tolerance) | 1 | 0 |

The tolerance cases are the 10-byte stored results, which carry more bits than a double.

The whole corpus (17 files) now has 888 formulas: 883 matched, 1 mismatched, 4 unverifiable.

## Every cell that is not matched

**m21tab.wk3 V44 (mismatched).** The formula is `L44/C44`. The file holds no record for C44 (C45 = 13.158 and C46 = 14.688 exist; the independent walker `tests/unit/helpers/wk3-scan.ts` agrees). The engine gives ERR. The stored result 0.012281069011234387 = 0.176 / 14.33, so C44 held about 14.33 at the last recalculation and was cleared afterwards. This is a finding about the file, not a decoder error. It stays mismatched; no value was changed. `tests/differential/verify/wk3-fixtures.test.ts` asserts it.

**fixtures/wk3-sheets/wk3-sheets.wk3, sheet Totals (synthetic, written by `scripts/gen-fixtures.ts`).**

- C2 = A1+B1+C1 = 60.5: matched.
- D2 = +B:B1: reads sheet B. Unverifiable, `wk3-formula-not-decoded`, with a message that names sheet B by its letter.
- E2 uses token 0x63, which no table here holds: unverifiable, `unknown-opcode`.

The other unverifiable cells of the corpus are in WK1 and WKS files (README table); none is a WK3 cell of the real files.
