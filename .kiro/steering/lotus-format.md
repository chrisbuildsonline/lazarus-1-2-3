---
inclusion: fileMatch
fileMatchPattern: "{src/parser/**,src/formula/**,mcp/**,tests/**,fixtures/**}"
---

# Lotus WK1 format notes

Treat these as working notes. Confirm every table entry against a real fixture or the lotus-oracle opcode lookup before relying on it. When in doubt, mark the cell `unverifiable`.

## Record framing

The file is a flat sequence of records. All integers are little-endian.

```
opcode  uint16
length  uint16   (byte count of the body that follows)
body    length bytes
```

Always bounds-check `length` against the remaining bytes. Skip unknown opcodes by length and report them as diagnostics.

## Key records

| Opcode | Name | Body |
|---|---|---|
| 0x0000 | BOF | version uint16 (0x0404 = release 1 / WKS, 0x0406 = release 2 / WK1; see BOF version below) |
| 0x0001 | EOF | empty |
| 0x0006 | DIMENSIONS | first col, first row, last col, last row (4 x uint16) |
| 0x000D | INTEGER | format u8, col u16, row u16, value int16 |
| 0x000E | NUMBER | format u8, col u16, row u16, IEEE 754 double (8 bytes) |
| 0x000F | LABEL | format u8, col u16, row u16, prefix char, text, 0x00 |
| 0x0010 | FORMULA | format u8, col u16, row u16, cached double (8 bytes), formula length u16, RPN token stream |

### BOF version

Evidence from real fixtures:

- `.wk1` files carry 0x0406: `fixtures/ksbase/KSBASE.WK1`, `fixtures/census-delaware-1992/92stlde.wk1`.
- `.wks` files carry 0x0404: `fixtures/lotus123-wks/testLotus123.wks`, `fixtures/libreoffice-wks-functions/gnome647171-1.wks`.
- LibreOffice `sc/source/filter/lotus/filter.cxx` maps 0x0404 to release 1 (WKS) and 0x0406 to release 2 (WK1).
- 0x0405 is Symphony. Treat it as unknown. Gnumeric also names 0x0406 as Symphony 2, so the version word alone is ambiguous; confirm with the file extension and the records present.

Decide the format from the version word, not only the file extension, and report a disagreement as a diagnostic.

The FORMULA cached double is the oracle for verification. Read it exactly; do not round it.

## Label prefix characters

First byte of the LABEL text:

