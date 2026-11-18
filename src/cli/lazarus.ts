// lazarus CLI entry: bun run lazarus <path> [--json] [--verify] [--xlsx <out.xlsx>] [--report <out.json|out.html>]
// Lists format, size and sha256 of each file. With --verify it also parses each WK1, WKS, WK3 and
// DBF file, recalculates its formulas and adds the matched, mismatched and unverifiable counts
// (summed over sheets). With --xlsx and/or --report it writes the workbook and the provenance
// report for one such file (export.ts).
// Exit codes: 0 ok (unknown formats, mismatched and unverifiable cells included), 1 some file could
// not be read, 2 bad usage or missing path.
import { readFile, stat } from "node:fs/promises";
import { USAGE, parseArgs } from "./args.ts";
import { runExport } from "./export.ts";
import { formatLine, inventoryFile, walk, type Entry } from "./inventory.ts";
import { VERIFY_NOTICE, formatSummary, summarizeFile, summaryJson, type VerifySummary } from "./verify-summary.ts";

type Listed = { entry: Entry; summary: VerifySummary | null };

async function main(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  const verify = args.includes("--verify");
  const exporting = parsed.kind === "ok" && (parsed.xlsx !== null || parsed.report !== null);
  process.stderr.write(verify || exporting ? `${VERIFY_NOTICE}\n` : "lazarus: inventory only. Parsing is not implemented yet.\n");
  if (parsed.kind === "usage") {
    process.stderr.write(`lazarus: ${parsed.message}\n${USAGE}\n`);
    return 2;
  }
  if (exporting) return runExport(parsed);
  const { path, json } = parsed;
  try {
    await stat(path);
  } catch {
    process.stderr.write(`lazarus: no such file or folder: ${path}\n`);
    return 2;
  }

  const listed: Listed[] = [];
  let code = 0;
  try {
    for await (const file of walk(path)) {
      try {
        const entry = await inventoryFile(file);
        const spreadsheet = entry.format === "wk1" || entry.format === "wks" || entry.format === "wk3" || entry.format === "dbf";
        listed.push({ entry, summary: verify && spreadsheet ? summarizeFile(new Uint8Array(await readFile(file))) : null });
      } catch (err) {
        process.stderr.write(`lazarus: cannot read ${file}: ${(err as Error).message}\n`);
        code = 1;
      }
    }
  } catch (err) {
    process.stderr.write(`lazarus: cannot walk ${path}: ${(err as Error).message}\n`);
    code = 1;
  }
  if (json) process.stdout.write(`${JSON.stringify(listed.map(({ entry, summary }) => (summary ? { ...entry, verify: summaryJson(summary) } : entry)))}\n`);
  else if (listed.length > 0) process.stdout.write(`${listed.map(({ entry, summary }) => [formatLine(entry), ...(summary ? [formatSummary(summary)] : [])].join("\t")).join("\n")}\n`);
  return code;
}

process.exitCode = await main(process.argv.slice(2));
