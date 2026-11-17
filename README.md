# Lazarus 1-2-3

Raise your dead Lotus 1-2-3 spreadsheets: every formula re-derived in a modern file and checked cell by cell against the numbers the original file remembers.

Built for [Kiroween 2026](https://kiroween.devpost.com/). Submissions close 2026-12-04.

## What it does

You drop in a Lotus 1-2-3 worksheet or a dBase table. Lazarus 1-2-3 parses the binary records, rebuilds every formula as a modern expression, and writes a clean XLSX. Then it recalculates the whole sheet with its own engine and compares each result with the cached value stored inside the original file. Every cell is marked matched, mismatched or unverifiable. Old macros, such as the brace keystroke language and slash commands, are translated into a plain-English step list that a human must approve. The output is the workbook plus a provenance report listing what was proven and what was not.

Built so far: the WK1/WKS parser, the formula translator, the verification engine (run it with `bun run lazarus <path> --verify`), the XLSX writer and the provenance report as JSON and a self-contained HTML page (run them with `bun run lazarus <file> --xlsx out.xlsx --report out.html`). The writer keeps every stored value: each formula is written with the number the file remembered, never the recalculated one, and the same input gives byte-identical output. All 10 WK1/WKS fixtures (4 real, 6 synthetic) round-trip: re-reading the workbook with exceljs gives back every cell's value, formula text and stored result, and no extra cell. The writer and the report page also run in Chromium with no network request. The report UI and macro translation are not built yet. Measured on our fixture corpus: of the 174 formulas in the three real Lotus files, 173 recalculate to exactly the number the file stored (KSBASE.WK1 160 of 160, testLotus123.wks 10 of 10, gnome647171-1.wks 3 of 4), none is mismatched, and 1 is unverifiable: a formula that returns text ("Odd" or "Even"), whose stored text the parser does not read yet. All 27 synthetic test formulas match as well.

## Stack

TypeScript, React with Vite, runs fully in the browser; Web Workers for parsing and recalculation; Vitest for differential tests; exceljs (4.4.0, behind one adapter file) for XLSX output; a small Node MCP server (lotus-oracle); an LLM API used only for macro explanation and unknown-opcode suggestions, behind an approval queue; static hosting.

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
- `oracle`: start the lotus-oracle MCP server (prints "not built yet" until it exists)
- `lazarus <path> [--json] [--verify]`: inventory a file or folder, one line per file with path, format (wk1, wks, dbf or unknown), size and sha256. With `--verify` it also parses each WK1/WKS file, recalculates its formulas and adds the matched, mismatched and unverifiable counts (stored values are never changed). Example: `bun run lazarus fixtures --verify`
- `lazarus <file> [--xlsx <out.xlsx>] [--report <out.json|out.html>]`: for one WK1/WKS file, write the XLSX workbook and/or the provenance report (JSON or a self-contained HTML page, chosen by the extension). Both outputs are built in memory and written only when all succeed; a non-Lotus input exits 1, a bad flag or an output that is the input exits 2. Example: `bun run lazarus fixtures/ksbase/KSBASE.WK1 --xlsx /tmp/ksbase.xlsx --report /tmp/ksbase.html`
- `verify:golden`: regenerate `tests/differential/verify/golden.json`, the measured verification counts of the real fixtures (keeps the human-written findings)

## License

MIT, see LICENSE.
