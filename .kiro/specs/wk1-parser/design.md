# Design: WK1 and WKS record parser

## Layout

```
src/parser/
  wk1.ts          parseWk1(bytes): Wk1ParseResult   (record loop, record decoders)
  sheet.ts        Sheet, Cell types, cellKey, getCell, cellsInRowMajorOrder
  address.ts      a1(col, row), parseA1(text)
  diagnostics.ts  Diagnostic type, DiagnosticSink (cap + counting)
  reader.ts       bounds-checked ByteReader over a DataView
  index.ts        public exports
tests/unit/parser/
  address.test.ts  sheet.test.ts  reader.test.ts
  wk1-bof-eof.test.ts  wk1-dimensions.test.ts  wk1-integer.test.ts  wk1-number.test.ts
  wk1-label.test.ts  wk1-formula.test.ts  wk1-skip.test.ts  wk1-robustness.test.ts
tests/property/parser/wk1.property.test.ts
tests/differential/parser/wk1-manifest.test.ts
```

Dependency rule (structure.md): `parser` imports nothing outside `src/parser`. No `node:*`, no DOM. The tests may use `node:fs` and the test helpers.

Test input bytes come from `scripts/lib/wk1-writer.ts` (`writeWk1`, `bof`, `label` and so on) for valid records, and from hand-written arrays for malformed ones. The test-only walker `tests/unit/helpers/wk1-scan.ts` stays independent of `src/parser`. Only the differential test imports both.

## Types

```ts
export type Wk1Format = "wk1" | "wks" | "unknown";
export type LabelPrefix = "'" | '"' | "^" | "\\" | "|";

export type Cell =
  | { kind: "integer"; col: number; row: number; value: number }
  | { kind: "number"; col: number; row: number; value: number }
  | { kind: "label"; col: number; row: number; prefix: string; text: string }
  | { kind: "formula"; col: number; row: number; cached: number; rpn: Uint8Array };

export type Sheet = {
  format: Wk1Format;
  version: number | null;             // BOF word, null if none
  sawEof: boolean;
  declaredDimensions: { firstCol: number; firstRow: number; lastCol: number; lastRow: number } | null;
  cells: Map<number, Cell>;           // key = cellKey(col, row)
};

export type Severity = "error" | "warning" | "info";
export type Diagnostic = { severity: Severity; code: DiagnosticCode; offset: number; message: string; opcode?: number };
export type DiagnosticCode =
  | "truncated-record" | "short-record" | "missing-bof" | "unknown-version" | "missing-eof"
  | "trailing-bytes" | "unknown-label-prefix" | "duplicate-cell" | "address-out-of-range"
  | "skipped-opcode" | "diagnostics-truncated";

export type Wk1Stats = {
  records: number; cells: number; formulas: number; labels: number; numbers: number;
  skippedRecords: number; skippedByOpcode: Record<number, number>; bytesRead: number;
};
export type Wk1ParseResult = { sheet: Sheet; diagnostics: Diagnostic[]; stats: Wk1Stats };
```

`prefix` is typed `string` (one character) because requirement 22 keeps unexpected prefix bytes. `LabelPrefix` names the known five for callers.

`cellKey(col, row) = row * 65536 + col`. Both are u16, so the key is a safe integer and unique. Iteration in row-major order is `[...cells.values()].sort(byRowThenCol)`. Insertion order is not relied on.

`Uint8Array` inside `Cell` is a `slice` copy of the input. A copy keeps the model valid if the caller transfers or reuses the buffer in a worker.

## Bounds-checked reading

`ByteReader` wraps `new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)` with a `pos` and an `end`. Methods `u8`, `u16`, `i16`, `f64`, `slice(n)` return `number | null` (or `Uint8Array | null`) and never throw: each checks `pos + size <= end` first. A record body is read through a second reader whose `end` is the body end, so a decoder cannot read into the next record. Decoders return `null` on a short body. The record loop turns `null` into a `short-record` diagnostic.

This replaces `try/catch`. A top-level `try/catch` is NOT used to hide bugs. The property test is what proves no throw.

## Record loop

```
pos = 0
while pos < len:
  if len - pos < 4: truncated-record (error), break
  opcode = u16(pos); length = u16(pos+2); body = pos+4
  if length > len - body: truncated-record (error), break
  stats.records++
  next = body + length
  first record? -> if opcode != BOF: missing-bof (error), format = unknown
  switch opcode:
    0x0000 BOF   -> version, format
    0x0001 EOF   -> sawEof, trailing-bytes info if next < len, pos = len, break
    0x0006 DIM, 0x000D INT, 0x000E NUM, 0x000F LABEL, 0x0010 FORMULA -> decode
    default      -> skip: counts + one info diagnostic per distinct opcode
  pos = next
after loop: if !sawEof and no truncated-record: missing-eof (warning)
```

