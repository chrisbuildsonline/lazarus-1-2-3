---
inclusion: always
---

# Structure (planned)

```
src/
  parser/      WK1/WKS, WK3 and DBF readers implemented (parseWk1, parseWk3, parseDbf); parseWorkbook picks the reader from the bytes (detectKind). Bytes in, a workbook of named sheets plus diagnostics out.
  formula/     RPN token decoder, Excel translator and printer implemented (translateFormula in src/formula, chaining decodeRpn, toExcelAst and printExcel); deterministic engine later.
  verify/      Implemented: tolerance, values, dates, ops, functions (lists, math, finance, lookup, decimal), evaluate, graph (Tarjan cycle detection), recalc, classify, report, index (verifySheet, verifyBytes), workbook (verifyWorkbook, verifyWorkbookBytes: one result per sheet; WK3 formulas unverifiable with wk3-formula-not-decoded, DBF has no formulas). Provenance report UI and file output later.
  report/      Implemented: provenance report built from verification results (build, types, features, tokens), as JSON (json.ts) and as a self-contained HTML page (html.ts, escape.ts), plus sha256.ts. No network, no external assets.
  xlsx/        Implemented: XLSX writer (writeXlsx in index.ts; plan.ts, labels.ts, zip-normalize.ts for byte-identical output). The only module that imports the writer library, and only exceljs-adapter.ts does.
  macro/       Implemented: names (NAME record walker, independent of parser/wk1.ts), detect (macro names and unnamed blocks), menu (brace key and command tables; the Release 2 menu tree is not sourced, so slash keys are unknown-key steps), steps (parseSteps), queue (approval queue) and explain (local model explainer, recorded explainer).
  cli/         The `lazarus` CLI (lazarus.ts entry, inventory.ts logic, args.ts flag parsing). Lists path, format, size, sha256. With `--verify` it parses and verifies cells via verify-summary.ts. With `--xlsx` / `--report`, export.ts parses, verifies, writes the workbook and the report.
  ui/          Implemented: the browser app. main.tsx, App.tsx, tokens.css (copy of the DESIGN.md token block), styles/app.css, copy.ts (all user-facing strings).
    model/       pure view-model functions with no React or DOM (formatting, totals, file names, entries, classification, grid model, window, grid keys, status groups, batch rows, drawer model, app reducer, layout)
    io/          worker client, dropped-entry traversal, downloads, sample fetch
    components/  React views and parts (Summon, drop zone, progress, error panel, Sheet, totals, proof bar, grid, filters, status list, drawer, batch list, toast, status pill, top bar)
    hooks/       raise, match media, focus return
  workers/     verify.worker.ts and raise.worker.ts. Message types and pure handlers (handleVerifyRequest, handleRaiseRequest, sheetToWire, sheetFromWire) are in verify-protocol.ts. The raise worker parses, verifies and hashes one file per request.
mcp/
  lotus-oracle/  Node MCP server: opcode lookup, verify a file, diff two workbooks. Reuses src/parser, src/formula, src/verify.
fixtures/
  <name>/      Sample .wk1/.wks/.dbf plus expected.json and a LICENSE note.
tests/         Vitest: unit/, differential/, property/ (mirrors src/).
e2e/           Playwright specs (seance-*.spec.ts for the app) and helpers in e2e/fixtures.
.kiro/steering/  These files.
```

## Rules

- Dependencies point one way: `ui` -> `verify` -> `formula` -> `parser`, with `workers` -> `verify` and `cli` -> `verify`. `cli` may also import `xlsx`, `report`, `verify` and `parser`, and only through `src/cli/export.ts`. `parser` and `formula` never import React, the DOM, or the writer library.
- ui never imports parseWk1, verifySheet, verifyBytes or classifySheet; the worker does that work. ui may import xlsx and report only by dynamic import() in src/ui/io/downloads.ts, so the Summon view does not load the writer. Files in src/ui/model do not import React or use document, window or navigator. tests/unit/ui/purity.test.ts checks this.
- macro imports parser (the Sheet type, a1) and the types of verify. Nothing in macro imports React, the DOM, node:*, report, xlsx, cli or workers. workers and ui import macro. report does not import macro: toReportItems returns plain objects that match ReportMacroItem structurally.
- Shared code between the app and `mcp/lotus-oracle` lives in `src/` and is imported, not copied.
- Every fixture directory has a `LICENSE` note stating the source, author, license and whether it may be redistributed. No note, no commit.
- Fixtures with real personal data are never committed. Use synthetic or openly licensed files.
- Test files mirror the source path: `src/formula/rpn.ts` -> `tests/unit/formula/rpn.test.ts`.
