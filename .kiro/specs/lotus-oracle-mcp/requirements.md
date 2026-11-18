# Requirements: lotus-oracle MCP server

Goal: a small stdio MCP server, `lotus-oracle`, that lets a developer tool (Kiro) ask three questions about Lotus 1-2-3 files: what an opcode is, whether a file's formulas verify, and how two workbooks differ. Every answer comes from the existing `src/` modules.

This feature does not parse, decode or verify anything itself, does not call a model, does not write any file, and does not run macros. It has no network access.

Terms:

- *Tool logic* is the code in `mcp/lotus-oracle/tools.ts`. It takes plain input and returns a plain `ToolResult` (`{ isError: boolean; data: unknown }`). It does not import the MCP SDK.
- A *Value* is the `src/verify/value.ts` type: `num`, `str`, `err` or `na`.
- A *Lotus file* is one that `parseWorkbook` reads as WK1, WKS, WK3 or DBF. Input is *garbage* when `parseWorkbook` reports an error diagnostic `missing-bof` or `unknown-format` and no cells.

## EARS requirements

### Server

1. The command `bun mcp/lotus-oracle/server.ts` SHALL start an MCP server named `lotus-oracle` on stdio, built with `McpServer` from `@modelcontextprotocol/sdk`, and SHALL stay running until stdin closes.
2. The server SHALL write only JSON-RPC messages to stdout, one per line. Logs and errors SHALL go to stderr.
3. The server SHALL list exactly three tools: `opcode_lookup`, `verify_file` and `diff_workbooks`. Each SHALL declare a zod input schema and a one-sentence description.
4. IF a tool call has input that fails its schema, THEN the server SHALL answer with an error result that names the bad field, and SHALL keep running.
5. IF tool logic throws, THEN the server SHALL return an `isError` result with the message, and SHALL NOT exit.
6. The server SHALL make no network request and SHALL NOT call a model. Every number in a result SHALL come from `src/parser`, `src/formula` or `src/verify`.

### Tool logic

7. `mcp/lotus-oracle/tools.ts` SHALL hold the logic of all three tools as thin wrappers over `src/` (`OPCODE_TABLE`, `verifyWorkbookBytes`, `parseWorkbook`, `translateFormula`). It SHALL NOT re-implement parsing, decoding, translation or verification, and SHALL import nothing from `src/ui`, `src/workers` or React.
8. `opcode_lookup` SHALL take `{ opcode }`, an integer 0 to 255 or a hex string such as `0x50`, and SHALL return the `OPCODE_TABLE` entry: `opcode`, `kind`, `name` or `op`, `arity` (functions only), `status` (`confirmed` or `candidate`) and `source`.
9. IF the opcode is not in `OPCODE_TABLE`, THEN `opcode_lookup` SHALL return an `isError` result saying the opcode is unknown to the table and that cells using it stay unverifiable.
10. `verify_file` SHALL take `{ path }`, read the file, call `verifyWorkbookBytes`, and return the detected format, per sheet the totals (`matched`, `mismatched`, `unverifiable`), per cell `address`, `status`, reason `code` and `message`, `formula` (Excel), `lotusFormula`, `cached` and `recalculated`, and the parser diagnostics.
11. `diff_workbooks` SHALL take `{ left, right }`, parse both with `parseWorkbook`, and list per sheet the cells only in left, only in right, and changed. A changed cell SHALL show both sides' kind, value, label text, cached formula result and Excel formula text (from `translateFormula`).
12. IF a path does not exist or cannot be read, or the file is garbage, THEN `verify_file` and `diff_workbooks` SHALL return an `isError` result naming the path and the reason, and SHALL NOT throw out of the handler.
13. Values SHALL use the verify `Value` shape. A cell number that is not finite (ERR or NA doubles, or a NaN marker) SHALL appear as `err`, `na` or `null`, so every result is valid JSON.

### Setup and tests

14. `package.json` SHALL gain the script `oracle:mcp` running the server. `scripts/oracle.ts` SHALL run `mcp/lotus-oracle/server.ts`. `tsconfig.json` SHALL include `mcp`. `.kiro/settings/mcp.json` SHALL register the server for Kiro.
15. One Vitest test, `tests/unit/mcp/lotus-oracle.test.ts`, SHALL spawn the server through `StdioClientTransport`, list the three tools, call each on real fixtures, and cover the error paths of requirements 4, 9 and 12. It SHALL assert that every stdout line is JSON-RPC.
16. The whole suite (`bun run test`) and `bun run typecheck` SHALL pass, and `README.md` SHALL describe the tools, how to run the server and the Kiro registration.
