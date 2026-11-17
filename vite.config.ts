import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

// Production only: Vite's dev server needs inline scripts and a WebSocket for HMR (design.md,
// "Content Security Policy"; requirement 64).
export const CSP =
  "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";

const csp = (): Plugin => ({
  name: "lazarus-csp",
  apply: "build",
  transformIndexHtml: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" }],
});

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

// exceljs needs no resolve.alias or define: for a browser build Vite follows its package.json
// "browser" field to the self-contained dist/exceljs.min.js (checked by e2e/xlsx-browser.spec.ts).
export default defineConfig({
  plugins: [react(), csp()],
  // The report's tool.version (requirement 52), declared in src/ui/env.d.ts.
  define: { __LAZARUS_VERSION__: JSON.stringify(version) },
});
