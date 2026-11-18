// lotus-oracle: a stdio MCP server over src/ (.kiro/specs/lotus-oracle-mcp). Run with
// `bun mcp/lotus-oracle/server.ts`. Only the transport writes to stdout; logs go to stderr.
// SDK 1.32.2: McpServer from "@modelcontextprotocol/sdk/server/mcp.js", StdioServerTransport from
// "@modelcontextprotocol/sdk/server/stdio.js"; registerTool(name, { description, inputSchema }, cb)
// where inputSchema is a zod (v4) raw shape and a schema failure comes back as an isError result.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { diffWorkbooks, opcodeLookup, verifyFile, type ToolResult } from "./tools.ts";

type McpResult = { isError: boolean; content: { type: "text"; text: string }[] };

/** One adapter for every tool: the data as JSON text, and any throw as an isError result. */
async function answer(run: () => ToolResult | Promise<ToolResult>): Promise<McpResult> {
  try {
    const { isError, data } = await run();
    return { isError, content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    console.error("lotus-oracle:", err);
    return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: (err as Error).message }) }] };
  }
}

const server = new McpServer({ name: "lotus-oracle", version: "0.0.0" });

server.registerTool(
  "opcode_lookup",
  {
    description: "Look up a WK1/WKS formula opcode in the evidence-backed opcode table (kind, name, arity, confirmed or candidate, source).",
    inputSchema: { opcode: z.union([z.number().int().min(0).max(255), z.string().regex(/^0x[0-9a-fA-F]{1,2}$/)]).describe("Opcode byte, 0 to 255 or hex such as 0x50") },
  },
  ({ opcode }) => answer(() => opcodeLookup(opcode)),
);

server.registerTool(
  "verify_file",
  {
    description: "Parse a WK1, WKS, WK3 or DBF file, recalculate its formulas and compare each with the value the file stored.",
    inputSchema: { path: z.string().min(1).describe("Path of the file to verify") },
  },
  ({ path }) => answer(() => verifyFile(path)),
);

server.registerTool(
  "diff_workbooks",
  {
    description: "Compare two Lotus or dBase files cell by cell: cells only in one, and changed values, labels, stored results and formulas.",
    inputSchema: { left: z.string().min(1).describe("Path of the first file"), right: z.string().min(1).describe("Path of the second file") },
  },
  ({ left, right }) => answer(() => diffWorkbooks(left, right)),
);

await server.connect(new StdioServerTransport());
console.error("lotus-oracle: ready on stdio");
