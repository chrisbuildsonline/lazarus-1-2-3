// lazarus <file> --xlsx / --report end to end (requirements 47 to 53), spawning the real CLI.
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { readXlsx } from "../helpers/xlsx-readback.ts";

const KSBASE = "fixtures/ksbase/KSBASE.WK1";
const DBF = "fixtures/natural-earth-land/ne_110m_land.dbf";
const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: { path: string; sha256: string; counts: { formulas: number } }[] };
const ksEntry = manifest.fixtures.find((f) => f.path === KSBASE)!;
const pkgVersion = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;
const NOTICE = "Stored values are never changed.";

const lazarus = (...args: string[]) => spawnSync("bun", ["src/cli/lazarus.ts", ...args], { encoding: "utf8" });
const root = mkdtempSync(join(tmpdir(), "lazarus-export-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
const freshDir = () => {
  const dir = join(root, `run${n++}`);
  mkdirSync(dir);
  return dir;
};

// The scan of task 20 (tests/unit/report/html.test.ts).
function scan(page: string) {
  for (const tag of ["<script", "<link", "<img", "<iframe", "<object", "<embed", "<form"]) expect(page.toLowerCase(), tag).not.toContain(tag);
  expect(page).not.toMatch(/\son[a-z]+=/i);
  expect(page).not.toMatch(/\s(src|href)=/i);
  expect(page).not.toContain("url(");
  expect(page).not.toContain("@import");
  expect(page).not.toMatch(/https?:/);
  expect(page.match(/<style>/g)).toHaveLength(1);
  const css = /<style>([\s\S]*?)<\/style>/.exec(page)![1]!;
  expect(css).not.toMatch(/animation|transition/);
}

describe("lazarus --xlsx and --report", () => {
  it("--xlsx writes a workbook that reads back with every formula of KSBASE.WK1", async () => {
    const dir = freshDir();
    const out = join(dir, "ks.xlsx");
    const run = lazarus(KSBASE, "--xlsx", out);
    expect(run.status, run.stderr).toBe(0);
    const bytes = new Uint8Array(readFileSync(out));
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe("PK");
    const back = await readXlsx(bytes);
    expect([...back.cells.values()].filter((c) => c.formula !== null)).toHaveLength(ksEntry.counts.formulas);
    expect(run.stdout).toContain(out);
    expect(run.stdout).toContain("verify: 160 formulas, 160 matched, 0 mismatched, 0 unverifiable");
    expect(run.stderr).toContain(NOTICE);
  });

  it("--report .json carries the manifest sha256, the base name, the package version and the --verify --json totals", () => {
    const dir = freshDir();
    const out = join(dir, "ks.json");
    const run = lazarus(KSBASE, "--report", out);
    expect(run.status, run.stderr).toBe(0);
    const report = JSON.parse(readFileSync(out, "utf8")) as { source: { sha256: string; fileName: string }; tool: { version: string }; totals: unknown };
    expect(report.source.sha256).toBe(ksEntry.sha256);
    expect(report.source.fileName).toBe("KSBASE.WK1");
    expect(report.tool.version).toBe(pkgVersion);
    const listed = JSON.parse(lazarus(KSBASE, "--verify", "--json").stdout) as { verify: unknown }[];
    expect(report.totals).toEqual(listed[0]!.verify);
    expect(run.stderr).toContain(NOTICE);
  });

  it("--report .HTML writes a page that passes the self-contained scan", () => {
    const dir = freshDir();
    const out = join(dir, "ks.HTML");
    const run = lazarus(KSBASE, "--report", out);
    expect(run.status, run.stderr).toBe(0);
    const page = readFileSync(out, "utf8");
    expect(page.startsWith("<!doctype html>")).toBe(true);
    expect(page).toContain("KSBASE.WK1");
    scan(page);
  });

  it("writes both files when both flags are given, with --json and --verify", () => {
    const dir = freshDir();
    const run = lazarus("--json", KSBASE, "--report", join(dir, "r.json"), "--verify", "--xlsx", join(dir, "w.xlsx"));
    expect(run.status, run.stderr).toBe(0);
    expect(readdirSync(dir).sort()).toEqual(["r.json", "w.xlsx"]);
    const out = JSON.parse(run.stdout) as { path: string; written: string[]; verify: { formulas: number } };
    expect(out.path).toBe(KSBASE);
    expect(out.written).toEqual([join(dir, "w.xlsx"), join(dir, "r.json")]);
    expect(out.verify.formulas).toBe(160);
  });

  it("writes a DBF as a one-sheet workbook and a report with the as-read line", async () => {
    const dir = freshDir();
    const run = lazarus(DBF, "--xlsx", join(dir, "o.xlsx"), "--report", join(dir, "o.json"));
    expect(run.status).toBe(0);
    const back = await readXlsx(new Uint8Array(readFileSync(join(dir, "o.xlsx"))));
    expect(back.sheetNames).toEqual(["Table"]);
    expect(back.sheets[0]!.values.get("A1")).toEqual({ value: "featurecla", formula: null });
    const report = JSON.parse(readFileSync(join(dir, "o.json"), "utf8")) as { source: { format: string }; totals: { formulas: number }; sheets: { asRead: number }[] };
    expect(report.source.format).toBe("dbf");
    expect(report.totals.formulas).toBe(0);
    expect(report.sheets[0]!.asRead).toBe(384);
  });

  it("writes a WK3 as three worksheets and an HTML report with the WK3 wording", async () => {
    const dir = freshDir();
    const run = lazarus("fixtures/wk3-sheets/wk3-sheets.wk3", "--xlsx", join(dir, "o.xlsx"), "--report", join(dir, "o.html"));
    expect(run.status).toBe(0);
    expect((await readXlsx(new Uint8Array(readFileSync(join(dir, "o.xlsx"))))).sheetNames).toEqual(["A", "B", "Totals"]);
    const page = readFileSync(join(dir, "o.html"), "utf8");
    scan(page);
    expect(page).toContain("Formulas in WK3 files are not read yet.");
    expect(page).toContain("Totals!C2");
  });

  it("refuses an input that is not a Lotus or dBase file with exit 1 and writes nothing", () => {
    const dir = freshDir();
    const noise = join(dir, "..", `noise${n}.wk1`);
    writeFileSync(noise, "not a spreadsheet at all");
    const run = lazarus(noise, "--xlsx", join(dir, "o.xlsx"));
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("not a Lotus 1-2-3 worksheet or dBase table");
    expect(readdirSync(dir)).toEqual([]);
  });

  it("exits 2 and writes nothing for a folder, a bad extension, or an output that is the input", () => {
    const dir = freshDir();
    const folder = lazarus("fixtures/ksbase", "--xlsx", join(dir, "o.xlsx"));
    expect(folder.status).toBe(2);
    expect(folder.stderr).toContain("usage:");
    expect(lazarus(KSBASE, "--xlsx", join(dir, "o.xls")).status).toBe(2);
    expect(lazarus(KSBASE, "--report", join(dir, "o.txt")).status).toBe(2);

    // A WK1 file named book.html, so the input itself is a valid --report target.
    const input = join(dir, "book.html");
    copyFileSync(KSBASE, input);
    const before = readFileSync(input);
    const outLink = join(dir, "out.html");
    symlinkSync(input, outLink);
    const inLink = join(dir, "in.wk1");
    symlinkSync(input, inLink);
    for (const [from, to] of [
      [input, join(dir, "sub", "..", "book.html")], // the same path spelled differently
      [input, outLink], // the output is a symlink to the input
      [inLink, input], // the input is a symlink to the output
    ] as const) {
      const run = lazarus(from, "--report", to);
      expect(run.status, `${from} -> ${to}`).toBe(2);
      expect(run.stderr).toContain("same file as the input");
    }
    expect(readFileSync(input).equals(before)).toBe(true);
    expect(readdirSync(dir).sort()).toEqual(["book.html", "in.wk1", "out.html"]);
  });

  it("exits 1 for an unwritable output folder and leaves no half-written pair", () => {
    const dir = freshDir();
    const locked = join(dir, "locked");
    mkdirSync(locked);
    chmodSync(locked, 0o555);
    const run = lazarus(KSBASE, "--xlsx", join(dir, "w.xlsx"), "--report", join(locked, "r.json"));
    chmodSync(locked, 0o755);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(join(locked, "r.json"));
    expect(readdirSync(dir)).toEqual(["locked"]);
    expect(readdirSync(locked)).toEqual([]);
  });

  it("gives byte-equal .xlsx, .json and .html on two runs", () => {
    const [a, b] = [freshDir(), freshDir()];
    for (const dir of [a, b]) {
      expect(lazarus(KSBASE, "--xlsx", join(dir, "w.xlsx"), "--report", join(dir, "r.json")).status).toBe(0);
      expect(lazarus(KSBASE, "--report", join(dir, "r.html")).status).toBe(0);
    }
    for (const name of ["w.xlsx", "r.json", "r.html"]) expect(readFileSync(join(a, name)).equals(readFileSync(join(b, name))), name).toBe(true);
  });

  it("leaves nothing behind for a missing input", () => {
    const dir = freshDir();
    const run = lazarus(join(dir, "missing.wk1"), "--xlsx", join(dir, "o.xlsx"));
    expect(run.status).toBe(2);
    expect(existsSync(join(dir, "o.xlsx"))).toBe(false);
  });
});
