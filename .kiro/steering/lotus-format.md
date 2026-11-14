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
| 0x0000 | BOF | version uint16 (0x0404 for WK1, 0x0406 for WKS) |
| 0x0001 | EOF | empty |
| 0x0006 | DIMENSIONS | first col, first row, last col, last row (4 x uint16) |
| 0x000D | INTEGER | format u8, col u16, row u16, value int16 |
| 0x000E | NUMBER | format u8, col u16, row u16, IEEE 754 double (8 bytes) |
| 0x000F | LABEL | format u8, col u16, row u16, prefix char, text, 0x00 |
| 0x0010 | FORMULA | format u8, col u16, row u16, cached double (8 bytes), formula length u16, RPN token stream |

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

Cell references carry relative/absolute flags in the high bits of the column and row words. Preserve them as `$` in the Excel output. Do not hard-code the opcode table from memory: record each opcode with a source note, and keep unknown ones as `unverifiable` with the raw byte.

## @functions to Excel

Map names one to one where semantics are identical (@SUM -> SUM, @AVG -> AVERAGE, @MIN, @MAX, @COUNT, @IF -> IF, @ROUND -> ROUND, @ABS, @INT, @SQRT, @LN, @LOG, @EXP, @MOD, @PMT, @PV, @FV, @NPV, @IRR, @VLOOKUP, @HLOOKUP, @DATE, @DAY, @MONTH, @YEAR).
Where semantics differ (e.g. @INT truncation vs Excel INT on negatives, @ROUND on halves, @COUNT on blanks and labels, @@, string functions), write a differential test first and document the difference.
Volatile functions (@NOW, @TODAY, @RAND) are always `unverifiable`.

## Dates

Lotus date serials count days from 1900-01-01 = 1 and wrongly treat 1900 as a leap year, so serial 60 is the nonexistent 1900-02-29. Excel's 1900 date system has the same quirk, so serials from 61 onward are the same number in both. Serials 1 to 59 are the same too. Serial 60 has no real date: keep the number, do not convert it, and flag it in the report. Never convert dates through JavaScript `Date` without handling this.
