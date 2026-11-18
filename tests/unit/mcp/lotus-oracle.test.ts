// The lotus-oracle MCP server (.kiro/specs/lotus-oracle-mcp): spawned through the SDK's
// StdioClientTransport and called like Kiro would. Expected values come from src/, the golden
// file or the manifest, never from the server's own output.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OPCODE_TABLE } from "../../../src/formula/index.ts";

const SERVER = ["mcp/lotus-oracle/server.ts"];

async function connect(args = SERVER): Promise<Client> {
  const client = new Client({ name: "lotus-oracle-test", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: "bun", args, stderr: "pipe" }));
  return client;
}

/** A raw stdio session: writes the requests, closes stdin, and returns every stdout line. */
function rawSession(requests: object[]): Promise<{ lines: string[]; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", SERVER, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (err += d.toString("utf8")));
    child.on("error", reject);
    child.on("close", () => resolve({ lines: out.split("\n").filter((l) => l.length > 0), stderr: err }));
    for (const r of requests) child.stdin.write(`${JSON.stringify(r)}\n`);
    // Give the server time to answer before stdin closes and it exits.
    setTimeout(() => child.stdin.end(), 1500);
  });
}

const INIT = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "raw", version: "0" } } };
const INITIALIZED = { jsonrpc: "2.0", method: "notifications/initialized" };

type Called = { isError: boolean; text: string; data: unknown };

/** Calls a tool and parses its one text block; data is the parsed JSON, or null for plain text. */
async function call(name: string, args: Record<string, unknown>): Promise<Called> {
  const r = await client.callTool({ name, arguments: args });
  const content = r.content as { type: string; text: string }[];
  expect(content).toHaveLength(1);
  const text = content[0]!.text;
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return { isError: r.isError === true, text, data };
}

let client: Client;
beforeAll(async () => {
  client = await connect();
}, 20_000);
afterAll(async () => {
  await client?.close();
});

describe("lotus-oracle server", () => {
  it("answers listTools over stdio", async () => {
    const { tools } = await client.listTools();
    expect(Array.isArray(tools)).toBe(true);
  });

  it("lists the three tools, each with a description and its input fields", async () => {
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((t) => [t.name, t]));
    expect([...byName.keys()].sort()).toEqual(["diff_workbooks", "opcode_lookup", "verify_file"]);
    const fields: Record<string, string[]> = { opcode_lookup: ["opcode"], verify_file: ["path"], diff_workbooks: ["left", "right"] };
    for (const [name, want] of Object.entries(fields)) {
      const t = byName.get(name)!;
      expect(t.description?.length).toBeGreaterThan(10);
      expect(Object.keys(t.inputSchema.properties ?? {}).sort()).toEqual(want.sort());
    }
  });

  it("writes only JSON-RPC lines to stdout", async () => {
    const { lines } = await rawSession([INIT, INITIALIZED, { jsonrpc: "2.0", id: 2, method: "tools/list" }]);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) expect(JSON.parse(line)).toMatchObject({ jsonrpc: "2.0" });
  }, 20_000);
});

describe("opcode_lookup", () => {
  it("gives the OPCODE_TABLE entry for 0x50 and for 80", async () => {
    const want = OPCODE_TABLE.get(0x50)!;
    for (const opcode of ["0x50", 80]) {
      const r = await call("opcode_lookup", { opcode });
      expect(r.isError).toBeFalsy();
      expect(r.data).toEqual({ ...want, hex: "0x50" });
    }
  });

  it("shows confirmed and candidate status, operators and fixed-arity functions", async () => {
    for (const code of [0x0b, 0x0c, 0x3b, 0x00]) {
      const want = OPCODE_TABLE.get(code)!;
      expect((await call("opcode_lookup", { opcode: code })).data).toMatchObject(want);
    }
    expect((await call("opcode_lookup", { opcode: "0x0c" })).data).toMatchObject({ kind: "binary", op: "div", status: "candidate" });
    expect((await call("opcode_lookup", { opcode: "0x3B" })).data).toMatchObject({ kind: "function", name: "IF", arity: 3, status: "confirmed" });
  });

  it("says an opcode outside the table is unknown and stays unverifiable", async () => {
    expect(OPCODE_TABLE.has(0xff)).toBe(false);
    const r = await call("opcode_lookup", { opcode: "0xFF" });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/0xFF/);
    expect(r.text).toMatch(/unknown/i);
    expect(r.text).toMatch(/unverifiable/);
  });

  it("rejects input outside the schema by naming the field and keeps answering", async () => {
    for (const opcode of [256, -1, 1.5, "0x1FF", "banana"]) {
      const r = await call("opcode_lookup", { opcode });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/opcode/);
    }
    expect((await call("opcode_lookup", { opcode: 1 })).isError).toBeFalsy();
  });
});
