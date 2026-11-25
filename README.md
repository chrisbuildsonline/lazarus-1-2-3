# Lazarus 1-2-3

Raise your dead Lotus 1-2-3 spreadsheets: every formula re-derived in a modern file and checked cell by cell against the numbers the original file remembers.

Built for [Kiroween 2026](https://kiroween.devpost.com/). Submissions close 2026-12-04.

## Quick start

Requires [bun](https://bun.sh) and Node (tested with bun 1.4.2 and Node 24; Vitest and Playwright start under Node).

```sh
git clone https://github.com/chrisbuildsonline/lazarus-1-2-3.git
cd lazarus-1-2-3
bun install
bun run lazarus fixtures --verify          # inventory and verify every fixture
bun run lazarus fixtures/ksbase/KSBASE.WK1 --xlsx ksbase.xlsx --report ksbase.html
bun run build && bun run preview           # the browser app on http://localhost:4173
```

To run the checks: `bun run typecheck`, `bun run test`, and for the browser tests `bunx playwright install chromium` once, then `CI=1 bun run e2e`. Or run the app and the checks in Docker (see "Run in Docker" below).

## What it does

You drop in a Lotus 1-2-3 worksheet or a dBase table. Lazarus 1-2-3 parses the binary records, rebuilds every formula as a modern expression, and writes a clean XLSX. Then it recalculates the whole sheet with its own engine and compares each result with the cached value stored inside the original file. Every cell is marked matched, mismatched or unverifiable. Old macros, such as the brace keystroke language and slash commands, are translated into a plain-English step list that a human must approve. The output is the workbook plus a provenance report listing what was proven and what was not.

## Measured on the fixture corpus

Measured by running `bun run lazarus fixtures --verify` and by parsing each file with `parseWorkbook` from `src/parser`. The corpus has 17 spreadsheet files: 8 real files from public sources and 9 synthetic test files made by `scripts/gen-fixtures.ts`. Each has a `LICENSE.txt` next to it and an entry in `fixtures/manifest.json`.

| File | Format | Origin | Cells | Formulas | Matched | Mismatched | Unverifiable |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| `ksbase/KSBASE.WK1` | WK1 | real | 1,250 | 160 | 160 | 0 | 0 |
| `lotus123-wks/testLotus123.wks` | WKS | real | 33 | 10 | 10 | 0 | 0 |
| `libreoffice-wks-functions/gnome647171-1.wks` | WKS | real | 7 | 4 | 3 | 0 | 1 |
| `census-delaware-1992/92stlde.wk1` | WK1 | real | 357 | 0 | 0 | 0 | 0 |
| `format-corpus-peytrend/PEYTREND.WK3` | WK3 | real | 1,034 | 0 | 0 | 0 | 0 |
| `noaa-ala-wai-m3/m3.wk3` | WK3 | real | 2,373 | 675 | 675 | 0 | 0 |
| `noaa-ala-wai-m21/m21tab.wk3` | WK3 | real | 61 | 8 | 7 | 1 | 0 |
| `natural-earth-land/ne_110m_land.dbf` | DBF | real | 381 values | 0 | 0 | 0 | 0 |
| 7 synthetic WK1 files | WK1 | synthetic | 132 | 28 | 27 | 0 | 1 |
| `wk3-sheets/wk3-sheets.wk3` | WK3 | synthetic | 18 (3 sheets) | 3 | 1 | 0 | 2 |
| `dbf-table/dbf-table.dbf` | DBF | synthetic | 29 values | 0 | 0 | 0 | 0 |
| **All 17 files** | | | **5,675** | **888** | **883** | **1** | **4** |

- The five real Lotus files with formulas hold 857 formulas: 855 recalculate to the number the file stored, 1 is mismatched and 1 is unverifiable. The unverifiable one, in `gnome647171-1.wks`, returns text ("Odd" or "Even"), and the parser does not read a stored text result yet.
- The two NOAA files are Lotus 1-2-3 Release 3 worksheets of sediment cores from the Ala Wai Canal, Hawaii (1991, NOAA NCEI data set G02887, public domain). All 675 formulas of `m3.wk3` match (484 exactly, 191 within the documented tolerance: the file stores 10-byte results). In `m21tab.wk3`, V44 is `L44/C44`, but the file holds no C44 (C45 and C46 are there), so 1-2-3 itself would give ERR today. The stored 0.01228 means C44 held about 14.33 when the sheet was last recalculated and was cleared after that. That is a real finding about the file, not a decoding error, and it stays mismatched.
- The 7 synthetic WK1 files are `basic-values`, `dates`, `formulas`, `functions`, `labels`, `macros` and `mixed`. Their 27 test formulas all match. The 28th, on A10 of `macros.wk1`, uses an opcode on purpose that the engine does not know, so it is unverifiable and goes to the approval queue.
- In the synthetic WK3 file, `Totals!C2` (A1+B1+C1) matches. D2 reads a cell on another sheet, which is not followed yet (`wk3-formula-not-decoded`), and E2 uses a token no table here holds (`unknown-opcode`); both keep their stored result.
- Before WK3 formulas were decoded, all 683 formulas of the two NOAA files were unverifiable. Now 682 match and 1 is mismatched.
- DBF counts are values only, without the field-name row. A table has no formulas, so it has nothing to verify. `ne_110m_land.dbf` reads as 127 records and 3 fields (127 text, 254 numbers). `dbf-table.dbf` has 7 records, one of them deleted and left out, and 6 fields.
- All 11 WK1 and WKS files (4 real, 7 synthetic) round-trip through the XLSX writer: reading the workbook back with exceljs returns every cell's value, formula text and stored result, and no extra cell (`tests/differential/xlsx/roundtrip.test.ts`).

## What is built

**Readers.** `src/parser` has `parseWk1` (WK1 and WKS), `parseWk3`, `parseDbf` and `parseWorkbook`, which picks the reader from the bytes, never the file name. The WK3 record layouts were read from two independent open-source readers (LibreOffice and Gnumeric). The BOF version word and the sheet-name record rest on LibreOffice alone. Sources, line by line, are in `.kiro/specs/wk3-dbf-readers/evidence.md`. `PEYTREND.WK3` (openpreserve format corpus, CC0) has no formulas; the two NOAA files have 683.

**Formulas and verification.** `src/formula` decodes the RPN tokens of a WK1/WKS formula, and of a WK3 formula with the Release 3 token table (`src/formula/opcodes-wk3.ts`, read from LibreOffice's `lotform.cxx` and Gnumeric's `lotus-formula.c`), and prints an Excel formula. `src/verify` recalculates the sheet with its own deterministic engine (cycle detection, the documented tolerance in one file) and classifies every formula cell as matched, mismatched or unverifiable with a reason. The stored values are the oracle and are never changed. A WK3 workbook gets one result per sheet. A WK3 formula that reads only its own sheet is recalculated and compared like a WK1 one; a formula that reads another sheet is unverifiable with the reason `wk3-formula-not-decoded`, and named-range and error-reference tokens stop decoding with a reason, never a guessed match.

**XLSX and report.** `src/xlsx` writes each formula with the number the file remembered, never the recalculated one, and the same input gives byte-identical output. Only `src/xlsx/exceljs-adapter.ts` imports exceljs. `src/report` builds the provenance report as JSON and as a self-contained HTML page. A WK3 workbook gets one worksheet per sheet. A DBF table is written as read: field names in row 1, deleted records left out. The writer and the report page also run in Chromium with no network request.

**Browser app** (`bun run build`, then `bun run preview`). The Summon view takes one file, several files or a whole folder (dropped, or chosen with "Choose file" and "Choose folder"), or "Summon the sample". Parsing, verification and hashing run in a Web Worker. The Sheet view shows the percentage verified, the matched, mismatched and unverifiable counts with a proof bar, the grid with a status on every formula cell (a status list on phones), filters by status, and a cell drawer with both formulas and both values. A WK3 workbook gets one tab per sheet. A DBF table shows "No formulas" and the number of values as read. The app downloads the XLSX and the report as HTML or JSON. A batch gets a file list at the left.

Measured in the Playwright tests: the sample shows 160 matched, 0 mismatched, 0 unverifiable, 100.0% verified. Every request in a full session is a GET for the page or a file under `/assets/`, and a fetch to another origin is blocked by the page's Content-Security-Policy. axe finds no violation on any view. The longest main-thread task while a generated 5,000-formula sheet is raised was 94.0 ms and 105.0 ms in two full runs of the suite (limit 200 ms). A full 8,192-row by 256-column sheet keeps fewer than 2,000 grid cells in the page.

**Macros.** For a WK1 or WKS file, `src/macro` reads the range names (NAME records), finds the macros (a name of a backslash and one letter, such as `\0` or `\P`, plus unnamed blocks of labels that start with `{` or `/`), and splits each one into steps: brace keys such as `{GOTO}A1~` ("Go to A1") and `{CALC}` ("Press Calc (F9)"), Enter (`~`) and typed text. The Release 2 menu tree could not be sourced (see `.kiro/specs/macro-translator/evidence.md`), so a slash command such as `/PPRA1..D8~GQ` is listed key by key as "Unknown menu key" steps instead of "Print > Printer > Range".

Each macro, and each formula opcode the engine does not know, becomes an item in the approval queue of the Macros step (the tab next to Sheet). You approve or reject it with the buttons or, while the list has focus, with A, R and Z to undo. Macros are never run. Approving records your decision in the JSON and HTML reports and changes no cell, total or XLSX byte. An approved unknown opcode stays unverifiable.

A model only explains. The app first looks up a recorded explanation, then asks Ollama on `http://localhost:11434` if it is running (optional; a page not served from localhost needs `OLLAMA_ORIGINS` set to its origin), and otherwise says "Explanation unavailable: the local model is not running. The steps above are complete." The request holds the macro text and step labels or the opcode, never a cell value. `fixtures/macros/macros.wk1` has two named macros (`\0`, `\P`), one unnamed block and one unknown opcode on A10, so its queue shows four waiting items. Its `recorded-explanations.json` is text written by hand to stand in for a model and is shown as "recorded fixture". On the real fixtures the reader finds 9 range names in `KSBASE.WK1` and no macro in any of them.

**Limits**, as the app says them: "This version reads WK1, WKS and WK3 worksheets and dBase tables. WK3 formulas are checked when they read only their own sheet; a formula that reads another sheet keeps its stored result. Macros in WK1 and WKS files are listed as steps for you to approve. They are never run, and macros in WK3 files are not read yet." A summon takes at most 500 files of at most 32 MiB each. The app has no Report tab yet (the report is a download), and approval decisions last until the page is closed.

The sample behind "Summon the sample" is `fixtures/ksbase/KSBASE.WK1`, a real Lotus 1-2-3 WK1 file from openpreserve/format-corpus by Johan van der Knijff, CC0-1.0. Its source and license are in `fixtures/ksbase/LICENSE.txt`.

## Demo

`docs/demo-script.md` is the demo, scene by scene, on the shipped fixtures: the sample with 160 of 160 formulas matched, one formula cell in the drawer, a real WKS file with one unverifiable cell and its reason, the macro approval queue (an approval changes no cell), and the downloads. `e2e/demo-script.spec.ts` runs those scenes in the app, so the script cannot promise what the app does not do. `docs/devpost.md` is the Devpost write-up, with the numbers above.

## Tests

2,001 unit, property and differential tests in 175 files (`bun run test`) and 68 Playwright tests in 19 files (`CI=1 bun run e2e`), all passing, plus a clean `bun run typecheck`.

- Unit tests mirror `src/` under `tests/unit`.
- Differential tests (`tests/differential`) compare the recalculated value with the cached value of every fixture, and round-trip the XLSX.
- Property tests (`tests/property`, fast-check) check that the WK1, WK3 and DBF readers, the formula translator, the verifier, the XLSX writer and the macro reader never throw on arbitrary or mutated bytes, and cover round trips and RPN to Excel.
- The Playwright specs in `e2e/` drive the built app in Chromium, run axe, check the request log and take the screenshots in `e2e/screenshots`.

## Stack

- TypeScript (strict), React 19 and Vite 8. The app runs fully in the browser. There is no backend: `bun run build` writes static files to `dist/`.
- Web Workers for parsing, verification and hashing.
- exceljs 4.4.0 for XLSX output, behind one adapter file.
- Vitest with fast-check, Playwright with @axe-core/playwright.
- A small stdio MCP server, lotus-oracle, on `@modelcontextprotocol/sdk`, run with bun.
- Optional: a local model (Ollama on localhost:11434, or a recorded fixture), used only to explain macros and unknown opcodes, behind the approval queue.
- A Docker image that serves the app, and two more for the checks.

## Scripts

Run with `bun run <script>`:

- `dev`: Vite dev server
- `build`: production build into `dist/`
- `preview`: serve the production build on `0.0.0.0`, port `$PORT` (default 4173)
- `typecheck`: `tsc --noEmit` (strict)
- `test`: Vitest, whole suite under `tests/`
- `test:watch`: Vitest in watch mode
- `e2e`: Playwright specs under `e2e/` (builds and previews the app)
- `oracle` / `oracle:mcp`: start the lotus-oracle MCP server on stdio (see below)
- `lazarus <path> [--json] [--verify]`: inventory a file or folder, one line per file with path, format (wk1, wks, wk3, dbf or unknown), size and sha256. With `--verify` it also parses each WK1, WKS, WK3 and DBF file, recalculates its formulas and adds the matched, mismatched and unverifiable counts (stored values are never changed). Example: `bun run lazarus fixtures --verify`
- `lazarus <file> [--xlsx <out.xlsx>] [--report <out.json|out.html>]`: for one WK1, WKS, WK3 or DBF file, write the XLSX workbook and/or the provenance report (JSON or a self-contained HTML page, chosen by the extension). Both outputs are built in memory and written only when all succeed. An unreadable input, or one that is not a Lotus worksheet or dBase table, exits 1; a bad flag, a missing path, a folder, or an output that is the input exits 2. Example: `bun run lazarus fixtures/ksbase/KSBASE.WK1 --xlsx /tmp/ksbase.xlsx --report /tmp/ksbase.html`
- `verify:golden`: regenerate `tests/differential/verify/golden.json`, the measured verification counts of the real fixtures (keeps the human-written findings)
- `gen:fixtures`: regenerate the synthetic fixtures
- `check:diff`, `check:manifest`, `check:opcodes`, `check:pii`: run one slice of the test suite each (see Kiro hooks below)
- `docker:app`: build the Docker image and serve the app on port 4173
- `docker:test`, `docker:e2e`: run the checks in Docker (see below)

## Run in Docker

The app, with nothing to install but Docker and no key or account:

```sh
docker build -t lazarus . && docker run --rm -p 4173:4173 lazarus
```

Open http://localhost:4173 and press "Summon the sample" (the bundled `KSBASE.WK1`), or drop in any file from `fixtures/`. The default (last) target of the `Dockerfile`, `app`, runs `bun run build` and then `bun run preview`, which serves `dist/` on `0.0.0.0` at `$PORT` (4173 unless set; the port is strict, so a taken port is an error instead of another port). `bun run docker:app` runs the same two commands.

To run the checks in Docker:

- `docker build --target test -t lazarus-1-2-3:test . && docker run --rm lazarus-1-2-3:test` (`bun run docker:test`) builds the `test` target (Node 24 slim with bun 1.4.2, user `node`) and runs `bun run typecheck && bun run test` in it.
- `docker build --target e2e -t lazarus-1-2-3:e2e . && docker run --rm --ipc=host lazarus-1-2-3:e2e` (`bun run docker:e2e`) builds the `e2e` target (Microsoft's Playwright 1.65.1 image, which has Chromium, user `pwuser`) and runs `bun run e2e` with `CI=1`, so Playwright builds and serves its own preview inside the container.
- To run the Playwright suite against a running app container instead, give its URL: `BASE_URL=http://localhost:4173 CI=1 bunx playwright test e2e/seance-sample.spec.ts`.

Every image installs from `bun.lock` with `bun install --frozen-lockfile` and runs as a non-root user, because the CLI and MCP tests make a file unreadable with `chmod 000` and expect an error, which root would not get. `tests/unit/docker/dockerfile.test.ts` checks that the targets exist, that the last one builds and serves the app on port 4173, that all run as a non-root user, that the test targets set `CI=1`, that the Playwright image matches the installed `@playwright/test`, and that these commands match `package.json`.

## Kiro

Each feature started as a spec, and everything Kiro reads is in `.kiro/`.

**Specs** (`.kiro/specs/<name>/`): each has `requirements.md`, `design.md` and `tasks.md`; six also have an `evidence.md` with the sources and measurements behind their decisions. Eleven are listed here; 269 of their 270 tasks are ticked (the last is the final gate of `wk3-formulas`, which waits for the whole suite to be green again):

- `scaffold`: project scaffold and test gate
- `fixtures`: fixture corpus, manifest and licenses
- `wk1-parser`: WK1 and WKS record parser
- `formula-translator`: formula token decoder and Excel translator
- `verification-engine`: recalculation engine and cell classification
- `xlsx-writer`: XLSX writer and provenance report
- `seance-ui`: the browser app
- `wk3-dbf-readers`: WK3 and DBF readers
- `macro-translator`: macro steps, approval queue and local model explainer
- `lotus-oracle-mcp`: the MCP server below
- `wk3-formulas`: WK3 formula tokens, decoded and verified against the NOAA files

**Steering** (`.kiro/steering/`): `product.md` (users and the proof-first promise), `tech.md` (stack, commands, test gate), `structure.md` (module layout and import rules) and `ai-boundaries.md` (the model never touches a number) are always included. `lotus-format.md` (record and formula format notes) is included for files under `src/parser`, `src/formula`, `mcp`, `tests` and `fixtures`, and `design.md` (visual rules) for `src/ui`, `e2e`, `index.html` and CSS. `design/DESIGN.md` turns the design steering into tokens and screen layouts.

**Hooks** and **MCP**: see the next two sections.

## Kiro hooks

Four agent hooks in `.kiro/hooks/`, made with kiro-cli. Each runs one `bun run` script, which you can also run by hand:

- `parser-differential-tests.kiro.hook`: when a file under `src/parser/` is saved, `bun run check:diff` runs the differential tests in `tests/differential`.
- `fixture-manifest-check.kiro.hook`: when a file is created under `fixtures/`, `bun run check:manifest` checks that every WK1, WKS, WK3 and DBF file is listed in `fixtures/manifest.json` with matching sha256 and counts and a `LICENSE.txt` next to it, and that the generated fixtures still match their generator.
- `opcode-coverage-check.kiro.hook`: when a file under `src/formula/` or `src/verify/` is saved, `bun run check:opcodes` checks that every opcode in the table decodes and translates to Excel (only `@ERR` has no Excel form), that no translator rule names a function the table lacks, that the evaluator covers exactly the table's functions, and that the WK3 table has the WK1 functions with the same numbers and marks confirmed only the tokens a real WK3 file shows.
- `fixture-pii-scan.kiro.hook`: when a file under `fixtures/` is saved, `bun run check:pii` scans every fixture for personal data, with a reviewed allowlist.

`tests/unit/kiro/hooks.test.ts` checks that every hook parses and only runs scripts that `package.json` has.

## lotus-oracle MCP server

A small stdio MCP server (`mcp/lotus-oracle/server.ts`) for developer tools. Its three tools are thin wrappers over `src/`: they parse, decode and verify with the same code as the app, call no model and make no network request. They read the files you name and never write.

- `opcode_lookup { opcode }`: a WK1/WKS formula opcode (`80` or `"0x50"`) from the opcode table: kind, name or operator, arity, `confirmed` or `candidate`, and the source. An opcode not in the table is an error result that says cells using it stay unverifiable.
- `verify_file { path }`: parses a WK1, WKS, WK3 or DBF file and recalculates its formulas. Per sheet the matched, mismatched and unverifiable counts; per formula cell the status, reason, Excel and Lotus formula, stored and recalculated value; and the parser diagnostics. Example: `{ "path": "fixtures/libreoffice-wks-functions/gnome647171-1.wks" }` gives 3 matched and 1 unverifiable of 4.
- `diff_workbooks { left, right }`: compares two files sheet by sheet (paired by position) and lists the cells only in one and the cells whose kind, value, label, stored result or Excel formula changed.

A missing, unreadable or larger than 32 MiB file, or one that is not a Lotus or dBase file, gives an error result, and the server keeps running. Only JSON-RPC goes to stdout; logs go to stderr.

Run it with `bun run oracle:mcp` (or `bun mcp/lotus-oracle/server.ts`). Kiro picks it up from `.kiro/settings/mcp.json`, which starts `bun mcp/lotus-oracle/server.ts` from the project root; give an absolute path there if your Kiro starts elsewhere. The integration test `tests/unit/mcp/lotus-oracle.test.ts` spawns the server through the SDK's stdio client and calls every tool.

## License

MIT, see LICENSE.
