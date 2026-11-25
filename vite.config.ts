import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

// Production only: Vite's dev server needs inline scripts and a WebSocket for HMR (design.md,
// "Content Security Policy"; requirement 64). connect-src also allows the optional local model, which
// only the Macros view asks (macro-translator requirements 49 and 50).
export const CSP =
  "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' http://localhost:11434; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";

const csp = (): Plugin => ({
  name: "lazarus-csp",
  apply: "build",
  transformIndexHtml: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" }],
});

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

/** `vite preview` port: $PORT if set, else 4173. A container maps it with `docker run -p`. */
export function previewPort(env: Record<string, string | undefined> = process.env): number {
  if (!env.PORT) return 4173;
  const port = Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`PORT must be a port number, got "${env.PORT}"`);
  return port;
}

// exceljs needs no resolve.alias or define: for a browser build Vite follows its package.json
// "browser" field to the self-contained dist/exceljs.min.js (checked by e2e/xlsx-browser.spec.ts).
export default defineConfig({
  plugins: [react(), csp()],
  // The report's tool.version (requirement 52), declared in src/ui/env.d.ts.
  define: { __LAZARUS_VERSION__: JSON.stringify(version) },
  // All interfaces, so the app answers from inside a container. The app is static files with no
  // backend, so any Host header may read them (allowedHosts), e.g. a judge's own container name.
  preview: { host: "0.0.0.0", port: previewPort(), strictPort: true, allowedHosts: true },
});
