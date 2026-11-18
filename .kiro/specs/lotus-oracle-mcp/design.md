# Design: lotus-oracle MCP server

## Layout

```
mcp/lotus-oracle/
  server.ts   McpServer, three registerTool calls, StdioServerTransport. No logic.
  tools.ts    opcodeLookup, verifyFile, diffWorkbooks: plain functions, no SDK import.
tests/unit/mcp/lotus-oracle.test.ts   spawns the server, one test file
scripts/oracle.ts                     runs mcp/lotus-oracle/server.ts (was mcp/lotus-oracle/src/index.ts)
.kiro/settings/mcp.json               Kiro registration
```

Dependencies: `mcp` -> `src/parser`, `src/formula`, `src/verify`. Nothing in `src/` imports `mcp`. `server.ts` is the only file that imports `@modelcontextprotocol/sdk`; `tools.ts` takes bytes or paths and returns data, so unit logic is testable without a transport. `zod` is added as a dependency at the version the SDK accepts (task 1 checks).

## Reused

| Need | From |
|---|---|
| Opcode entry | `OPCODE_TABLE`, `OpcodeEntry` in `src/formula` |
| Verification | `verifyWorkbookBytes(bytes, name)` in `src/verify`, returning `{ diagnostics, verifications }` |
| Parsing for diff | `parseWorkbook` in `src/parser` (`{ kind, workbook, diagnostics }`) |
| Excel text of a formula | `translateFormula(rpn, origin)` in `src/formula` |
| Number to Value | `valueFromDouble` in `src/verify` (infinities to `err`/`na`, NaN to null) |

## Result shape

```ts
export type ToolResult = { isError: boolean; data: unknown };
```

`server.ts` turns it into the MCP form: `{ isError, content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }`. One adapter function, used by all three tools. Error `data` is `{ error: string }`.

## Tools

### opcode_lookup

Input: `{ opcode: z.union([z.number().int().min(0).max(255), z.string().regex(/^0x[0-9a-fA-F]{1,2}$/)]) }`.
Output on success: the entry fields from `OpcodeEntry`, `opcode` also as `"0x50"`. Only the fields that exist for the entry's `kind` are present (`name` or `op`, `arity` for functions).
Output on a miss: `{ error: "Opcode 0xFF is not in the opcode table. A cell that uses it stays unverifiable." }`, `isError: true`.

### verify_file

Input: `{ path: z.string().min(1) }`.

```
read file (Bun/Node fs, bytes only)
  -> parseWorkbook error diagnostics missing-bof / unknown-format and no cells  => isError
  -> verifyWorkbookBytes(bytes, basename)
  -> { path, format, sheets: [{ name, totals: {formulas, matched, mismatched, unverifiable},
       cells: [{ address, status, reason: {code, message}, formula, lotusFormula, cached, recalculated }] }],
       diagnostics }
```

`totals` is picked from `SheetVerification.totals`, never recounted. The sheet name comes from `parseWorkbook` (the verification list and `workbook.sheets` have the same order). A DBF gives `format: "dbf"`, zero formulas and empty `cells`. A WK3 formula comes back unverifiable with `wk3-formula-not-decoded`, as `verifyWorkbookBytes` decides. `cached` and `recalculated` are `Value | null`.

### diff_workbooks

Input: `{ left: z.string().min(1), right: z.string().min(1) }`.

Both files go through `parseWorkbook`. Sheets are paired by index. Per pair, cells are keyed by `a1(col, row)`:

```
{ sheets: [{ index, leftName, rightName,
             onlyInLeft:  [CellView],
             onlyInRight: [CellView],
             changed:     [{ address, left: CellView, right: CellView, differs: ["kind"|"value"|"label"|"cached"|"excel"] }] }],
  sheetsOnlyInLeft: [name], sheetsOnlyInRight: [name] }
```

`CellView` is `{ kind, value?: Value | null, label?: string, cached?: Value | null, excel?: string | null }`. `value` is for integer and number cells, `label` is the text without prefix, `cached` is the stored formula result, `excel` is the `translateFormula` text (null when it cannot translate). Numbers go through `valueFromDouble`, so ERR, NA and NaN never reach JSON as non-finite numbers. Equality of two doubles is `Object.is`, so `-0` and `0` differ, and two NaN markers are equal. Lists are in row-major order, so output is stable.

Two identical files give empty lists in every sheet.

## Errors

- A schema failure is caught by `McpServer` before the handler. Task 5 checks that the message names the field and the server keeps answering.
- Read errors (`ENOENT`, `EISDIR`, permission) become `{ error: "<path>: <reason>" }`.
- A file over 32 MiB is refused with an error, the same limit as the app, so one call cannot exhaust memory.
- Every handler is wrapped in one `try/catch` in `server.ts` that returns an `isError` result (requirement 5).
- The tools read files the caller names. The server is a local stdio process started by the user's tool, so it has the user's own file access and no more. It never writes.

## stdout discipline

Only `StdioServerTransport` writes to stdout. `server.ts` and `tools.ts` use no `console.log`. `console.error` is allowed. The test spawns the server through `StdioClientTransport` with `stderr: "pipe"`, and also runs a raw `Bun.spawn` session (initialize, `tools/list`, one bad call) that reads every stdout line and parses it as JSON with `jsonrpc: "2.0"`. A stray `console.log` from any imported `src/` module would fail it.

## Kiro registration

`.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "lotus-oracle": { "command": "bun", "args": ["mcp/lotus-oracle/server.ts"], "env": {} }
  }
}
```

A relative path works when Kiro starts from the project root. If it does not, the README says to give an absolute path.

## Tests

| Kind | What |
|---|---|
| Integration (the one file) | spawn server; `listTools` gives the three names with input schemas |
| `opcode_lookup` | `0x50` and `80` give the same entry as `OPCODE_TABLE.get(0x50)`; a candidate and a confirmed entry show their status; `0xFF` is `isError` with "unverifiable" |
| `verify_file` | `gnome647171-1.wks`: 4 formulas, 3 matched, 1 unverifiable; `KSBASE.WK1`: 160 matched; `PEYTREND.WK3`: format `wk3`, no formulas; missing path and a garbage temp file are `isError` |
| `diff_workbooks` | a file against itself is empty; KSBASE against gnome647171-1 lists cells in both only-lists; ERR cells of KSBASE appear as `err`; garbage and missing path are `isError` |
| Schema | `opcode_lookup` with `256`, `"0x1FF"` and `verify_file` with `{}` give an error naming the field, and the next call still works |
| Protocol | every stdout line parses as JSON-RPC |

Expected values come from `OPCODE_TABLE`, `fixtures/manifest.json` and `tests/differential/verify/golden.json`, or from calling `src/` directly in the test. They are never copied from the server's own output.

## Open questions

1. **Sheet pairing.** By index. WK3 sheets with the same names in a different order show as changed. Pairing by name is a small later change.
2. **Output size.** `verify_file` lists every cell. A sheet of 5,000 formulas gives a long answer. A `cells: false` input could trim it; not added until needed.
3. **Relative path in `mcp.json`.** Depends on how Kiro sets the working directory.
