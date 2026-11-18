import { spawnSync } from "node:child_process";

const entry = "mcp/lotus-oracle/server.ts";

const result = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status ?? 1);
