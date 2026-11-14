# Design: project scaffold and test gate

## Layout

Directories from structure.md. Empty ones hold a `.gitkeep`. `src/ui/` holds `main.tsx` and `App.tsx`; `index.html` sits at the repo root.

```
index.html  vite.config.ts  vitest.config.ts  playwright.config.ts  tsconfig.json
src/ui/{main.tsx,App.tsx}   src/{parser,formula,verify,xlsx,macro,workers}/.gitkeep
mcp/lotus-oracle/.gitkeep   scripts/oracle.ts
tests/unit/smoke.test.ts    tests/{differential,property}/.gitkeep
e2e/smoke.spec.ts           fixtures/.gitkeep
```

## Choices

- **Dependencies**: react, react-dom; dev: vite, @vitejs/plugin-react, typescript, @types/react, @types/react-dom, vitest, fast-check, @playwright/test. fast-check is installed now because tech.md names it, but no property test is written yet.
- **tsconfig**: `strict`, `noEmit`, `jsx: react-jsx`, `moduleResolution: bundler`, `include` covers `src`, `tests`, `e2e`, `scripts` and the config files. Both `vite.config.ts` and `vitest.config.ts` stay separate so Vitest ignores `e2e/`.
- **Vitest**: `include: ["tests/**/*.test.ts"]`, environment `node`. The first test asserts a trivial pure function or constant (for example `1 + 1`), only to prove the gate runs.
- **Playwright**: Chromium only. `webServer` runs `bun run build && bun run preview -- --port 4173` (or `bun run dev`), with `reuseExistingServer` off in CI. The smoke test registers `page.on("console")` for type `error` and `page.on("pageerror")`, loads `/`, asserts the heading is visible, then asserts the collected error list is empty. Browsers are installed with `bunx playwright install chromium`, a one-time step documented in the README.
- **Scripts**:
  - `dev`: `vite`
  - `build`: `vite build`
  - `preview`: `vite preview`
  - `typecheck`: `tsc --noEmit`
  - `test`: `vitest run`
  - `test:watch`: `vitest`
  - `e2e`: `playwright test`
  - `oracle`: `bun scripts/oracle.ts`
- **oracle script**: checks for `mcp/lotus-oracle/src/index.ts`. If missing, prints `lotus-oracle is not built yet` and exits 0. Otherwise it spawns the entry with bun and passes through the exit code.
- **App placeholder**: one heading, "Lazarus 1-2-3". No network calls, no remote assets (privacy constraints in tech.md).

## Risks

- Playwright browser download needs network once, at setup time. This is a developer step, not a runtime call.
- Console errors from a missing favicon fail the smoke test. Add an inline `<link rel="icon" href="data:,">` to `index.html`.
