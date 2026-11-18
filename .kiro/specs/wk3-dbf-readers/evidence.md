# Evidence: WK3 and DBF layouts (F9, task 1)

Sources were read from their files, not from memory. Copies are in `docs/sources/wk3/` (LibreOffice core master, MPL-2.0; Gnumeric master, GPL-2/3) and `docs/sources/dbf/`. Line numbers refer to those copies.

- LO = LibreOffice `sc/source/filter/lotus/*` and `sc/source/filter/inc/*`, `sc/source/filter/ftools/ftools.cxx`.
- GN = Gnumeric `plugins/lotus-123/lotus.c`, `lotus-types.h`, `lotus.h`. GN cites the published note https://www.mettalogic.co.uk/tim/l123/l123r4.html (lotus.c line 11).

LO and GN are two independent readers. An item both agree on is called *two sources*. An item only one of them has is marked *one secondary source*.

## WK3 table

| Item | Layout (all little-endian) | Sources | Status |
|---|---|---|---|
| Record framing | opcode u16, length u16, body | LO lotread.cxx record loop; GN lotus.c record reader | two sources, same as WK1 |
| BOF 0x0000 | body 26 bytes: version u16 = 0x1000, sub-version u16 = 0x0004, then 22 bytes (range, save count, ids, flags) | LO filter.cxx 162-171 (`case 0x1000`, `nVersNr == 0x0004 && nRecLen == 26` gives `eWK3`); LO lotimpop.cxx 57-79 (`Bof`, `nFileCode == 0x1000`, `nFileSub == 0x0004` gives `WK3`) | **one secondary source** for the 0x1000 word. GN lotus.h 7-13 names 0x1002 to 0x1005 only and sends any other version, 0x1000 included, to its release 3+ reader (lotus.c 2625-2640) |
| Cell address | row u16, sheet u8, column u8 (4 bytes) | LO lotimpop.hxx 83-93 (`Read(ScAddress&)`); GN lotus.c 2133-2135, 2153-2155, 2162-2164, 2375-2377 (`row = LE16(data)`, `sheet = data[2]`, `col = data[3]`) | two sources |
| LABEL 0x16 | address, prefix u8, text up to NUL | LO lotread.cxx (`case 0x0016` LABELCELL), lotimpop.cxx 218-239 (`Read(aA); Read(cAlign); Read(aLabel)`); GN lotus-types.h 53 (`LOTUS_LABEL2 0x16`), lotus.c 2132-2141 (string from offset 5) | two sources |
| NUMBER 0x17 | address, 10-byte extended precision | LO lotread.cxx (`case 0x0017`), lotimpop.cxx 241-258, lotimpop.hxx 68 and 121 ("read 10-byte IEEE"), ftools.cxx 42-108 (`ReadLongDouble`); GN lotus-types.h 54 (`LOTUS_EXTENDED_FLOAT 0x17`), lotus.c 2161-2168 (size >= 14, value at offset 4) | two sources |
| SMALLNUM 0x18 | address, i16 packed value (below) | LO lotread.cxx (`case 0x0018`), lotimpop.cxx 260-277, tool.cxx 104-126 (`SnumToDouble`); GN lotus-types.h 55, lotus.c 909-922 (`lotus_smallnum`), 2152-2159 | two sources |
| FORMULA 0x19 | address, 10-byte cached result, RPN bytes to the end of the record (no length word) | LO lotimpop.cxx 279-288 (`Read(aAddr); Skip(10); n -= 14`); GN lotus-types.h 56 (`LOTUS_FORMULA3 0x19`), lotus.c 2374-2395 (value at 4, formula at 14, `len - 14`) | two sources |
| Sheet name 0x1B / 14000 | body: subtype u16 = 14000 (0x36B0), sheet index u16, name up to NUL | LO lotread.cxx (`case 0x001b`, `case 14000: NamedSheet()`), lotimpop.cxx 353-371 (`Read(nTmpTab)` u16, `Read(aName)`) | **one secondary source**. GN reads 0x1B as STYLE and names sheets from record 0x204 (lotus.c 2331-2339, used by its release 4+ files); it ignores 0x23 NAMED_SHEET |
| EOF 0x0001 | empty | LO lotread.cxx (`case 0x0001`) | same as WK1 |
| DIMENSIONS | none found for WK3 in either reader | - | not used; `declaredDimensions` stays null |
| Extended precision | 64-bit significand with explicit integer bit (bytes 0-7), exponent 15 bits bias 16383 and sign bit (bytes 8-9); value = significand x 2^(exponent - 16383 - 63) | LO ftools.cxx 42-108 (bit map at 45-55, `nExp - 16446`); GN lotus.c 925-937 (`ldexp(mant, exp - 63)`, `exp = (signexp & 0x7fff) - 16383`) | two sources |

### Small number (0x18)

