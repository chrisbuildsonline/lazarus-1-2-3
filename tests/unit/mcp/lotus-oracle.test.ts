// The lotus-oracle MCP server (.kiro/specs/lotus-oracle-mcp): spawned through the SDK's
// StdioClientTransport and called like Kiro would. Expected values come from src/, the golden
// file or the manifest, never from the server's own output.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_BYTES } from "../../../mcp/lotus-oracle/tools.ts";
import { writeWk1, type CellSpec } from "../../../scripts/lib/wk1-writer.ts";
import { OPCODE_TABLE, translateFormula } from "../../../src/formula/index.ts";
import { getCell, parseA1, parseWorkbook } from "../../../src/parser/index.ts";
import { verifyWorkbookBytes, type Totals } from "../../../src/verify/index.ts";

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

const KSBASE = "fixtures/ksbase/KSBASE.WK1";
const GNOME = "fixtures/libreoffice-wks-functions/gnome647171-1.wks";
const PEYTREND = "fixtures/format-corpus-peytrend/PEYTREND.WK3";
const golden = JSON.parse(readFileSync("tests/differential/verify/golden.json", "utf8")) as Record<string, Totals>;
const bytesOf = (path: string) => new Uint8Array(readFileSync(path));

const dir = mkdtempSync(join(tmpdir(), "lotus-oracle-"));
const GARBAGE = join(dir, "garbage.wk1");
const HUGE = join(dir, "huge.wk1");
const LOCKED = join(dir, "locked.wk1");
const MISSING = join(dir, "missing.wk1");
writeFileSync(GARBAGE, "this is not a spreadsheet, only some text bytes. ".repeat(20));
writeFileSync(HUGE, "");
truncateSync(HUGE, MAX_BYTES + 1);
writeFileSync(LOCKED, bytesOf(GNOME));
chmodSync(LOCKED, 0o000);
afterAll(() => {
  chmodSync(LOCKED, 0o600);
  rmSync(dir, { recursive: true, force: true });
});

type VerifyData = {
  format: string;
  sheets: { name: string; totals: Pick<Totals, "formulas" | "matched" | "mismatched" | "unverifiable">; cells: Record<string, unknown>[] }[];
  diagnostics: unknown[];
};

const counts = (t: Totals) => ({ formulas: t.formulas, matched: t.matched, mismatched: t.mismatched, unverifiable: t.unverifiable });

describe("verify_file", () => {
  it("verifies gnome647171-1.wks: 3 matched and 1 unverifiable of 4, with every cell field", async () => {
    const r = await call("verify_file", { path: GNOME });
    expect(r.isError).toBeFalsy();
    const data = r.data as VerifyData;
    const direct = verifyWorkbookBytes(bytesOf(GNOME), "gnome647171-1.wks");
    expect(data.format).toBe(direct.verifications[0]!.format);
    expect(data.sheets).toHaveLength(1);
    expect(data.sheets[0]!.totals).toEqual(counts(golden[GNOME]!));
    expect(data.sheets[0]!.totals).toEqual({ formulas: 4, matched: 3, mismatched: 0, unverifiable: 1 });
    expect(data.sheets[0]!.cells).toEqual(
      direct.verifications[0]!.cells.map((c) => ({ address: c.address, status: c.status, reason: { code: c.reason.code, message: c.reason.message }, formula: c.formula, lotusFormula: c.lotusFormula, cached: c.cached, recalculated: c.recalculated })),
    );
    const a5 = data.sheets[0]!.cells.find((c) => c.address === "A5")!;
    expect(a5).toMatchObject({ status: "unverifiable", reason: { code: "string-result" }, cached: null });
    expect(data.diagnostics).toEqual(JSON.parse(JSON.stringify(direct.diagnostics)));
  });

  it("verifies KSBASE.WK1: 160 of 160 matched", async () => {
    const data = (await call("verify_file", { path: KSBASE })).data as VerifyData;
    expect(data.sheets[0]!.totals).toEqual(counts(golden[KSBASE]!));
    expect(data.sheets[0]!.totals.matched).toBe(160);
  });

  it("reports a WK3 file with its format and the totals verifyWorkbookBytes gives", async () => {
    const data = (await call("verify_file", { path: PEYTREND })).data as VerifyData;
    const direct = verifyWorkbookBytes(bytesOf(PEYTREND));
    expect(data.format).toBe("wk3");
    expect(data.sheets.map((s) => s.totals)).toEqual(direct.verifications.map((v) => counts(v.totals)));
    expect(data.sheets.every((s) => s.totals.matched === 0)).toBe(true);
  });

  it.each([
    ["a missing path", MISSING, /ENOENT|no such file/],
    ["a folder", dir, /folder/],
    ["garbage bytes", GARBAGE, /not a WK1, WKS, WK3 or DBF file/],
    ["a file over 32 MiB", HUGE, /32 MiB/],
    ["an unreadable file", LOCKED, /EACCES|permission/],
  ])("gives an error result for %s, naming the path", async (_what, path, why) => {
    const r = await call("verify_file", { path });
    expect(r.isError).toBe(true);
    expect((r.data as { error: string }).error).toContain(path);
    expect(r.text).toMatch(why);
    expect((await call("opcode_lookup", { opcode: 0 })).isError).toBeFalsy();
  });
});

