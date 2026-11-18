# dBASE III / IV `.dbf` file layout

**Primary source (layout tables below):**  
[DBF and DBT/FPT File Structure — Independent Software](http://www.independent-software.com/dbase-dbf-dbt-file-format.html)  
(Aug 6, 2018; covers FoxBase, Visual FoxPro, dBASE III, and dBASE IV)

**Also consulted (Library of Congress FDD and linked layouts):**  
- [Library of Congress FDD000325 — dBASE Table File Format (DBF)](https://www.loc.gov/preservation/digital/formats/fdd/fdd000325.shtml)  
- [Xbase Data file (`*.dbf`) — clicketyclick.dk](http://www.clicketyclick.dk/databases/xbase/format/dbf.html) (LoC cites this for dBASE III–5; used here for the language-driver / code-page byte at `0x1D`)  
- [Data File Header Structure for the dBASE Version 7 Table File](https://www.dbase.com/Knowledgebase/INT/db7_file_fmt.htm) (LoC-linked official layout; language driver ID at byte 29; deletion flag / `0x1A` EOF wording)

---

## Header (dBASE III / IV)

From Independent Software — *Header* table:

| Offset | Size | Type   | Sample value | Description |
| ------ | ---- | ------ | ------------ | ----------- |
| 0x00   | 1    | byte   | 0x03         | Version byte |
| 0x01   | 3    | string | `990307`     | Date of last update in `YYMMDD` format (where `YY` is equal to year minus 1900) |
| 0x04   | 4    | uint32 | 15           | Number of records in table |
| 0x08   | 2    | uint16 | 400          | Number of bytes in the header |
| 0x0a   | 2    | uint16 | 64           | Number of bytes in a record |
| 0x0c   | 3    |        |              | Reserved |
| 0x0f   | 13   |        |              | Reserved for dBASE IIIPlus/LAN |
| 0x1c   | 4    |        |              | Reserved |
| 0x20   |      |        |              | Field descriptors |
| …      | 1    | byte   | 0x0d         | Field terminator |

### Language driver / code page byte

Independent Software’s header table leaves `0x1C`–`0x1F` as a 4-byte reserved block. The Xbase layout (LoC-linked, valid for dBASE III–5) breaks that out as:

| Offset     | Size | Description |
| ---------- | ---- | ----------- |
| 0x1C / 28  | 1    | MDX flag (dBASE IV) |
| **0x1D / 29** | **1** | **Language driver** (FoxPro / DOS–Windows code-page ID) |
| 0x1E–0x1F  | 2    | Reserved |

The dBASE Version 7 header likewise places **Language driver ID** at **byte 29** (1 byte).

---

## Field descriptor (32 bytes each)

From Independent Software — *Field descriptor structure* table.  
**Field descriptor size: 32 bytes** (fixed).

| Offset | Size | Type   | Sample value | Description |
| ------ | ---- | ------ | ------------ | ----------- |
| 0x00   | 11   | string | `PRODID `    | Field name (padded with NULL-bytes) |
| 0x0b   | 1    | char   | `C`          | Field type |
| 0x0c   | 4    | uint32 |              | Field data address in memory |
| 0x10   | 1    | byte   | 10           | Field length |
| 0x11   | 1    | byte   | 4            | Field decimal count |
| 0x12   | 2    |        |              | Reserved for dBASE IIIPlus/LAN |
| 0x14   | 1    | byte   |              | Work area ID |
| 0x15   | 2    |        |              | Reserved for dBASE IIIPlus/LAN |
| 0x17   | 1    | byte   |              | SET FIELDS flag |
| 0x18   | 8    |        |              | Reserved |

After the last field descriptor: **field descriptor array terminator `0x0D`**.

---

## Record structure

From Independent Software — *Record structure* table:

| Offset | Size | Type  | Sample value | Description |
| ------ | ---- | ----- | ------------ | ----------- |
| 0x00   | 1    | char  | `*`          | Deletion marker |
| 0x01   |      | mixed |              | Record data |

Deletion marker: **space (`0x20`)** = not deleted; **asterisk (`0x2A`)** = deleted.

End of file: may be marked by **EOF character `0x1A`** (sometimes absent).

---

## Quoted offsets and widths (requested fields)

| Item | Offset | Width | Notes |
| ---- | ------ | ----- | ----- |
| Version byte | `0x00` | 1 byte | e.g. `0x03` = FoxBase 2.x / dBASE III |
| Last update date (YYMMDD) | `0x01` | 3 bytes | YY = year − 1900 |
| Number of records | `0x04` | 4 bytes (uint32, little-endian) | |
| Header length | `0x08` | 2 bytes (uint16) | Bytes in header; also start offset of records |
| Record length | `0x0A` | 2 bytes (uint16) | Bytes per record |
| Language driver / code page | `0x1D` (byte 29) | 1 byte | From Xbase / dBASE 7 layouts (see above) |
| Field descriptor size | — | **32 bytes** each | Array starts at `0x20` |
| Field name | descriptor `0x00` | 11 bytes | ASCII, NULL-padded |
| Field type | descriptor `0x0B` | 1 byte | ASCII type code |
| Field length | descriptor `0x10` | 1 byte | |
| Field decimal count | descriptor `0x11` | 1 byte | |
| Header terminator | after last descriptor | 1 byte | **`0x0D`** |
| Record deletion flag | record `0x00` | 1 byte | **space `0x20`** / **asterisk `0x2A`** |
| End-of-file marker | end of file | 1 byte | **`0x1A`** (OEM 26) |

---

## License / rights notes (as stated by sources)

| Source | URL | Rights note |
| ------ | --- | ----------- |
| Independent Software blog post | http://www.independent-software.com/dbase-dbf-dbt-file-format.html | No explicit license stated on the page; © Independent Software (Cascais, Portugal). Saved as a factual layout extract for documentation. |
| Library of Congress FDD | https://www.loc.gov/preservation/digital/formats/fdd/fdd000325.shtml | U.S. government work; LoC format descriptions are generally public information. Compilers unaware of current licensing issues for the DBF format itself. |
| Xbase File Format Description | http://www.clicketyclick.dk/databases/xbase/format/dbf.html | Unofficial documentation cited by LoC; no explicit open-source license found on the page. |
| dBASE Version 7 file format | https://www.dbase.com/Knowledgebase/INT/db7_file_fmt.htm | Vendor knowledge-base documentation from dataBased Intelligence / dBase; proprietary product documentation. |
