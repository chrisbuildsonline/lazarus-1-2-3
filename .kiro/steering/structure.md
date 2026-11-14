---
inclusion: always
---

# Structure (planned)

```
src/
  parser/      WKS/WK1 (later WK3) record reader, DBF reader. Bytes in, typed records + diagnostics out.
  formula/     RPN token decoder, Excel formula emitter, @function name map, deterministic engine.
  verify/      Recalculate, compare to cached values, classify matched/mismatched/unverifiable, build provenance report.
  xlsx/        Workbook model to XLSX. The only module that imports the writer library.
  macro/       Brace keystroke and slash-command parser, plain-English step list, approval state.
  ui/          React components, design tokens, worker clients.
  workers/     Web Worker entry points (parse, recalc).
mcp/
  lotus-oracle/  Node MCP server: opcode lookup, verify a file, diff two workbooks. Reuses src/parser, src/formula, src/verify.
fixtures/
  <name>/      Sample .wk1/.wks/.dbf plus expected.json and a LICENSE note.
tests/         Vitest: unit/, differential/, property/ (mirrors src/).
e2e/           Playwright specs.
.kiro/steering/  These files.
```

## Rules

- Dependencies point one way: `ui` -> `verify` -> `formula` -> `parser`. `parser` and `formula` never import React, the DOM, or the writer library.
- Shared code between the app and `mcp/lotus-oracle` lives in `src/` and is imported, not copied.
- Every fixture directory has a `LICENSE` note stating the source, author, license and whether it may be redistributed. No note, no commit.
- Fixtures with real personal data are never committed. Use synthetic or openly licensed files.
- Test files mirror the source path: `src/formula/rpn.ts` -> `tests/unit/formula/rpn.test.ts`.