type View = { address?: string; kind: string; value?: unknown; label?: string; cached?: unknown; excel?: string | null };
type DiffData = {
  sheets: { index: number; leftName: string; rightName: string; onlyInLeft: View[]; onlyInRight: View[]; changed: { address: string; left: View; right: View; differs: string[] }[] }[];
  sheetsOnlyInLeft: string[];
  sheetsOnlyInRight: string[];
};

const f64 = (v: number) => [...new Uint8Array(new Float64Array([v]).buffer)];
const constant = (v: number) => [0x00, ...f64(v), 0x03];
const LEFT = join(dir, "left.wk1");
const RIGHT = join(dir, "right.wk1");
const leftCells: CellSpec[] = [
  { kind: "number", col: 0, row: 0, value: 1 },
  { kind: "label", col: 1, row: 0, prefix: "'", text: "before" },
  { kind: "formula", col: 2, row: 0, cached: 5, rpn: constant(5) },
  { kind: "number", col: 3, row: 0, value: 7 },
  { kind: "number", col: 4, row: 0, value: 0 },
  { kind: "label", col: 5, row: 0, prefix: "'", text: "same" },
];
const rightCells: CellSpec[] = [
  { kind: "number", col: 0, row: 0, value: 2 },
  { kind: "label", col: 1, row: 0, prefix: "'", text: "after" },
  { kind: "formula", col: 2, row: 0, cached: 6, rpn: constant(6) },
  { kind: "number", col: 4, row: 0, value: -0 },
  { kind: "label", col: 5, row: 0, prefix: "'", text: "same" },
  { kind: "number", col: 6, row: 0, value: 9 },
];
writeFileSync(LEFT, writeWk1(0x0406, leftCells));
writeFileSync(RIGHT, writeWk1(0x0406, rightCells));

describe("diff_workbooks", () => {
  it.each([KSBASE, PEYTREND, GNOME])("finds no difference between %s and itself", async (path) => {
    const r = await call("diff_workbooks", { left: path, right: path });
    expect(r.isError).toBeFalsy();
    const data = r.data as DiffData;
    expect(data.sheets.length).toBe(parseWorkbook(bytesOf(path)).workbook.sheets.length);
    for (const s of data.sheets) expect([s.onlyInLeft, s.onlyInRight, s.changed]).toEqual([[], [], []]);
    expect([data.sheetsOnlyInLeft, data.sheetsOnlyInRight]).toEqual([[], []]);
  });

  it("lists values, labels, stored results and formulas that changed, and cells on one side only", async () => {
    const data = (await call("diff_workbooks", { left: LEFT, right: RIGHT })).data as DiffData;
    const excel = (v: number) => translateFormula(Uint8Array.from(constant(v)), { col: 2, row: 0 }).excel;
    expect(excel(5)).not.toBe(excel(6));
    expect(data.sheets).toEqual([
      {
        index: 0,
        leftName: "Sheet1",
        rightName: "Sheet1",
        onlyInLeft: [{ address: "D1", kind: "number", value: { t: "num", v: 7 } }],
        onlyInRight: [{ address: "G1", kind: "number", value: { t: "num", v: 9 } }],
        changed: [
          { address: "A1", left: { kind: "number", value: { t: "num", v: 1 } }, right: { kind: "number", value: { t: "num", v: 2 } }, differs: ["value"] },
          { address: "B1", left: { kind: "label", label: "before" }, right: { kind: "label", label: "after" }, differs: ["label"] },
          { address: "C1", left: { kind: "formula", cached: { t: "num", v: 5 }, excel: excel(5) }, right: { kind: "formula", cached: { t: "num", v: 6 }, excel: excel(6) }, differs: ["cached", "excel"] },
          // -0 and 0 are different stored doubles; JSON prints both as 0, the differs field keeps it.
          { address: "E1", left: { kind: "number", value: { t: "num", v: 0 } }, right: { kind: "number", value: { t: "num", v: 0 } }, differs: ["value"] },
        ],
      },
    ]);
  });

  it("compares KSBASE.WK1 with gnome647171-1.wks, ERR cells as err and formulas as translateFormula gives", async () => {
    const data = (await call("diff_workbooks", { left: KSBASE, right: GNOME })).data as DiffData;
    const ks = parseWorkbook(bytesOf(KSBASE)).workbook.sheets[0]!.sheet;
    const gn = parseWorkbook(bytesOf(GNOME)).workbook.sheets[0]!.sheet;
    const s = data.sheets[0]!;
    // A1 is the label OBSERV in KSBASE and the number 10 in gnome647171-1.wks (both read with parseWorkbook above).
    expect(getCell(ks, 0, 0)).toMatchObject({ kind: "label", text: "OBSERV" });
    expect(getCell(gn, 0, 0)).toMatchObject({ kind: "number", value: 10 });
    expect(s.changed.find((c) => c.address === "A1")).toEqual({ address: "A1", left: { kind: "label", label: "OBSERV" }, right: { kind: "number", value: { t: "num", v: 10 } }, differs: ["kind"] });
    // KSBASE G36 stores 7ff0000000000000 (ERR) and gnome has no G36.
    expect(s.onlyInLeft.find((c) => c.address === "G36")).toEqual({ address: "G36", kind: "number", value: { t: "err" } });
    expect(s.onlyInLeft.length + s.changed.length).toBe(ks.cells.size);
    const formulas = [...s.onlyInLeft, ...s.onlyInRight].filter((c) => c.kind === "formula");
    expect(formulas.length).toBeGreaterThan(0);
    for (const c of formulas) {
      const { col, row } = parseA1(c.address!)!;
      const cell = (getCell(ks, col, row) && s.onlyInLeft.includes(c) ? getCell(ks, col, row) : getCell(gn, col, row)) as { rpn: Uint8Array };
      expect(c.excel).toBe(translateFormula(cell.rpn, { col, row }).excel);
    }
  });

  it.each([
    ["missing left", MISSING, GNOME, MISSING],
    ["missing right", GNOME, MISSING, MISSING],
    ["garbage left", GARBAGE, GNOME, GARBAGE],
    ["garbage right", GNOME, GARBAGE, GARBAGE],
  ])("gives an error result for %s, naming the path", async (_what, left, right, named) => {
    const r = await call("diff_workbooks", { left, right });
    expect(r.isError).toBe(true);
    expect((r.data as { error: string }).error).toContain(named);
  });
});

