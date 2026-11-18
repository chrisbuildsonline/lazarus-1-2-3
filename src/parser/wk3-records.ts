// The WK3 record table. Every entry names its source; see .kiro/steering/lotus-format.md (WK3)
// and .kiro/specs/wk3-dbf-readers/evidence.md. LO = LibreOffice sc/source/filter/lotus,
// GN = Gnumeric plugins/lotus-123. No entry without a source line.

// source: LO filter.cxx 162-171 and lotimpop.cxx 57-79 (one secondary source; GN lotus.h names 0x1002+ only)
export const WK3_VERSION = 0x1000;
// source: LO filter.cxx 166 (`nRecLen == 26`)
export const WK3_BOF_LENGTH = 26;

export type Wk3Decoder = "label" | "number80" | "small" | "formula80" | "names";

export const WK3_BOF = 0x0000; // source: LO lotread.cxx, same framing as WK1
export const WK3_EOF = 0x0001; // source: LO lotread.cxx `case 0x0001`

/** Cell and name records: opcode -> decoder. The 4-byte address is row u16, sheet u8, col u8 (LO lotimpop.hxx 83-93; GN lotus.c 2133-2135). */
export const WK3_RECORDS: ReadonlyMap<number, { name: string; decoder: Wk3Decoder }> = new Map([
  // source: LO lotimpop.cxx 218-239; GN lotus-types.h 53, lotus.c 2132-2141
  [0x0016, { name: "LABEL", decoder: "label" }],
  // source: LO lotimpop.cxx 241-258, ftools.cxx 42-108; GN lotus-types.h 54, lotus.c 2161-2168
  [0x0017, { name: "NUMBER", decoder: "number80" }],
  // source: LO lotimpop.cxx 260-277, tool.cxx 104-126; GN lotus-types.h 55, lotus.c 909-922 and 2152-2159
  [0x0018, { name: "SMALLNUM", decoder: "small" }],
  // source: LO lotimpop.cxx 279-288; GN lotus-types.h 56, lotus.c 2374-2395
  [0x0019, { name: "FORMULA", decoder: "formula80" }],
  // source: LO lotread.cxx `case 0x001b` subtype 14000, lotimpop.cxx 353-371 (one secondary source)
  [0x001b, { name: "SHEETNAME", decoder: "names" }],
]);

/** Subtype word of record 0x1B that carries a sheet name (LO lotread.cxx `case 14000`). */
export const WK3_SHEET_NAME_SUBTYPE = 14000;

/** Divisors (negative) and factors of the packed small number when bit 0 is set (GN lotus.c 909-922; LO tool.cxx 104-126 has the same values as factors). */
export const WK3_SMALL_SCALE: readonly number[] = [5000, 500, -20, -200, -2000, -20000, -16, -64];