- Bit 0 clear: the value is the 16-bit word shifted right by one, as a signed number (range -16384 to 16383). Both sources (LO tool.cxx `nVal >> 1`, GN `value_new_int(d >> 1)`). The reader makes it an `integer` cell.
- Bit 0 set: mantissa = word >> 4 (signed), factor index = (word >> 1) & 7. LO multiplies by {5000, 500, 0.05, 0.005, 0.0005, 0.00005, 0.0625, 0.015625}. GN multiplies by 5000 and 500 and divides by 20, 200, 2000, 20000, 16 and 64. These are the same numbers, but `3 * 0.05` is `0.15000000000000002` and `3 / 20` is `0.15`. The reader divides (GN), which gives the double nearest the exact value, and makes the cell a `number`.

### Differences from WK1

1. BOF version word 0x1000 with a 26-byte body (WK1: 0x0404 / 0x0406, 2 bytes).
2. Cell records have **no format byte** and a 4-byte address with a sheet byte: row u16, sheet u8, column u8 (WK1: format u8, col u16, row u16).
3. Numbers are 10-byte extended precision (WK1: 8-byte double).
4. New opcodes: 0x16 LABEL, 0x17 NUMBER, 0x18 SMALLNUM, 0x19 FORMULA (WK1: 0x0F, 0x0E, 0x0D, 0x10).
5. FORMULA has no RPN length word; the RPN runs to the end of the record (WK1: length u16).
6. Several sheets per file, named by record 0x1B subtype 14000.

### Candidates of design.md that were wrong

- "LABEL: format u8, address, ...": there is no format byte in any WK3 cell record (both sources).
- "FORMULA: ... status word, RPN length u16, RPN": no status word and no length word (both sources).
- "SMALLNUM: packed 16-bit value" as an integer up to 32767: the packed integer range is -16384 to 16383, and odd words are scaled numbers. The synthetic fixture uses 16383, not 32767.
- "Sheet or range names, not confirmed": the sheet name record is 0x1B subtype 14000 (one source).

### Open points

- GN lotus.c 939-955 (`lotus_load_treal`, one secondary source) reads exponent bytes `FF FF` with byte 7 = 0x00, 0xC0, 0xD0, 0xE0 as blank, ERR, NA and string results. The reader does not special-case them: they convert as NaN or infinity by the rule of `float80.ts`, and every WK3 formula is `unverifiable` anyway.
- 0x14 ERRCELL and 0x15 NACELL (address only, both sources) are skipped with `skipped-opcode` in this version.
- WK3 RPN is not decoded (out of scope).

## Real WK3 search

| Where | Result |
|---|---|
| openpreserve/format-corpus `office/spreadsheet/wk3/PEYTREND.WK3` | **found**, 18,635 bytes, sha256 `9741c1393cf98ff660d7faf50f12143608c5a5d662280163bdd1d82c03b7c6a0`, starts `00 00 1a 00 00 10`. Folder readme: "Creative Commons CC0: Public Domain Dedication ... Johan van der Knijff has waived all copyright and related or neighboring rights to this work." Committed as `fixtures/format-corpus-peytrend/PEYTREND.WK3` |
| Apache Tika test documents `testLotus123.wk3` | byte-identical to PEYTREND.WK3 (Apache-2.0); not added twice |
| LibreOffice `sc/qa/unit/data` | no .wk3 (only .123 and .wks) |
| Gnumeric samples and tests | no .wk3 |
| Apache POI test-data | no .wk3 |
| SheetJS test_files | could not be downloaded |
| census.gov `fas03crt.wk3`, NOAA `g8btab.wk3` | found, US Government works; not committed in this feature (one real file is enough for requirement 64, and these were not reviewed for personal data) |

Full search notes: `docs/sources/wk3-corpus/SEARCH-REPORT.md`.

## DBF offsets

Published description: Independent Software, "DBF and DBT/FPT File Structure" (http://www.independent-software.com/dbase-dbf-dbt-file-format.html), with the language driver byte from the Xbase note linked by the Library of Congress FDD000325. Copy in `docs/sources/dbf/dbf-layout.md`.

| Field | Offset, width | Published | design.md |
|---|---|---|---|
| version | 0, 1 | 0x00, 1 | same |
| last update YY MM DD (YY = year - 1900) | 1, 3 | 0x01, 3 | same |
| record count | 4, u32 | 0x04, 4 | same |
| header length | 8, u16 | 0x08, 2 | same |
| record length | 10, u16 | 0x0A, 2 | same |
| language driver / code page | 29, 1 | 0x1D, 1 | same |
| field descriptor | 32 bytes from 32: name 0..10, type 11, length 16, decimals 17 | same | same |
| terminator | 0x0D | 0x0D | same |
| deletion flag | 0x20 live, 0x2A deleted | same | same |
| end of file | 0x1A | 0x1A | same |

`ne_110m_land.dbf` bytes agree: `tests/unit/parser/dbf-robustness.test.ts` reads 127 records and 3 fields with no error from these offsets, the same counts the independent `tests/unit/helpers/dbf-scan.ts` gives for the manifest.