describe("hardening", () => {
  it("names the bad field for verify_file {} and diff_workbooks with a number, then keeps answering", async () => {
    const a = await call("verify_file", {});
    expect(a.isError).toBe(true);
    expect(a.text).toMatch(/path/);
    const b = await call("diff_workbooks", { left: 1, right: GNOME });
    expect(b.isError).toBe(true);
    expect(b.text).toMatch(/left/);
    expect((await call("verify_file", { path: GNOME })).isError).toBeFalsy();
  });

  it("keeps stdout JSON-RPC only through a session that runs all three tools", async () => {
    const callTool = (id: number, name: string, args: object) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
    const { lines } = await rawSession([
      INIT,
      INITIALIZED,
      callTool(2, "opcode_lookup", { opcode: "0xFF" }),
      callTool(3, "verify_file", { path: KSBASE }),
      callTool(4, "diff_workbooks", { left: GNOME, right: GARBAGE }),
      callTool(5, "verify_file", {}),
    ]);
    const messages = lines.map((l) => JSON.parse(l) as { jsonrpc: string; id?: number });
    for (const m of messages) expect(m.jsonrpc).toBe("2.0");
    // Tool calls run concurrently, so answers may come in any order.
    expect(messages.map((m) => m.id).sort()).toEqual([1, 2, 3, 4, 5]);
  }, 20_000);

  it("keeps console.log, network calls and UI imports out of mcp/lotus-oracle", () => {
    for (const name of readdirSync("mcp/lotus-oracle")) {
      const src = readFileSync(join("mcp/lotus-oracle", name), "utf8");
      expect(src).not.toMatch(/console\.log|fetch\(|src\/ui\/|src\/workers\//);
    }
  });
});

describe("setup", () => {
  it("has the oracle:mcp script and type checks mcp/", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["oracle:mcp"]).toBe("bun mcp/lotus-oracle/server.ts");
    const ts = JSON.parse(readFileSync("tsconfig.json", "utf8")) as { include: string[] };
    expect(ts.include).toContain("mcp");
  });

  it("starts the server through scripts/oracle.ts", async () => {
    const viaScript = await connect(["scripts/oracle.ts"]);
    try {
      expect((await viaScript.listTools()).tools.map((t) => t.name).sort()).toEqual(["diff_workbooks", "opcode_lookup", "verify_file"]);
    } finally {
      await viaScript.close();
    }
  }, 20_000);

  it("is registered for Kiro in .kiro/settings/mcp.json", () => {
    const cfg = JSON.parse(readFileSync(".kiro/settings/mcp.json", "utf8")) as { mcpServers: Record<string, { command: string; args: string[] }> };
    const entry = cfg.mcpServers["lotus-oracle"]!;
    expect(entry.command).toBe("bun");
    expect(entry.args).toContain("mcp/lotus-oracle/server.ts");
  });

  it("is described in the README", () => {
    const readme = readFileSync("README.md", "utf8");
    for (const word of ["opcode_lookup", "verify_file", "diff_workbooks", "oracle:mcp", ".kiro/settings/mcp.json"]) expect(readme).toContain(word);
  });
});
