---
inclusion: always
---

# Structure (planned)

```
src/
  parser/      WKS/WK1 reader implemented (parseWk1 in src/parser); DBF and WK3 later. Bytes in, typed records plus diagnostics out.
  formula/     RPN token decoder, Excel translator and printer implemented (translateFormula in src/formula, chaining decodeRpn, toExcelAst and printExcel); deterministic engine later.
  verify/      Implemented: tolerance, values, dates, ops, functions (lists, math, finance, lookup, decimal), evaluate, graph (Tarjan cycle detection), recalc, classify, report, index (verifySheet, verifyBytes). Provenance report UI and file output later.
  xlsx/        Workbook model to XLSX. The only module that imports the writer library.
  macro/       Brace keystroke and slash-command parser, plain-English step list, approval state.
  cli/         The `lazarus` inventory CLI (lazarus.ts entry, inventory.ts logic). Lists path, format, size, sha256. With `--verify` it parses and verifies cells via verify-summary.ts.
  ui/          React components, design tokens, worker clients.
  workers/     Web Worker entry points: verify.worker.ts, with its message types and handler in verify-protocol.ts.
mcp/
  lotus-oracle/  Node MCP server: opcode lookup, verify a file, diff two workbooks. Reuses src/parser, src/formula, src/verify.
fixtures/
  <name>/      Sample .wk1/.wks/.dbf plus expected.json and a LICENSE note.
tests/         Vitest: unit/, differential/, property/ (mirrors src/).
e2e/           Playwright specs.
.kiro/steering/  These files.
```

## Rules

- Dependencies point one way: `ui` -> `verify` -> `formula` -> `parser`, with `workers` -> `verify` and `cli` -> `verify`. `parser` and `formula` never import React, the DOM, or the writer library.
- Shared code between the app and `mcp/lotus-oracle` lives in `src/` and is imported, not copied.
- Every fixture directory has a `LICENSE` note stating the source, author, license and whether it may be redistributed. No note, no commit.
- Fixtures with real personal data are never committed. Use synthetic or openly licensed files.
- Test files mirror the source path: `src/formula/rpn.ts` -> `tests/unit/formula/rpn.test.ts`.
