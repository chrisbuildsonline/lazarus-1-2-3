# Lazarus 1-2-3

Raise your dead Lotus 1-2-3 spreadsheets: every formula re-derived in a modern file and checked cell by cell against the numbers the original file remembers.

Built for [Kiroween 2026](https://kiroween.devpost.com/). Submissions close 2026-12-04.

## What it does

You drop in a Lotus 1-2-3 worksheet or a dBase table. Lazarus 1-2-3 parses the binary records, rebuilds every formula as a modern expression, and writes a clean XLSX. Then it recalculates the whole sheet with its own engine and compares each result with the cached value stored inside the original file. Every cell is marked matched, mismatched or unverifiable. Old macros, such as the brace keystroke language and slash commands, are translated into a plain-English step list that a human must approve. The output is the workbook plus a provenance report listing what was proven and what was not.

Built so far: the WK1/WKS parser, the formula translator, the verification engine (run it with `bun run lazarus <path> --verify`), the XLSX writer and the provenance report as JSON and a self-contained HTML page (run them with `bun run lazarus <file> --xlsx out.xlsx --report out.html`). The writer keeps every stored value: each formula is written with the number the file remembered, never the recalculated one, and the same input gives byte-identical output. All 10 WK1/WKS fixtures (4 real, 6 synthetic) round-trip: re-reading the workbook with exceljs gives back every cell's value, formula text and stored result, and no extra cell. The writer and the report page also run in Chromium with no network request. Measured on our fixture corpus: of the 174 formulas in the three real Lotus files, 173 recalculate to exactly the number the file stored (KSBASE.WK1 160 of 160, testLotus123.wks 10 of 10, gnome647171-1.wks 3 of 4), none is mismatched, and 1 is unverifiable: a formula that returns text ("Odd" or "Even"), whose stored text the parser does not read yet. All 27 synthetic test formulas match as well.

The browser app is built too (`bun run build`, then `bun run preview`). The Summon view takes one file, several files or a whole folder (dropped, or chosen with "Choose file" and "Choose folder"), or "Summon the sample". Parsing, verification and hashing run in a Web Worker. The Sheet view shows the percentage verified, the matched, mismatched and unverifiable counts with a proof bar, the grid with a status on every formula cell (a status list on phones), filters by status, and a cell drawer with both formulas and both values. It downloads the XLSX and the report as HTML or JSON. A batch gets a file list at the left. Measured in the Playwright tests: the sample shows 160 matched, 0 mismatched, 0 unverifiable, 100.0% verified; every request in a full session is a GET for the page or a file under `/assets/`, and a fetch to another origin is blocked by the page's Content-Security-Policy; axe finds no violation on any view; the longest main-thread task while a generated 5,000-formula sheet is raised was 94.0 ms and 123.0 ms in two full parallel runs of the suite (limit 200 ms); a full 8,192-row by 256-column sheet keeps fewer than 2,000 grid cells in the page. The suite: 1,865 unit, property and differential tests in 166 files and 64 Playwright tests, all passing (measured by running `bun run test` and `CI=1 bun run e2e`).

WK3 and dBase readers: `src/parser` now has `parseWk3`, `parseDbf` and `parseWorkbook`, which picks the reader from the bytes. The WK3 record layouts were read from two independent open-source readers (LibreOffice and Gnumeric); the BOF version word and the sheet-name record rest on LibreOffice alone. Sources, line by line, are in `.kiro/specs/wk3-dbf-readers/evidence.md`. One real WK3 is in the corpus, `PEYTREND.WK3` from the openpreserve format corpus (CC0): it reads as one sheet of 1,034 cells (5 labels, 1,029 numbers, no formulas), the same counts an independent walker in the tests gives. It has no formulas, so WK3 formula reading is checked only against our own synthetic file. WK3 formulas are not decoded; they keep their stored result. The real `ne_110m_land.dbf` reads as 127 records, 3 fields, 381 values (127 text, 254 numbers). The app, `--verify`, `--xlsx` and `--report` take WK3 and DBF files: a WK3 workbook gets one tab per sheet and one worksheet per sheet in the XLSX; each WK3 formula is unverifiable with the reason `wk3-formula-not-decoded` and is written as its stored value, so a WK3 file can never show a green headline. A DBF has no formulas: the app shows "No formulas" and the number of values shown as read, and the XLSX holds the table as read (field names in row 1, deleted records left out).

Macros: for a WK1 or WKS file, `src/macro` reads the range names (NAME records), finds the macros (a name of a backslash and one letter, such as `\0` or `\P`, plus unnamed blocks of labels that start with `{` or `/`), and splits each one into steps: brace keys such as `{GOTO}A1~` ("Go to A1") and `{CALC}` ("Press Calc (F9)"), Enter (`~`) and typed text. The Release 2 menu tree could not be sourced (see `.kiro/specs/macro-translator/evidence.md`), so a slash command such as `/PPRA1..D8~GQ` is listed key by key as "Unknown menu key" steps instead of "Print > Printer > Range". Each macro, and each formula opcode the engine does not know, becomes an item in the approval queue of the Macros step (the tab next to Sheet): you approve or reject it with the buttons or, while the list has focus, with A, R and Z to undo. Macros are never run. Approving records your decision in the JSON and HTML reports and changes no cell, total or XLSX byte; an approved unknown opcode stays Unverifiable. A model only explains: the app first looks up a recorded explanation, then asks Ollama on `http://localhost:11434` if it is running (optional; a page not served from localhost needs `OLLAMA_ORIGINS` set to its origin), and otherwise says "Explanation unavailable: the local model is not running. The steps above are complete." The request holds the macro text and step labels or the opcode, never a cell value. `fixtures/macros/macros.wk1` is a generated test file with two named macros (`\0`, `\P`), one unnamed block and one unknown opcode on A10, so its queue shows four waiting items; its `recorded-explanations.json` is text written by hand to stand in for a model and is shown as "recorded fixture". On the real fixtures the reader finds 9 range names in `KSBASE.WK1` and no macro in any of them. Limits: WK1 and WKS only, no Report tab yet, and decisions last until the page is closed.

Limits, as the app says them: "This version reads WK1, WKS and WK3 worksheets and dBase tables. WK3 formulas are shown with their stored results and are not checked yet. Macros in WK1 and WKS files are listed as steps for you to approve. They are never run, and macros in WK3 files are not read yet." A summon takes at most 500 files of at most 32 MiB each. The Report view is not built yet.

The sample behind "Summon the sample" is `fixtures/ksbase/KSBASE.WK1`, a real Lotus 1-2-3 WK1 file from openpreserve/format-corpus by Johan van der Knijff, CC0-1.0. Its source and license are in `fixtures/ksbase/LICENSE.txt`.

## Stack

TypeScript, React with Vite, runs fully in the browser; Web Workers for parsing and recalculation; Vitest for differential tests; exceljs (4.4.0, behind one adapter file) for XLSX output; a small Node MCP server (lotus-oracle); an optional local model (Ollama on localhost:11434, or a recorded fixture) used only to explain macros and unknown opcodes, behind an approval queue; static hosting.

## Setup

Requires [bun](https://bun.sh).

```sh
bun install
bunx playwright install chromium   # one-time browser download for e2e
```

Scripts (`bun run <script>`):

- `dev`: Vite dev server
- `build`: production build into `dist/`
- `preview`: serve the production build
- `typecheck`: `tsc --noEmit` (strict)
- `test`: Vitest, whole suite under `tests/`
- `test:watch`: Vitest in watch mode
- `e2e`: Playwright specs under `e2e/` (builds and previews the app)
- `oracle` / `oracle:mcp`: start the lotus-oracle MCP server on stdio (see below)
- `lazarus <path> [--json] [--verify]`: inventory a file or folder, one line per file with path, format (wk1, wks, wk3, dbf or unknown), size and sha256. With `--verify` it also parses each WK1/WKS file, recalculates its formulas and adds the matched, mismatched and unverifiable counts (stored values are never changed). Example: `bun run lazarus fixtures --verify`
- `lazarus <file> [--xlsx <out.xlsx>] [--report <out.json|out.html>]`: for one WK1/WKS file, write the XLSX workbook and/or the provenance report (JSON or a self-contained HTML page, chosen by the extension). Both outputs are built in memory and written only when all succeed; a non-Lotus input exits 1, a bad flag or an output that is the input exits 2. Example: `bun run lazarus fixtures/ksbase/KSBASE.WK1 --xlsx /tmp/ksbase.xlsx --report /tmp/ksbase.html`
- `verify:golden`: regenerate `tests/differential/verify/golden.json`, the measured verification counts of the real fixtures (keeps the human-written findings)
- `check:diff`, `check:manifest`, `check:opcodes`, `check:pii`: run one slice of the test suite each (see Kiro hooks below)

## lotus-oracle MCP server

A small stdio MCP server (`mcp/lotus-oracle/server.ts`) for developer tools. Its three tools are thin wrappers over `src/`: they parse, decode and verify with the same code as the app, call no model and make no network request. They read the files you name and never write.

- `opcode_lookup { opcode }`: a WK1/WKS formula opcode (`80` or `"0x50"`) from the opcode table: kind, name or operator, arity, `confirmed` or `candidate`, and the source. An opcode not in the table is an error result that says cells using it stay unverifiable.
- `verify_file { path }`: parses a WK1, WKS, WK3 or DBF file and recalculates its formulas. Per sheet the matched, mismatched and unverifiable counts; per formula cell the status, reason, Excel and Lotus formula, stored and recalculated value; and the parser diagnostics. Example: `{ "path": "fixtures/libreoffice-wks-functions/gnome647171-1.wks" }` gives 3 matched and 1 unverifiable of 4.
- `diff_workbooks { left, right }`: compares two files sheet by sheet (paired by position) and lists the cells only in one and the cells whose kind, value, label, stored result or Excel formula changed.

A missing, unreadable or larger than 32 MiB file, or one that is not a Lotus or dBase file, gives an error result, and the server keeps running. Only JSON-RPC goes to stdout; logs go to stderr.

Run it with `bun run oracle:mcp` (or `bun mcp/lotus-oracle/server.ts`). Kiro picks it up from `.kiro/settings/mcp.json`, which starts `bun mcp/lotus-oracle/server.ts` from the project root; give an absolute path there if your Kiro starts elsewhere. The integration test `tests/unit/mcp/lotus-oracle.test.ts` spawns the server through the SDK's stdio client and calls every tool.

## Kiro hooks

Four agent hooks in `.kiro/hooks/`, made with kiro-cli. Each runs one `bun run` script, which you can also run by hand:

- `parser-differential-tests.kiro.hook`: when a file under `src/parser/` is saved, `bun run check:diff` runs the differential tests in `tests/differential`.
- `fixture-manifest-check.kiro.hook`: when a file is created under `fixtures/`, `bun run check:manifest` checks that every WK1, WKS, WK3 and DBF file is listed in `fixtures/manifest.json` with matching sha256 and counts and a `LICENSE.txt` next to it, and that the generated fixtures still match their generator.
- `opcode-coverage-check.kiro.hook`: when a file under `src/formula/` or `src/verify/` is saved, `bun run check:opcodes` checks that every opcode in the table decodes and translates to Excel (only `@ERR` has no Excel form), that no translator rule names a function the table lacks, and that the evaluator covers exactly the table's functions.
- `fixture-pii-scan.kiro.hook`: when a file under `fixtures/` is saved, `bun run check:pii` scans every fixture for personal data, with a reviewed allowlist.

`tests/unit/kiro/hooks.test.ts` checks that every hook parses and only runs scripts that `package.json` has.

## License

MIT, see LICENSE.
