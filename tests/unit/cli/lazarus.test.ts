import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildAll } from "../../../scripts/gen-fixtures.ts";
import { writeWk1 } from "../../../scripts/lib/wk1-writer.ts";
import { detectFormat, formatLine, inventoryFile, walk } from "../../../src/cli/inventory.ts";
import { WK3_VERSIONS } from "../../../src/parser/detect.ts";
import { SAMPLE_DBF } from "../helpers/dbf-sample.ts";

const WK1 = buildAll().find((f) => f.path.endsWith("mixed.wk1"))!.bytes;
const WKS = writeWk1(0x0404, [{ kind: "integer", col: 0, row: 0, value: 1 }]);
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

// Temp corpus: nested dirs, a mislabelled file, an unknown file and a symlink.
const root = mkdtempSync(join(tmpdir(), "lazarus-cli-"));
mkdirSync(join(root, "a", "y"), { recursive: true });
writeFileSync(join(root, "b.wk1"), WK1);
writeFileSync(join(root, "a", "z.dbf"), SAMPLE_DBF);
writeFileSync(join(root, "a", "y", "x.wks"), WKS);
writeFileSync(join(root, "c.txt"), "not a spreadsheet");
writeFileSync(join(root, "d.dbf"), WK1);
symlinkSync(join(root, "b.wk1"), join(root, "link.wk1"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

async function collect(path: string): Promise<string[]> {
  const out: string[] = [];
  for await (const p of walk(path)) out.push(p);
  return out;
}

describe("walk", () => {
  it("lists files recursively in sorted order and skips symlinks", async () => {
    expect(await collect(root)).toEqual(["a/y/x.wks", "a/z.dbf", "b.wk1", "c.txt", "d.dbf"].map((p) => join(root, p)));
  });

  it("yields a single file path as is", async () => {
    expect(await collect(join(root, "b.wk1"))).toEqual([join(root, "b.wk1")]);
  });
});

describe("inventoryFile", () => {
  it("reports path, format, size and sha256", async () => {
    expect(await inventoryFile(join(root, "a", "z.dbf"))).toEqual({
      path: join(root, "a", "z.dbf"),
      format: "dbf",
      size: SAMPLE_DBF.length,
      sha256: sha256(SAMPLE_DBF),
    });
  });

  it("carries the note when the extension disagrees", async () => {
    expect(await inventoryFile(join(root, "d.dbf"))).toEqual({
      path: join(root, "d.dbf"),
      format: "wk1",
      size: WK1.length,
      sha256: sha256(WK1),
      note: "extension says dbf",
    });
  });
});

const NOTICE = "lazarus: inventory only. Parsing is not implemented yet.\n";
const lazarus = (...args: string[]) => spawnSync("bun", ["src/cli/lazarus.ts", ...args], { encoding: "utf8" });
const ROOT_FILES = ["a/y/x.wks", "a/z.dbf", "b.wk1", "c.txt", "d.dbf"].map((p) => join(root, p));

describe("lazarus cli", () => {
  it("prints one line per file in sorted order, the notice on stderr, and exits 0 with unknown files", async () => {
    const run = lazarus(root);
    const expected = await Promise.all(ROOT_FILES.map(async (p) => formatLine(await inventoryFile(p))));
    expect(run.stdout).toBe(`${expected.join("\n")}\n`);
    expect(run.stdout).toContain("\tunknown\t");
    expect(run.stderr).toBe(NOTICE);
    expect(run.status).toBe(0);
  });

  it("prints one line for a single file", () => {
    const run = lazarus(join(root, "b.wk1"));
    expect(run.stdout).toBe(`${join(root, "b.wk1")}\twk1\t${WK1.length}\t${sha256(WK1)}\n`);
    expect(run.status).toBe(0);
  });

  it("prints only a JSON array with --json", () => {
    const run = lazarus(root, "--json");
    const parsed = JSON.parse(run.stdout) as Record<string, unknown>[];
    expect(parsed.map((e) => e.path)).toEqual(ROOT_FILES);
    for (const e of parsed) {
      const keys = Object.keys(e).sort();
      expect(keys).toEqual(e.path === join(root, "d.dbf") ? ["format", "note", "path", "sha256", "size"] : ["format", "path", "sha256", "size"]);
    }
    expect(parsed.find((e) => e.path === join(root, "a", "z.dbf"))).toEqual({
      path: join(root, "a", "z.dbf"),
      format: "dbf",
      size: SAMPLE_DBF.length,
      sha256: sha256(SAMPLE_DBF),
    });
    expect(run.stderr).toBe(NOTICE);
    expect(run.status).toBe(0);
  });

  it("exits 2 with an error when the path does not exist", () => {
    const run = lazarus(join(root, "missing"));
    expect(run.status).toBe(2);
    expect(run.stdout).toBe("");
    expect(run.stderr).toContain("missing");
  });

  it("exits 2 with usage when no path is given", () => {
    const run = lazarus();
    expect(run.status).toBe(2);
    expect(run.stdout).toBe("");
    expect(run.stderr).toContain("usage: bun run lazarus <path> [--json]");
  });

  it("skips an unreadable file, reports it on stderr and exits 1", () => {
    const dir = mkdtempSync(join(tmpdir(), "lazarus-cli-locked-"));
    writeFileSync(join(dir, "a.wk1"), WK1);
    writeFileSync(join(dir, "b.wk1"), WK1);
    chmodSync(join(dir, "a.wk1"), 0o000);
    const run = lazarus(dir);
    rmSync(dir, { recursive: true, force: true });
    expect(run.status).toBe(1);
    expect(run.stdout).toBe(`${join(dir, "b.wk1")}\twk1\t${WK1.length}\t${sha256(WK1)}\n`);
    expect(run.stderr).toContain(join(dir, "a.wk1"));
  });

  it("agrees with fixtures/manifest.json on every corpus file's format and sha256", () => {
    const run = lazarus("fixtures", "--json");
    expect(run.status).toBe(0);
    const listed = JSON.parse(run.stdout) as { path: string; format: string; sha256: string; note?: string }[];
    const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: { path: string; format: string; sha256: string }[] };
    const pick = (list: { path: string; format: string; sha256: string }[]) =>
      list.map(({ path, format, sha256 }) => ({ path, format, sha256 })).sort((a, b) => (a.path < b.path ? -1 : 1));
    expect(pick(listed.filter((e) => e.format !== "unknown"))).toEqual(pick(manifest.fixtures));
    expect(listed.filter((e) => e.note)).toEqual([]);
  });

  it("imports only node:crypto, node:fs, node:path and its own modules (no network, no React, no DOM)", () => {
    for (const name of readdirSync("src/cli")) {
      const source = readFileSync(join("src/cli", name), "utf8");
      for (const [, spec] of source.matchAll(/from\s+"([^"]+)"/g)) {
        // Requirement 73: verify-summary.ts may reach src/verify and src/parser. xlsx-writer design
        // "Layout": export.ts may also reach src/xlsx and src/report, through their index files.
        const allowed =
          name === "verify-summary.ts"
            ? /^(\.\.\/(verify|parser)\/index\.ts|\.\/[\w-]+\.ts)$/
            : name === "export.ts"
              ? /^(node:(fs\/promises|path)|\.\.\/(verify|parser|xlsx|report)\/index\.ts|\.\/[\w-]+\.ts)$/
              : name === "inventory.ts"
                ? // wk3-dbf-readers requirement 12: one definition of "this is a DBF" and "this is a WK3", from src/parser.
                  /^(node:(crypto|fs|fs\/promises|path)|\.\.\/parser\/index\.ts|\.\/[\w-]+\.ts)$/
                : /^(node:(crypto|fs|fs\/promises|path)|\.\/[\w-]+\.ts)$/;
        expect(spec, `${name} imports ${spec}`).toMatch(allowed);
      }
    }
  });

  it("lazarus fixtures --verify --json gives the golden counts for real fixtures and all matched for synthetic ones", () => {
    const run = lazarus("fixtures", "--verify", "--json");
    expect(run.status).toBe(0);
    const listed = JSON.parse(run.stdout) as { path: string; format: string; verify?: Record<string, unknown> }[];
    const golden = JSON.parse(readFileSync("tests/differential/verify/golden.json", "utf8")) as Record<string, Record<string, unknown>>;
    const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: { path: string; format: string; origin: string; counts: { formulas: number } }[] };
    const spreadsheets = manifest.fixtures.filter((e) => e.format === "wk1" || e.format === "wks");
    expect(spreadsheets.length).toBeGreaterThan(0);
    for (const e of spreadsheets) {
      const v = listed.find((x) => x.path === e.path)?.verify;
      expect(v, e.path).toBeDefined();
      const g = golden[e.path];
      if (g) {
        const { formulas, matched, mismatched, unverifiable, exact, withinTolerance, byReason } = g;
        expect(v, e.path).toEqual({ formulas, matched, mismatched, unverifiable, exact, withinTolerance, byReason });
      } else if (e.origin === "synthetic") {
        const n = e.counts.formulas;
        expect(v, e.path).toEqual({ formulas: n, matched: n, mismatched: 0, unverifiable: 0, exact: n, withinTolerance: 0, byReason: n > 0 ? { exact: n } : {} });
      } else {
        expect(v?.formulas, e.path).toBe(0); // a real file without formulas has no golden entry
      }
    }
    expect(Object.keys(golden).every((p) => listed.some((x) => x.path === p))).toBe(true);
  });

  it("--verify counts WK3 formulas as unverifiable and a DBF as no formulas", () => {
    const listed = ["fixtures/wk3-sheets/wk3-sheets.wk3", "fixtures/dbf-table/dbf-table.dbf"].map((path) => {
      const run = lazarus(path, "--verify", "--json");
      expect(run.status).toBe(0);
      return (JSON.parse(run.stdout) as { format: string; verify?: Record<string, unknown> }[])[0]!;
    });
    expect(listed.map((x) => [x.format, x.verify])).toEqual([
      ["wk3", { formulas: 1, matched: 0, mismatched: 0, unverifiable: 1, exact: 0, withinTolerance: 0, byReason: { "wk3-formula-not-decoded": 1 } }],
      ["dbf", { formulas: 0, matched: 0, mismatched: 0, unverifiable: 0, exact: 0, withinTolerance: 0, byReason: {} }],
    ]);
  });
});