`pos` always increases by at least 4 per iteration, so the loop terminates on any input. A later BOF (0x0000) in the middle of the file is a skipped record, not a second version.

`bytesRead` is the offset reached when the loop ends (after EOF record included).

### Record decoders

| Opcode | Needs | Result |
|---|---|---|
| 0x0006 DIMENSIONS | body >= 8 | four u16 into `declaredDimensions` |
| 0x000D INTEGER | body >= 7 | format u8 (ignored), col u16, row u16, `i16` |
| 0x000E NUMBER | body >= 13 | col, row, `f64` read with `getFloat64(pos, true)` |
| 0x000F LABEL | body >= 6 | col, row, prefix byte, text up to first 0x00 |
| 0x0010 FORMULA | body >= 15, and `15 + rpnLen <= body` | col, row, cached `f64`, rpnLen u16, `rpn` copy |

The thresholds are the same as those in the test walker (5 + 2, 5 + 8, 5 + 1 + NUL, 5 + 8 + 2), so counts agree on all fixtures. Where the walker and the parser differ is only on malformed bytes: a FORMULA whose RPN length overruns is `short-record` in the parser (the walker still counts it). Real fixtures are expected to have no such record. If one does, the differential test fails and the discrepancy gets resolved by a human, not by loosening the parser.

LABEL: the byte at body offset 5 is the prefix. Text is the bytes from offset 6 up to the first 0x00 or the end of the body. Latin-1 decoding is a manual loop (`String.fromCharCode` per byte, in chunks), so there is no `TextDecoder` dependency and the result is identical in every runtime. A body of exactly `5 + 1` bytes with no NUL still decodes (prefix, empty text). Requirement 23 covers `prefix + 0x00`.

The `format` byte (cell format, protection) is read but not modelled in v1.

### Address checks

After decoding a cell, if `col > 255 || row > 8191`, add `address-out-of-range` (warning) and keep the cell. If `cellKey` already exists, add `duplicate-cell` (warning) and replace.

### Diagnostics sink

`DiagnosticSink.add(d)` pushes until `max` (1000 default, exported constant), then pushes one `diagnostics-truncated` and drops later ones. Stats are updated independently of the sink, so counts stay right. `skipped-opcode` uses a `Set<number>` of seen opcodes.

## Address helpers

`a1(col, row)` is bijective base-26 for the column (the same algorithm as the test helper) followed by `row + 1`. `parseA1` accepts `^[A-Za-z]+[1-9][0-9]*$`, uppercases, and returns `{ col, row }` or `null`. It rejects a column above 65535 or a row above 65536 (`null`), so the round trip `parseA1(a1(c, r))` holds over the u16 grid. The two helpers do not clamp to the WK1 grid. The out-of-range check is the parser's job.

## Differential test

For each manifest entry with format `wk1` or `wks`:

1. Read the file bytes with `node:fs`, `parseWk1` it.
2. Assert no `error` diagnostics and `sheet.format === entry.format`.
3. Assert `stats.{cells,formulas,labels,numbers}` equal `entry.counts`.
4. Assert `sheet.cells.size === stats.cells` (no duplicates in the fixtures).
5. For each `expectedValues`: look up with `parseA1`, assert kind and value. Labels compare `text`. Formulas compare `cached` with `Object.is`.
6. Compare with `scanWk1`: same cells in the same addresses, same kind, same value, same label `prefix`.
7. Assert the skipped counts are reported: for the real files, `stats.skippedRecords` is printed in the test title or a snapshot-free `console.info`, so a human sees the Quattro Pro extras that were skipped. Do not assert a fixed number for real files unless the first run records it (then assert it, with a comment naming the file).

The test enumerates the manifest at run time, so a new fixture is covered with no test edit. It also fails if the manifest has zero wk1/wks entries.

A real file with an unexpected `unknown-version` warning is a finding, not something to silence: record the version in lotus-format.md.

## Property tests (fast-check)

In `tests/property/parser/wk1.property.test.ts`:

