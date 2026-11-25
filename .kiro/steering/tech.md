---
inclusion: always
---

# Tech

## Stack

- TypeScript (strict), React + Vite, runs fully in the browser.
- Web Workers for parsing and recalculation. Keep the UI thread free.
- bun is the package manager and runner. Do not use npm, yarn or pnpm.
- XLSX writer: exceljs 4.4.0 (chosen). Only `src/xlsx` imports it, and only one adapter file (`src/xlsx/exceljs-adapter.ts`) does, so it can be swapped. It bundles for the browser through Vite's `browser` field in its package.json, with no alias.
- Vitest for unit, differential and property-based tests (fast-check). Playwright for e2e.
- Component tests render React with react-dom/server (renderToStaticMarkup) in the Node environment of Vitest and check the markup, so no DOM library is needed. Focus, keyboard and drag and drop are tested in Playwright.
- Accessibility: @axe-core/playwright 4.14.0 (exact) runs in e2e/seance-a11y.spec.ts with the tags wcag2a, wcag2aa, wcag21a, wcag21aa and best-practice. The bar is zero serious or critical findings, with no rule disabled.
- `mcp/lotus-oracle`: small MCP server, run with bun (`bun mcp/lotus-oracle/server.ts`), with tools for opcode lookup, verify a file, and diff two workbooks.
- Static hosting only. No backend.

## Privacy constraints

- User files are read with the File API and never sent anywhere. No network calls that carry file contents or derived data.
- No analytics, no remote fonts or scripts at runtime. Bundle everything.
- LLM calls (macro explanation, unknown-opcode suggestions) go to local Ollama at `http://localhost:11434/v1` (OpenAI-compatible) or to a recorded fixture. Never a paid API. See ai-boundaries.md.
- The one allowed request that is not a same-origin GET is the optional local model at http://localhost:11434 (POST to /v1/chat/completions), sent only from the Macros view for the shown item, and allowed by the CSP connect-src 'self' http://localhost:11434.

## Commands

Run everything with `bun run <script>`:

- `dev`: Vite dev server
- `build`: production build
- `typecheck`: `tsc --noEmit`
- `test`: Vitest, whole suite
- `test:watch`: Vitest watch
- `e2e`: Playwright
- `oracle`: start the lotus-oracle MCP server
- `lazarus <file> [--json] [--verify] [--xlsx out.xlsx] [--report out.json|out.html]`: inventory a file or folder (path, format, size, sha256). With `--verify` it also parses each WK1/WKS file and adds matched, mismatched and unverifiable counts. With `--xlsx` and/or `--report` (one WK1/WKS file) it writes the XLSX workbook and the provenance report (JSON or self-contained HTML, chosen by extension). Run as `bun run lazarus <file> [--json] [--verify] [--xlsx out.xlsx] [--report out.json|out.html]`.
- `verify:golden`: regenerate `tests/differential/verify/golden.json` (measured verification counts of the real fixtures).
- `check:diff`: run `tests/differential`.
- `check:manifest`: run `tests/unit/fixtures/manifest.test.ts` and `gen-fixtures.test.ts`.
- `check:opcodes`: run `tests/unit/formula/opcode-coverage.test.ts` and `opcodes.test.ts`.
- `check:pii`: run `tests/unit/fixtures/pii.test.ts`.

If a script does not exist yet, add it to package.json rather than calling the tool directly.

## Docker

- The default (last) Dockerfile target, `app`, runs `bun run build` and then `bun run preview`. That serves `dist/` on 0.0.0.0 at `$PORT` (default 4173, strict port).
- Run it with `docker build -t lazarus . && docker run --rm -p 4173:4173 lazarus` (`bun run docker:app`).
- The `test` and `e2e` targets run the checks (`bun run docker:test`, `bun run docker:e2e`).
- `BASE_URL=<url>` points the Playwright suite at an app that is already running, such as that container. `PORT` picks the port of the preview Playwright starts.

## Hooks

- `fixture-manifest-check.kiro.hook`: on fileCreated for `fixtures/**/*`, runs `bun run check:manifest`.
- `opcode-coverage-check.kiro.hook`: on fileEdited for `src/formula/**/*.ts` and `src/verify/**/*.ts`, runs `bun run check:opcodes`.
- `parser-differential-tests.kiro.hook`: on fileEdited for `src/parser/**/*.ts`, runs `bun run check:diff`.
- `fixture-pii-scan.kiro.hook`: on fileEdited for `fixtures/**/*`, runs `bun run check:pii`.

`tests/unit/kiro/hooks.test.ts` checks that every hook parses and only runs scripts that package.json has.

## Test gate

A change is done only when all of these hold:

1. A failing test came first (red), then the code that makes it pass.
2. The whole suite is green: `bun run test`.
3. `bun run typecheck` is clean.
4. For UI work, bun run build and CI=1 bun run e2e are green too.

Test types:

- Unit: record decoding, token decoding, serial dates.
- Differential: recalculated value versus cached value from the fixture. A fixture mismatch is a bug in us, or a documented `mismatched` expectation.
- Property-based (fast-check): parse/serialize round trips, RPN to Excel formula, engine arithmetic invariants, and "parser never throws on arbitrary bytes; it returns an error result".
- e2e: the app specs in e2e/: seance-sample, seance-files (drop, pickers, folder, unsupported and corrupt files), seance-drawer (grid keys, cell drawer), seance-states (statuses, filters, phone list), seance-downloads (XLSX and report read back), seance-batch, seance-worker-failure, seance-privacy (static same-origin requests only, CSP), seance-a11y (axe, focus ring, touch targets), seance-layout (1440x900 and 390x844 screenshots, no sideways scroll, no console error) and seance-responsive (no long main-thread task on a 5,000-formula sheet, under 2,000 grid cells in the DOM), seance-wk3-dbf (a WK3 drop with sheet tabs and an unverifiable formula, a DBF drop with the as-read totals, axe and screenshots at 1440 and 390 in e2e/screenshots), seance-macros (the Macros step: approve, reject and undo by mouse and keys, the JSON report read back, the phone dialog, an offline local model, axe, screenshots macros-1440.png and macros-390.png) and demo-script (runs docs/demo-script.md scene by scene on the shipped fixtures: the sample with 160 of 160 matched, O3 in the drawer, gnome647171-1.wks with one unverifiable cell and its reason, the macros.wk1 approval queue where an approval changes no cell, and the downloads). Run them with CI=1 bun run e2e so Playwright builds and serves its own preview.
- Docs: tests/unit/docs/placeholders.test.ts fails if README.md, docs/*.md or design/*.md keeps a fill-in placeholder, or if the demo script or docs/devpost.md claims an approval turns a cell green.

## Conventions

- Parsers are pure functions over `Uint8Array`/`DataView`, little-endian, bounds-checked. They return results with diagnostics instead of throwing on malformed input.
- Numeric comparison tolerance lives in one place in `src/verify` and is documented in the report.
- Prefer small modules and explicit types. No `any` without a comment saying why.
