// lazarus CLI entry: bun run lazarus <path> [--json] [--verify]
// Lists format, size and sha256 of each file. With --verify it also parses each WK1/WKS file,
// recalculates its formulas and adds the matched, mismatched and unverifiable counts.
// Exit codes: 0 ok (unknown formats, mismatched and unverifiable cells included), 1 some file could
// not be read, 2 bad usage or missing path.
import { readFile, stat } from "node:fs/promises";
import { formatLine, inventoryFile, walk, type Entry } from "./inventory.ts";
import { VERIFY_NOTICE, formatSummary, summarizeFile, summaryJson, type VerifySummary } from "./verify-summary.ts";

type Listed = { entry: Entry; summary: VerifySummary | null };

async function main(args: string[]): Promise<number> {
  const json = args.includes("--json");
  const verify = args.includes("--verify");
  process.stderr.write(verify ? `${VERIFY_NOTICE}\n` : "lazarus: inventory only. Parsing is not implemented yet.\n");
  const paths = args.filter((a) => a !== "--json" && a !== "--verify");
  const path = paths[0];
  if (paths.length !== 1 || path === undefined) {
    process.stderr.write("usage: bun run lazarus <path> [--json] [--verify]\n");
    return 2;
  }
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
        const spreadsheet = entry.format === "wk1" || entry.format === "wks";
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