- **Arbitrary bytes**: `fc.uint8Array({ maxLength: 4096 })` never throws, always returns `sheet`, `diagnostics`, `stats`, and `stats.cells === sheet.cells.size + duplicates`, where duplicates is the number of `duplicate-cell` diagnostics (valid while the sink has not hit its cap; the property uses inputs short enough that it does not).
- **Framed garbage**: a generator of syntactically valid record frames with random opcodes and random bodies, with random length fields too (including lengths over the remainder). Asserts no throw, `bytesRead <= input length`, and that the diagnostics offsets are within `[0, length]`.
- **Mutated fixtures**: each committed wk1/wks fixture, with random byte flips, random truncation, and random insertion or deletion. Asserts no throw. `numRuns` stays moderate so the suite stays fast.
- **Writer round trip**: generate cell specs with the existing `writeWk1` (`integer`, `number`, `label` with printable ASCII text and a known prefix, `formula` with a random RPN byte array and a finite cached double). Parse and compare each cell to its spec, including exact `cached` bits and `rpn` bytes. Doubles use `fc.double({ noNaN: true })`. Add one separate example test for NaN and infinities, compared with `Object.is`, because a NaN cached double is legal bytes.
- **Address**: `parseA1(a1(c, r))` returns `{ c, r }`, and `a1` equals the test helper's `a1`.

Seeds are printed by fast-check on failure. A failing seed becomes a plain unit test.

## Unit tests (one file per record type)

Each file writes bytes with the writer and asserts the model, plus the short-body case with a hand-cut array:

- BOF/EOF: 0x0404 gives `wks`, 0x0406 gives `wk1`, 0x0405 and 0x1234 give `unknown-version` and still parse a following INTEGER, first record not BOF gives `missing-bof`, no EOF gives `missing-eof`, bytes after EOF give `trailing-bytes`, BOF with a 1-byte body gives `short-record`.
- DIMENSIONS: values stored, 7-byte body gives `short-record`.
- INTEGER: 0, 1, -1, 32767, -32768, and a short body.
- NUMBER: 0, -2.5, 0.1 (exact bits), the maximum finite double, and a short body.
- LABEL: each of the five prefixes, an unknown prefix (warning, kept), `prefix + NUL` empty label, text with a byte at 0x80 or above, text with no NUL terminator, a body of 5 bytes.
- FORMULA: cached double and RPN bytes are exact, `rpn` is a copy (mutating the input after parse does not change it), `rpnLen` of 0, `rpnLen` overrunning the body gives `short-record`, no decoding of the RPN (arbitrary bytes accepted).
- Skip: an unknown opcode with a body is skipped by length, counted once per record and diagnosed once per opcode, and does not stop the next INTEGER from parsing. A record with `length` 0xFFFF past the end gives `truncated-record`.
- Robustness: empty array, 1, 2, 3 bytes, header-only, all 0xFF, all 0x00 (an endless run of empty BOF records must terminate and cap diagnostics).
- Sheet and address: `cellKey` uniqueness at the corners (0,0), (65535,0), (0,65535), (65535,65535), `getCell`, row-major order, `a1` and `parseA1` examples from requirement 32.

Every unit test is written red first, per tech.md.

## Decisions and trade-offs

- **Result object, no exceptions.** Matches the "return results with diagnostics" convention. `ok` is not a field. Callers check for `error` diagnostics, which keeps one source of truth.
- **Continue after an unknown version.** Chosen over refusing to parse. The user still gets cells, with a warning that later stages must carry into the report. The alternative (stop) hides data that is probably fine for 0x0405 files with the same record layouts. This is an open question in requirements.md.
- **Map keyed by number, not an array grid.** Sparse sheets are the norm and a key avoids allocating 256 x 8192 slots. A string key would allocate on every cell.
- **Counts from records, cells from the map.** `stats` follows the manifest's definition. If a file ever repeats an address, the two differ and the `duplicate-cell` diagnostic explains why.
- **Skip by length, not by table.** The parser has no opcode table for skipped records. Naming them (RANGE, WIDTH and so on) is a separate, evidence-based task, as lotus-format.md asks. The skipped counts by opcode are the evidence for that later work.
- **No `TextDecoder`.** Avoids differences in label decoding between runtimes. The cost is a small loop.

## Risks

- The test walker and the parser share an author and a spec, so they could share a mistake. Mitigation: the manifest's counts and `expectedValues` came from file bytes through a separate helper, and real fixtures from other programs (Lotus, Quattro Pro, LibreOffice outputs) are in the corpus.
- A real file may hold records after the real EOF, or records the walker treats differently from the parser (for example label bodies shorter than 6 bytes). The differential test will reveal it. Resolve by reading the bytes, not by changing counts in the manifest.
- Large inputs: the loop is linear in the input size. Memory is one `Cell` per record. Fine for WK1's size limit (about 2 MB of cell data typical). No streaming in v1.
- Latin-1 label text can differ from what the original program showed for bytes at 0x80 or above (LMBCS). Flagged under open questions, not silently converted.
