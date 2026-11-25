# Devpost write-up

The text for the Devpost form. Every number here was measured with `bun run lazarus fixtures --verify` and is the same as in the README ("Measured on the fixture corpus"). `tests/unit/docs/placeholders.test.ts` fails if a fill-in placeholder is left in this file or any other write-up.

## Inspiration

A dead technology is only dead when nobody builds a bridge to it. We asked which dead technology still holds money, evidence and history, and the answer was the spreadsheet. From the mid 1980s to the mid 1990s, Lotus 1-2-3 was where accountants, clerks and scientists kept their models. Those files survive on floppies, old file servers and in executors' boxes. Modern tools either refuse to open them or convert them without saying whether a formula changed on the way. When the file is evidence in an estate, an audit or a lawsuit, silently wrong is worse than unreadable. We wanted a resurrection you can prove.

## What it does

You drop in a Lotus 1-2-3 worksheet (WK1, WKS or WK3) or a dBase table (DBF). Lazarus 1-2-3 parses the binary records, rebuilds every WK1 and WKS formula, and every WK3 formula that reads only its own sheet, as an Excel formula, and writes an XLSX. Then it recalculates the sheet with its own engine and compares each result with the value the original file stored. Every formula cell is marked matched, mismatched or unverifiable, with a reason. Macros (the brace keystroke language and slash commands) become a list of plain steps that a person approves or rejects; they are never run, and a decision changes no cell. You leave with the workbook and a provenance report that says what was proven and what was not. Everything runs in the browser, and the file never leaves your machine.

On our corpus of 17 files (8 real files from public sources, 9 synthetic test files), the app reads 5,675 cells and 888 formulas: 883 matched, 1 mismatched and 4 unverifiable. The 5 real Lotus files with formulas hold 857 of them, and 855 recalculate to the number the file stored. One is unverifiable: a formula that returns text, which the parser does not read yet. One is mismatched, and it is a finding: in a 1991 Lotus 1-2-3 Release 3 worksheet of sediment cores from NOAA, V44 divides by C44, but the file no longer holds C44, so the stored result cannot be re-derived from it. Before WK3 formulas were decoded, all 683 formulas of the two NOAA files were unverifiable. The sample in the app, `KSBASE.WK1`, shows 160 of 160 formulas matched.

## How we built it

A TypeScript parser reads the WK1 and WKS records, the WK3 records and the DBF header and fields, choosing the reader from the bytes, not the file name. A formula module decodes the Lotus RPN tokens, with the WK1 token table and the Release 3 one (read from LibreOffice's and Gnumeric's Lotus import filters), and prints an Excel formula. A small deterministic engine recalculates the sheet only to verify it, with cycle detection and one documented tolerance. An XLSX writer keeps the value the file remembered, never the recalculated one, and a report module writes the provenance report as JSON and HTML. The React app runs the parsing, verification and hashing in a Web Worker and makes no request to another origin, which its Content-Security-Policy enforces. A model is used in one place only: to explain a macro or an unknown opcode in words, from a local Ollama if one is running. It never sees a cell value and never touches a number. A small MCP server, lotus-oracle, gives Kiro opcode lookup, verification of a file and a diff of two workbooks, with the same code as the app.

## How we used Kiro

- **Specs.** Each feature started as a spec in `.kiro/specs`: 11 specs (scaffold, fixtures, wk1-parser, formula-translator, verification-engine, xlsx-writer, seance-ui, wk3-dbf-readers, macro-translator, lotus-oracle-mcp, wk3-formulas), each with requirements, design and tasks, and 269 of their 270 tasks are ticked. Six also keep an `evidence.md` with the sources behind their decisions, such as which open-source readers confirm a WK3 record layout.
- **Steering.** `product.md`, `tech.md`, `structure.md` and `ai-boundaries.md` are always included; `ai-boundaries.md` says the model never computes, rounds or edits a number. `lotus-format.md` is included for the parser, formula, MCP, test and fixture files, and `design.md` for the UI.
- **Hooks.** Four agent hooks: saving a file under `src/parser/` runs the differential tests, creating a fixture checks the fixture manifest, saving a file under `src/formula/` or `src/verify/` checks opcode coverage, and saving a fixture scans it for personal data.
- **MCP.** `.kiro/settings/mcp.json` starts lotus-oracle, so Kiro can check a parser change against the real fixtures instead of reasoning about it.

## Challenges

The format is old but not simple. Lotus stores formulas as compact token streams, keeps its own date serials (including the day 1900-02-29 that never existed), and stores some results, such as text, in records of their own. Matching the stored values exactly meant treating every function as a tested contract. Finding real files we may share was the second challenge: the corpus uses only files with a clear license (CC0, public domain, MPL-2.0 or MIT), each with a `LICENSE.txt` and a manifest entry, plus synthetic files built from the documented record layouts. The third was keeping the model away from the arithmetic, so every number on screen comes from code.

## Accomplishments

Correctness is a visible feature, not a claim: every formula cell carries a status, and the report states plainly what we could not verify. 855 of the 857 formulas in the real Lotus files recalculate to what the file stored; the one we cannot prove is shown as such, and the one that disagrees is shown as mismatched with both numbers, not hidden. The app needs no account, no upload and no key, and runs from one Docker command. The checks are 2,000+ unit, property and differential tests and a Playwright suite that also runs this demo, scene by scene.

## What we learned

The best way to use a model on legacy material is to fence it in: let it read and explain, and let deterministic code decide what is true. Specs suit binary formats well, because acceptance criteria written per record and per opcode turn into tests almost one to one. A steering file is where a hard rule, such as "the model never computes a number", survives a long build.

## What's next

WK3 formulas that read another sheet keep their stored values for now; following references across sheets is the next step. After that: reading the text results of string formulas, the Release 2 menu tree for slash commands, Quattro Pro, Symphony and VisiCalc readers, and a signed provenance report for a whole folder.
