// lazarus CLI entry: bun run lazarus <path> [--json]
// Lists format, size and sha256 of each file. Inventory only; it does not parse cells yet.
// Exit codes: 0 ok (unknown formats included), 1 some file could not be read, 2 bad usage or missing path.
import { stat } from "node:fs/promises";
import { formatLine, inventoryFile, walk, type Entry } from "./inventory.ts";

async function main(args: string[]): Promise<number> {
  process.stderr.write("lazarus: inventory only. Parsing is not implemented yet.\n");
  const json = args.includes("--json");
  const paths = args.filter((a) => a !== "--json");
  const path = paths[0];
  if (paths.length !== 1 || path === undefined) {
    process.stderr.write("usage: bun run lazarus <path> [--json]\n");
    return 2;
  }
  try {
    await stat(path);
  } catch {
    process.stderr.write(`lazarus: no such file or folder: ${path}\n`);
    return 2;
  }

  const entries: Entry[] = [];
  let code = 0;
  try {
    for await (const file of walk(path)) {
      try {
        entries.push(await inventoryFile(file));
      } catch (err) {
        process.stderr.write(`lazarus: cannot read ${file}: ${(err as Error).message}\n`);
        code = 1;
      }
    }
  } catch (err) {
    process.stderr.write(`lazarus: cannot walk ${path}: ${(err as Error).message}\n`);
    code = 1;
  }
  if (json) process.stdout.write(`${JSON.stringify(entries)}\n`);
  else if (entries.length > 0) process.stdout.write(`${entries.map(formatLine).join("\n")}\n`);
  return code;
}

process.exitCode = await main(process.argv.slice(2));
