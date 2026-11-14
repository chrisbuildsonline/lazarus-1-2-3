import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const entry = "mcp/lotus-oracle/src/index.ts";

if (!existsSync(entry)) {
  console.log("lotus-oracle is not built yet");
  process.exit(0);
}

const result = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status ?? 1);