- `'` left aligned
- `"` right aligned
- `^` centered
- `\` repeat the following text across the cell
- `|` non-printing (print-range line)

The prefix is not part of the visible text. Keep it in the model so alignment can be reproduced.

## Formula tokens

The stream is RPN (postfix), terminated by a return token. Decode into an AST, then emit Excel syntax. Expected token groups:

- operands: 8-byte double constant, 2-byte integer, null-terminated string, single cell reference, range reference
- operators: negate, add, subtract, multiply, divide, power, comparisons, AND/OR/NOT, concatenation
- parentheses marker (affects only display; do not lose it)
- function tokens: fixed argument count for most, a count byte for variadic ones (e.g. @SUM)

Cell references carry relative/absolute flags in the high bits of the column and row words. Bit 15 set means the reference is relative. When relative, the column value is a signed 8-bit offset from the formula cell, and in WK1 the row value is a signed 13-bit offset. Resolve offsets against the formula cell's position before emitting. Preserve absolute references as `$` in the Excel output. Do not hard-code the opcode table from memory: record each opcode with a source note, and keep unknown ones as `unverifiable` with the raw byte.

### Opcodes confirmed by fixtures

The differential test `tests/differential/formula/fixtures.test.ts` decodes all 201 formulas in the wk1 and wks fixtures with status ok. The opcodes the real fixtures use, each also named by LibreOffice `lotform.cxx` and the Lotus WSFF5 file format note: 0x00 number, 0x01 cell reference, 0x02 range, 0x03 return, 0x04 parentheses, 0x05 integer, 0x06 string, 0x09 add, 0x0B multiply, 0x0E equals, 0x14 AND, 0x2F MOD (2 arguments), 0x33 FALSE (no arguments), 0x3B IF (3 arguments), and 0x50 SUM, 0x52 COUNT and 0x58 STD, these three followed by an argument count byte. Evidence per cell is in `.kiro/specs/formula-translator/evidence.md`. The source of every table entry is in `src/formula/opcodes.ts`. Every other opcode in the table stays candidate until a real fixture shows it.

- Relative column words differ between files. `testLotus123.wks` writes them without sign extension (0x80FE for minus 2), while `KSBASE.WK1` sign extends (0xBFFB for minus 5). Reading the low 8 bits as signed handles both. The decoder reports the first form as a reserved-bits-set warning.
- `gnome647171-1.wks` C2 uses STD. Its cached value 0.75 for 10 and 11.5 is the population standard deviation, so STD maps to Excel STDEVP.

## @functions to Excel

Map names one to one where semantics are identical (@SUM -> SUM, @AVG -> AVERAGE, @MIN, @MAX, @COUNT, @IF -> IF, @ROUND -> ROUND, @ABS, @INT, @SQRT, @LN, @LOG, @EXP, @MOD, @PMT, @PV, @FV, @NPV, @IRR, @VLOOKUP, @HLOOKUP, @DATE, @DAY, @MONTH, @YEAR).
Where semantics differ (e.g. @INT truncation vs Excel INT on negatives, @ROUND on halves, @COUNT on blanks and labels, @@, string functions), write a differential test first and document the difference.
Volatile functions (@NOW, @TODAY, @RAND) are always `unverifiable`.

## Dates

Lotus date serials count days from 1900-01-01 = 1 and wrongly treat 1900 as a leap year, so serial 60 is the nonexistent 1900-02-29. Excel's 1900 date system has the same quirk, so serials from 61 onward are the same number in both. Serials 1 to 59 are the same too. Serial 60 has no real date: keep the number, do not convert it, and flag it in the report. Never convert dates through JavaScript `Date` without handling this.

Algorithm in one line: serial 1 = 1900-01-01, 1900 counts as a leap year, so serial 60 is the fictional 1900-02-29 and from serial 61 the serial is the days since 1899-12-30.

## WK3

Sources, line by line, in `.kiro/specs/wk3-dbf-readers/evidence.md` (LibreOffice `sc/source/filter/lotus` = LO, Gnumeric `plugins/lotus-123` = GN; copies in `docs/sources/wk3/`). The reader's table is `src/parser/wk3-records.ts`. All little-endian.

| Opcode | Name | Body | Source |
|---|---|---|---|
| 0x0000 | BOF | 26 bytes: version u16 0x1000, sub u16 0x0004, 22 more | LO filter.cxx 162-171, lotimpop.cxx 57-79. **One secondary source** for 0x1000 (GN names 0x1002+ only) |
| 0x0001 | EOF | empty | LO lotread.cxx |
| 0x0016 | LABEL | row u16, sheet u8, col u8, prefix u8, text, 0x00 | LO lotimpop.cxx 218-239; GN lotus.c 2132-2141 |
| 0x0017 | NUMBER | address (4), 10-byte extended precision | LO lotimpop.cxx 241-258, ftools.cxx 42-108; GN lotus.c 2161-2168 |
| 0x0018 | SMALLNUM | address (4), i16 packed: bit 0 clear = word >> 1 (integer); set = (word >> 4) x 5000, 500, /20, /200, /2000, /20000, /16, /64 by (word >> 1) & 7 | LO tool.cxx 104-126; GN lotus.c 909-922 |
| 0x0019 | FORMULA | address (4), 10-byte cached result, RPN to the end of the record | LO lotimpop.cxx 279-288; GN lotus.c 2374-2395 |
| 0x001B | sheet name (subtype 14000) | subtype u16 14000, sheet u16, name, 0x00 | LO lotread.cxx, lotimpop.cxx 353-371. **One secondary source** |

Differences from WK1: no format byte in cell records; the address is row u16, sheet u8, column u8; numbers are 80-bit extended (significand u64 with explicit integer bit, then sign and 15-bit exponent, bias 16383); FORMULA has no RPN length word; several sheets per file. Real file: `fixtures/format-corpus-peytrend/PEYTREND.WK3` (CC0, no formulas).

### WK3 formulas

Decoded by `decodeRpn(rpn, origin, "wk3")` with `src/formula/opcodes-wk3.ts`. Sources: LO `lotform.cxx` (`LotusToSc::Convert` with `bWK3`, `IndexToTypeWK123`, `ReadSRD`) and GN `lotus-formula.c` (`lotus_parse_formula_new`, `get_new_cellref`, `functions_lotus`); copies in `docs/sources/wk3/`. Evidence and hand-decoded examples: `.kiro/specs/wk3-formulas/evidence.md`.

| Token | Operand | Meaning |
|---|---|---|
| 0x00 | 10 bytes | extended-precision constant |
| 0x01 | relbits u8, row u16, sheet u8, col u8 | cell reference, coordinates stored as they are |
| 0x02 | relbits u8, two 4-byte corners | range; relbits bits 0-2 first corner, 3-5 second |
| 0x03, 0x04 | none | return, parentheses |
| 0x05 | i16 | packed small number (same packing as SMALLNUM) |
| 0x06 | up to NUL | string |
| 0x07 to 0x0B | | named and error references: not read, `decode-error` |
| 0x0E to 0x1E | none | negate, + - * / ^, = <> <= >= < >, AND, OR, NOT, unary plus, concatenation |
| 0x1F to 0x5A | as WK1 | functions, WK1 numbers and arities |

Only nine tokens are `confirmed` by the two NOAA files: 0x01, 0x03, 0x04, 0x05, 0x0F, 0x10, 0x11, 0x12, 0x1D. All others, and every function, are `candidate`.

Relbits finding: LO reads bit 0 as column relative and bit 1 as row relative; GN reads them swapped. `m3.wk3` shows LO is right: relbits 6 (column absolute, row relative) keeps column C and follows the row in the U and V formulas.

A reference whose sheet byte is not the formula's own sheet is a foreign reference: `unverifiable` with `wk3-formula-not-decoded`. A token in no table is `unknown-opcode`.

## ERR and NA stored doubles (rule S27)

A stored double with sign 0, exponent 0x7FF and fraction 0 is ERR (+Infinity). Sign 1 with the same exponent and fraction is NA (-Infinity). Exponent 0x7FF with a non-zero fraction is the STRING pattern: do not read it as a number. Finding in `docs/verify-evidence.md`: no fixture contradicts this. KSBASE.WK1 has six NUMBER cells holding `7ff0000000000000` (ERR), none read by a formula. No fixture holds the NA pattern, so that half is untested. gnome647171-1.wks A5 stores `7ff0ffffffffffff`, the STRING pattern, for a formula that returns text. The full rules are in `.kiro/specs/verification-engine/design.md`.

## Macros

Sources, status and gaps are in `.kiro/specs/macro-translator/evidence.md`. No Release 2 manual page could be read (the archive.org Release 2.2 Reference is access-restricted). The online sources are Release 3.1, Release 4 for Windows and the 123elf wiki, so nothing here is a confirmed Release 2 fact unless it says so.

| Fact | Status |
|---|---|
| NAME record, opcode 0x0B, body 24 bytes: bytes 0-15 NUL-terminated ASCII name, then start column, start row, end column, end row as u16 little-endian. Example REVENUES = `00 00 00 00 01 00 03 00` (A1..B4). | Two sources: `design/refs/lotus/WSFF2-mettalogic.TXT` lines 301-350, and LibreOffice `OP_NamedRange` in `sc/source/filter/lotus/op.cxx`. Not yet checked against the real fixtures. |
| Symphony names use a different record with a type byte after the four u16. | One source (LibreOffice `OP_SymphNamedRange`). |
| A macro name is a backslash plus one letter. | One source each in Release 3.1 (sample macros `\G`, `\S`, `\D`, `\R`, `\C`, `\M`) and Release 4 (`\a`). Not Release 2. |
| `\0` autoexec, and "a macro reads down the column and stops at a blank or non-label cell". | Not found. Do not rely on them. |
| Release 2 menu tree, prompts per leaf, whether a menu stays open. | Not found. Release 3.1 contents list the same command names but say nothing on prompts. |
| {BRANCH}, {MENUBRANCH}, {WAIT}: names and meaning. | Two sources (Release 3.1 Quick Reference p. 18-19, Release 4 docs). |
| {IF}, {QUIT}, {RETURN}, {GETLABEL}, {GETNUMBER}, {FOR}, {GOTO}, {BEEP}. | One source each. Release 4 spells {GET-LABEL}. |
| Other brace names of the macro-translator requirements (DOWN, UP, LEFT, RIGHT, EDIT, CALC, ?, HOME, END, ESC, BS, DEL, PGUP, PGDN, NAME, ABS, WINDOW, QUERY, TABLE, GRAPH, LET, BLANK). | Not found as brace spellings. |
| A `/` after typed text is literal. | Not found. |

Rule: a macro label, test or table entry may use only a fact marked two sources or one source above. Everything else is a generic `command` step or `unknown-key`.