const VERIFY_NOTICE = "lazarus: verify: formulas are recalculated and compared with the values stored in the file. Stored values are never changed.\n";

describe("lazarus cli --verify (requirements 70 to 72)", () => {
  const line = (path: string, bytes: Uint8Array, format: string, extra: string[] = []) => [path, format, bytes.length, sha256(bytes), ...extra].join("\t");

  it("appends one verify field to each wk1, wks, wk3 and dbf line; other lines are unchanged", () => {
    const run = lazarus(root, "--verify");
    const lines = run.stdout.trimEnd().split("\n");
    // mixed.wk1: 4 formulas, all synthetic and matched (manifest). x.wks holds one integer, no formula.
    expect(lines).toContain(line(join(root, "b.wk1"), WK1, "wk1", ["verify: 4 formulas, 4 matched, 0 mismatched, 0 unverifiable"]));
    expect(lines).toContain(line(join(root, "a", "y", "x.wks"), WKS, "wks", ["verify: 0 formulas, 0 matched, 0 mismatched, 0 unverifiable"]));
    expect(lines).toContain(line(join(root, "d.dbf"), WK1, "wk1", ["(extension says dbf)", "verify: 4 formulas, 4 matched, 0 mismatched, 0 unverifiable"]));
    expect(lines).toContain(line(join(root, "a", "z.dbf"), SAMPLE_DBF, "dbf", ["verify: 0 formulas, 0 matched, 0 mismatched, 0 unverifiable"]));
    expect(lines.filter((l) => l.includes("verify:"))).toHaveLength(4);
    expect(run.stderr).toBe(VERIFY_NOTICE);
    expect(run.status).toBe(0);
  });

  it("exits 0 when cells are mismatched or unverifiable", () => {
    const dir = mkdtempSync(join(tmpdir(), "lazarus-cli-verify-"));
    // A2 = A1 + 1 with A1 = 1 is 2, stored as 99 (mismatched); B2 = A1 with a NaN cached value (unverifiable).
    const bad = writeWk1(0x0406, [
      { kind: "integer", col: 0, row: 0, value: 1 },
      { kind: "formula", col: 0, row: 1, cached: 99, rpn: [0x01, 0x00, 0x00, 0x00, 0x00, 0x05, 0x01, 0x00, 0x09, 0x03] },
      { kind: "formula", col: 1, row: 1, cached: NaN, rpn: [0x01, 0x00, 0x00, 0x00, 0x00, 0x03] },
    ]);
    writeFileSync(join(dir, "bad.wk1"), bad);
    const run = lazarus(dir, "--verify");
    rmSync(dir, { recursive: true, force: true });
    expect(run.stdout).toBe(`${line(join(dir, "bad.wk1"), bad, "wk1", ["verify: 2 formulas, 0 matched, 1 mismatched, 1 unverifiable"])}\n`);
    expect(run.status).toBe(0);
  });

  it("says so when a wk1 file has parser errors and still counts the cells that parsed", () => {
    const dir = mkdtempSync(join(tmpdir(), "lazarus-cli-verify-"));
    const cut = WK1.subarray(0, WK1.length - 4 - 31 + 8); // into D4's FORMULA record (see verify-summary.test.ts)
    writeFileSync(join(dir, "cut.wk1"), cut);
    const run = lazarus(dir, "--verify");
    rmSync(dir, { recursive: true, force: true });
    expect(run.stdout).toMatch(/\tverify: 3 formulas, 3 matched, 0 mismatched, 0 unverifiable \(parser errors: [1-9]\d*\)\n$/);
    expect(run.status).toBe(0);
  });

  it("names --verify in the usage text", () => {
    expect(lazarus().stderr).toContain("usage: bun run lazarus <path> [--json] [--verify]");
  });

  it("--verify --json adds a verify object to wk1, wks, wk3 and dbf entries only", () => {
    const run = lazarus(root, "--verify", "--json");
    const parsed = JSON.parse(run.stdout) as Record<string, unknown>[];
    expect(parsed.map((e) => e.path)).toEqual(ROOT_FILES);
    const mixedVerify = { formulas: 4, matched: 4, mismatched: 0, unverifiable: 0, exact: 4, withinTolerance: 0, byReason: { exact: 4 } };
    expect(parsed.find((e) => e.path === join(root, "b.wk1"))!.verify).toEqual(mixedVerify);
    expect(parsed.find((e) => e.path === join(root, "d.dbf"))!.verify).toEqual(mixedVerify);
    expect(parsed.find((e) => e.path === join(root, "a", "y", "x.wks"))!.verify).toEqual({ formulas: 0, matched: 0, mismatched: 0, unverifiable: 0, exact: 0, withinTolerance: 0, byReason: {} });
    for (const e of parsed) expect("verify" in e, String(e.path)).toBe(["wk1", "wks", "wk3", "dbf"].includes(String(e.format)));
    expect(run.stderr).toBe(VERIFY_NOTICE);
    expect(run.status).toBe(0);
  });
});

