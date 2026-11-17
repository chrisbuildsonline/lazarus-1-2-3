// lazarus <file> --xlsx / --report (requirements 47 to 53). Reads one WK1/WKS file, builds every
// requested output in memory, and only then writes them: each to a temporary name first, renamed
// into place once all have been written, so a failure leaves no half-written pair.
import { readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { parseWk1 } from "../parser/index.ts";
import { buildReport, renderReportHtml, serializeReportJson, sha256Hex } from "../report/index.ts";
import { verifySheet } from "../verify/index.ts";
import { writeXlsx } from "../xlsx/index.ts";
import { USAGE, type ParsedArgs } from "./args.ts";
import { detectFormat } from "./inventory.ts";
import { formatSummary, summaryJson, type VerifySummary } from "./verify-summary.ts";

type Output = { path: string; bytes: Uint8Array | string };

/** The workbook and report for one file's bytes, in memory. Nothing is written. */
export async function buildOutputs(bytes: Uint8Array, fileName: string, args: ParsedArgs): Promise<{ outputs: Output[]; summary: VerifySummary }> {
  const { sheet, diagnostics } = parseWk1(bytes);
  const verification = verifySheet(sheet, fileName);
  const outputs: Output[] = [];
  if (args.xlsx !== null) outputs.push({ path: args.xlsx, bytes: (await writeXlsx({ sheet, verification })).bytes });
  if (args.report !== null) {
    // Read with readFile, not an import attribute, so the same code runs under bun and Vitest (design "CLI").
    const { version } = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };
    const report = buildReport({ fileName, sha256: await sha256Hex(bytes), byteLength: bytes.length, toolVersion: version, verification });
    outputs.push({ path: args.report.path, bytes: args.report.format === "json" ? serializeReportJson(report) : renderReportHtml(report) });
  }
  return { outputs, summary: { ...verification.totals, parseErrors: diagnostics.filter((d) => d.severity === "error").length } };
}

const canonical = async (path: string) => realpath(path).catch(() => resolve(path));

/** Runs the export for parsed arguments with --xlsx or --report set. Returns the exit code. */
export async function runExport(args: ParsedArgs): Promise<number> {
  const err = (line: string) => process.stderr.write(`${line}\n`);
  let isDir: boolean;
  try {
    isDir = (await stat(args.path)).isDirectory();
  } catch {
    err(`lazarus: no such file or folder: ${args.path}`);
    return 2;
  }
  if (isDir) {
    err(`lazarus: --xlsx and --report need a file, not a folder: ${args.path}\n${USAGE}`);
    return 2;
  }
  const input = await canonical(args.path);
  for (const out of [args.xlsx, args.report?.path]) {
    if (out != null && (await canonical(out)) === input) {
      err(`lazarus: ${out} is the same file as the input; refusing to overwrite it`);
      return 2;
    }
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(args.path));
  } catch (e) {
    err(`lazarus: cannot read ${args.path}: ${(e as Error).message}`);
    return 1;
  }
  const { format } = detectFormat(bytes, extname(args.path));
  if (format !== "wk1" && format !== "wks") {
    err(`lazarus: ${args.path}: not a Lotus 1-2-3 worksheet (format: ${format})`);
    return 1;
  }

  const { outputs, summary } = await buildOutputs(bytes, basename(args.path), args);
  const temps: string[] = [];
  try {
    for (const o of outputs) {
      const temp = `${o.path}.${process.pid}.partial`;
      await writeFile(temp, o.bytes, { flag: "wx" }); // never follow or reuse an existing path
      temps.push(temp);
    }
  } catch (e) {
    err(`lazarus: cannot write ${outputs[temps.length]!.path}: ${(e as Error).message}`);
    await Promise.all(temps.map((t) => unlink(t).catch(() => undefined)));
    return 1;
  }
  for (const [i, o] of outputs.entries()) await rename(temps[i]!, o.path);

  const written = outputs.map((o) => o.path);
  if (args.json) process.stdout.write(`${JSON.stringify({ path: args.path, written, verify: summaryJson(summary) })}\n`);
  else process.stdout.write(`${[...written.map((p) => `wrote ${p}`), `${args.path}\t${formatSummary(summary)}`].join("\n")}\n`);
  return 0;
}
