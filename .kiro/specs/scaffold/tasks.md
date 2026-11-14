# Tasks: project scaffold and test gate

Red first: write each test before the code that makes it pass.

- [ ] 1. Init with bun: `package.json` (name, private, type module), install dependencies listed in design.md, commit `bun.lock`. (Req 1)
- [ ] 2. Add `tsconfig.json` with `strict`. Add `typecheck` script. (Req 2, 5)
- [ ] 3. Create the directory layout with `.gitkeep` files. (Req 12)
- [ ] 4. Red: write `tests/unit/smoke.test.ts` and `vitest.config.ts`. Run `bun run test` with no `test` script behaviour yet and confirm it fails or is missing. Then add the `test` and `test:watch` scripts and make it pass. (Req 6, 7, 13)
- [ ] 5. Add `index.html`, `vite.config.ts`, `src/ui/main.tsx`, `src/ui/App.tsx` (heading only), and the `dev`, `build`, `preview` scripts. (Req 2, 3, 4)
- [ ] 6. Red: write `e2e/smoke.spec.ts` (heading visible, zero console and page errors) and `playwright.config.ts`. Run it before the app exists and confirm it fails. Then make it pass. Add the `e2e` script. (Req 8, 9)
- [ ] 7. Write `scripts/oracle.ts` and the `oracle` script. Check that it prints the "not built yet" message and exits 0. (Req 10, 11)
- [ ] 8. Prove the smoke test catches errors: temporarily add `console.error("x")` to `App.tsx`, confirm `bun run e2e` fails, then remove it. (Req 9)
- [ ] 9. Run the gate: `bun run typecheck`, `bun run test`, `bun run e2e` all exit 0. Check `bun run build` succeeds. (Acceptance)
- [ ] 10. Add a short README "Setup" section: `bun install`, `bunx playwright install chromium`, and the script list.