describe("formatLine", () => {
  it("joins path, format, size and sha256 with tabs", () => {
    expect(formatLine({ path: "f/x.wk1", format: "wk1", size: 12, sha256: "ab" })).toBe("f/x.wk1\twk1\t12\tab");
  });

  it("appends the extension note", () => {
    expect(formatLine({ path: "d.dbf", format: "wk1", size: 1, sha256: "ab", note: "extension says dbf" })).toBe(
      "d.dbf\twk1\t1\tab\t(extension says dbf)",
    );
  });
});

describe("detectFormat", () => {
  it("detects WK1 from a BOF with version 0x0406", () => {
    expect(detectFormat(WK1, ".wk1")).toEqual({ format: "wk1" });
  });

  it("detects WKS from a BOF with version 0x0404", () => {
    expect(detectFormat(WKS, ".wks")).toEqual({ format: "wks" });
  });

  it("detects DBF from the version byte and a consistent header", () => {
    expect(detectFormat(SAMPLE_DBF, ".dbf")).toEqual({ format: "dbf" });
  });

  it("ignores the case of the extension", () => {
    expect(detectFormat(WK1, ".WK1")).toEqual({ format: "wk1" });
  });

  it("reports unknown for other bytes, empty and short files", () => {
    expect(detectFormat(new TextEncoder().encode("hello, world"), ".txt")).toEqual({ format: "unknown" });
    expect(detectFormat(new Uint8Array(0), "")).toEqual({ format: "unknown" });
    expect(detectFormat(WK1.subarray(0, 5), "")).toEqual({ format: "unknown" });
    expect(detectFormat(SAMPLE_DBF.subarray(0, 31), "")).toEqual({ format: "unknown" });
  });

  it("detects WK3 from a BOF whose version is in the sourced WK3 table", () => {
    const wk3 = new Uint8Array(4 + 26);
    const v = new DataView(wk3.buffer);
    v.setUint16(2, 26, true);
    v.setUint16(4, [...WK3_VERSIONS][0]!, true);
    expect(detectFormat(wk3, ".wk3")).toEqual({ format: "wk3" });
    expect(detectFormat(wk3, ".wk1")).toEqual({ format: "wk3", note: "extension says wk1" });
    expect(detectFormat(WK1, ".wk3")).toEqual({ format: "wk1", note: "extension says wk3" });
  });

  it("reports unknown for a BOF version outside the table", () => {
    const symphony = Uint8Array.from(WK1);
    symphony[4] = 0x05; // 0x0405
    expect(detectFormat(symphony, "")).toEqual({ format: "unknown" });
  });

  it("reports unknown for a DBF header that does not fit the file", () => {
    const records = Uint8Array.from(SAMPLE_DBF);
    records[4] = 50; // 50 records of 19 bytes cannot fit
    expect(detectFormat(records, ".dbf")).toEqual({ format: "unknown", note: "extension says dbf" });
  });

  it("trusts the bytes and adds a note when the extension disagrees", () => {
    expect(detectFormat(WK1, ".dbf")).toEqual({ format: "wk1", note: "extension says dbf" });
    expect(detectFormat(WKS, ".wk1")).toEqual({ format: "wks", note: "extension says wk1" });
    expect(detectFormat(SAMPLE_DBF, ".wks")).toEqual({ format: "dbf", note: "extension says wks" });
  });

  it("adds no note for extensions that name no corpus format", () => {
    expect(detectFormat(WK1, ".bak")).toEqual({ format: "wk1" });
  });
});
