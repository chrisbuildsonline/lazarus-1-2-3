---
inclusion: always
---

# Tech

## Stack

- TypeScript (strict), React + Vite, runs fully in the browser.
- Web Workers for parsing and recalculation. Keep the UI thread free.
- bun is the package manager and runner. Do not use npm, yarn or pnpm.
- XLSX writer library (SheetJS-compatible or exceljs). Wrap it in `src/xlsx` so it can be swapped.
- Vitest for unit, differential and property-based tests (fast-check). Playwright for e2e.
- `mcp/lotus-oracle`: small Node MCP server with tools for opcode lookup, verify a file, and diff two workbooks.
- Static hosting only. No backend.

## Privacy constraints

- User files are read with the File API and never sent anywhere. No network calls that carry file contents or derived data.
- No analytics, no remote fonts or scripts at runtime. Bundle everything.
- LLM calls (macro explanation, unknown-opcode suggestions) go to local Ollama at `http://localhost:11434/v1` (OpenAI-compatible) or to a recorded fixture. Never a paid API. See ai-boundaries.md.

## Commands

Run everything with `bun run <script>`:

- `dev`: Vite dev server
- `build`: production build
- `typecheck`: `tsc --noEmit`
- `test`: Vitest, whole suite
- `test:watch`: Vitest watch
- `e2e`: Playwright
- `oracle`: start the lotus-oracle MCP server
- `lazarus <path> [--json] [--verify]`: inventory a file or folder (path, format, size, sha256). With `--verify` it also parses each WK1/WKS file and adds matched, mismatched and unverifiable counts. Run as `bun run lazarus <path> [--json] [--verify]`.
- `verify:golden`: regenerate `tests/differential/verify/golden.json` (measured verification counts of the real fixtures).

If a script does not exist yet, add it to package.json rather than calling the tool directly.

## Test gate

A change is done only when all three hold:

1. A failing test came first (red), then the code that makes it pass.
2. The whole suite is green: `bun run test`.
3. `bun run typecheck` is clean.

Test types:

- Unit: record decoding, token decoding, serial dates.
- Differential: recalculated value versus cached value from the fixture. A fixture mismatch is a bug in us, or a documented `mismatched` expectation.
- Property-based (fast-check): parse/serialize round trips, RPN to Excel formula, engine arithmetic invariants, and "parser never throws on arbitrary bytes; it returns an error result".
- e2e: drop a fixture, see the XLSX and the report, confirm no network request carried file data.

## Conventions

- Parsers are pure functions over `Uint8Array`/`DataView`, little-endian, bounds-checked. They return results with diagnostics instead of throwing on malformed input.
- Numeric comparison tolerance lives in one place in `src/verify` and is documented in the report.
- Prefer small modules and explicit types. No `any` without a comment saying why.
