# Lazarus 1-2-3

Raise your dead Lotus 1-2-3 spreadsheets: every formula re-derived in a modern file and checked cell by cell against the numbers the original file remembers.

Built for [Kiroween 2026](https://kiroween.devpost.com/). Submissions close 2026-12-04.

## What it does

You drop in a Lotus 1-2-3 worksheet or a dBase table. Lazarus 1-2-3 parses the binary records, rebuilds every formula as a modern expression, and writes a clean XLSX. Then it recalculates the whole sheet with its own engine and compares each result with the cached value stored inside the original file. Every cell is marked matched, mismatched or unverifiable. Old macros, such as the brace keystroke language and slash commands, are translated into a plain-English step list that a human must approve. The output is the workbook plus a provenance report listing what was proven and what was not. [fill in measured result] on our fixture corpus.

## Stack

TypeScript, React with Vite, runs fully in the browser; Web Workers for parsing and recalculation; Vitest for differential tests; SheetJS-style XLSX writer (or exceljs) for output; a small Node MCP server (lotus-oracle); an LLM API used only for macro explanation and unknown-opcode suggestions, behind an approval queue; static hosting.

## License

MIT, see LICENSE.
