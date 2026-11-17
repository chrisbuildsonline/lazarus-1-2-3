import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// exceljs needs no resolve.alias or define: for a browser build Vite follows its package.json
// "browser" field to the self-contained dist/exceljs.min.js (checked by e2e/xlsx-browser.spec.ts).
export default defineConfig({
  plugins: [react()],
});
