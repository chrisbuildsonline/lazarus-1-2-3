# Requirements: project scaffold and test gate

Goal: an empty but runnable app with the test gate from tech.md wired up, so later features start red-first.

## EARS requirements

1. The project SHALL use bun as its only package manager and script runner, and SHALL NOT contain `package-lock.json`, `yarn.lock` or `pnpm-lock.yaml`.
2. The project SHALL provide a Vite + React app written in TypeScript with `strict` enabled.
3. WHEN `bun run dev` is run, the system SHALL start the Vite dev server.
4. WHEN `bun run build` is run, the system SHALL produce a static production build with no network fetches of remote fonts or scripts.
5. WHEN `bun run typecheck` is run, the system SHALL run `tsc --noEmit` and exit 0 if there are no type errors.
6. WHEN `bun run test` is run, the system SHALL run `vitest run` over `tests/` and exit 0 if all tests pass.
7. WHEN `bun run test:watch` is run, the system SHALL start Vitest in watch mode.
8. WHEN `bun run e2e` is run, the system SHALL run the Playwright specs under `e2e/` and exit 0 if all pass.
9. WHEN the Playwright smoke test loads the app, IF the page emits any console error or uncaught page error, THEN the test SHALL fail.
10. WHEN `bun run oracle` is run, IF `mcp/lotus-oracle` has no server entry point yet, THEN the system SHALL print that the oracle is not built yet and exit 0.
11. WHEN `bun run oracle` is run, IF `mcp/lotus-oracle` has a server entry point, THEN the system SHALL start it.
12. The repository SHALL contain the directory layout from structure.md: `src/{parser,formula,verify,xlsx,macro,ui,workers}`, `mcp/lotus-oracle`, `fixtures`, `tests/{unit,differential,property}`, `e2e`.
13. The repository SHALL contain at least one Vitest unit test under `tests/unit`.

## Acceptance

`bun run typecheck`, `bun run test` and `bun run e2e` all exit 0 on a clean checkout after `bun install`.

## Out of scope

Parsers, formula engine, XLSX writer, UI design tokens, real MCP server, CI configuration.
