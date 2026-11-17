import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

// exceljs needs no resolve.alias or define: for a browser build Vite follows its package.json
// "browser" field to the self-contained dist/exceljs.min.js (checked by e2e/xlsx-browser.spec.ts).
export default defineConfig({
  plugins: [react()],
  // The report's tool.version (requirement 52), declared in src/ui/env.d.ts.
  define: { __LAZARUS_VERSION__: JSON.stringify(version) },
});
