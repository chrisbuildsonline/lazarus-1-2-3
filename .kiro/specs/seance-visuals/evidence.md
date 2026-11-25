# Evidence: Seance visuals (F15)

The numbers below were measured on `main` when task 7 was closed. Nothing was run while writing this file.

## Gate

| Command | Result |
| --- | --- |
| `bun run typecheck` | clean |
| `bun run test` | 178 files, 2025 tests passed |
| `CI=1 PORT=4396 bun run e2e` | 86 passed |

The e2e run used port 4396 because another process held 4173.

F15 changed nothing under `src/parser`, `src/formula`, `src/verify`, `src/xlsx`, `src/macro`, `fixtures/` or `mcp/` (requirement 30).

## Main-thread task during the sweep

`e2e/seance-responsive.spec.ts` raises a generated 5,000-formula sheet. The longest main-thread task, with the sweep running, was 96.0 ms. The limit is 200 ms.

## Contrast

The table in `design/DESIGN.md` section 2 is pasted from the output of `tests/unit/ui/tokens-css.test.ts`. It has 42 pairs and all pass (text pairs at 4.5 or more, graphic and focus-ring pairs at 3.0 or more).

- Tightest text pair: `--text-muted` on `--accent-soft`, 5.71.
- Tightest graphic pair: `--status-unverifiable-mark` on its pill tint, 4.65.

## Existing tests that changed, and why

| Test | Change and reason |
| --- | --- |
| `tests/unit/report/tokens.test.ts` | Report `TOKENS` now follow the paper block of DESIGN.md for colour, ghost and shadow names. It also checks that the report page carries none of `#0d0b14`, `#17141f`, `#efeaf6`. That check lives here, not in `html.test.ts`. |
| `tests/unit/ui/tokens-css.test.ts` | Asserts the seance values, the contrast pairs, and the names of the paper block. |
| `tests/unit/ui/css-tokens.test.ts` | The circle sizes 140px and 220px were added to the named sizes. The rules (no colour literal, no literal duration, no `infinite`, no `!important`) are unchanged. |
| `e2e/seance-states.spec.ts`, `e2e/seance-layout.spec.ts`, `e2e/seance-a11y.spec.ts` | They read a colour, or awaited `animation.finished`, while a 250 ms cell transition ran or was cancelled at the sweep end. They now wait for `data-sweep` to be `done` and tolerate a cancelled transition. |

## New tests

- Unit: `tests/unit/ui/model/sweep.test.ts`, `tests/unit/ui/model/runes.test.ts`, `tests/unit/ui/components/summoning-circle.test.tsx`, sweep cases in `grid.test.tsx` and `totals-surface.test.tsx`.
- e2e: `e2e/seance-visuals-theme.spec.ts`, `e2e/seance-visuals-sweep.spec.ts`, `e2e/seance-visuals-circle.spec.ts`.
- axe, four new cases in `e2e/seance-a11y.spec.ts`: Summon at 390, sample Sheet at 1440 and at 390, Sheet during and after the sweep.

## Deviations from the tasks

- Screenshots of Summon and Sheet went to `docs/screenshots` (the README image lines). The files in `e2e/screenshots` were regenerated dark.
- The sweep e2e does not compare a JSON report downloaded with and without the sweep.
- The sweep e2e does not revisit a sheet tab.
- The sweep e2e does not assert WK3 cells grey, because WK3 formulas are now decoded and can match (another feature).
- `initialScrollLeft` takes an optional last formula column, so the sample opens with both N and O in view.
- The sweep is skipped per sheet with a `WeakSet` of verification objects.

## Requirement to test

Test file paths are under `tests/unit/` (`ui/...`, `report/...`) or `e2e/`. A "gap" names a part of the requirement that no listed test covers.

| Req | Tests |
| --- | --- |
| 1 | `e2e/seance-visuals-theme.spec.ts` (body background, light `colorScheme` changes nothing) |
| 2 | `tests/unit/ui/tokens-css.test.ts` |
| 3 | `e2e/seance-visuals-theme.spec.ts` (pill colours, one primary pill); `tokens-css.test.ts` |
| 4 | `e2e/seance-visuals-theme.spec.ts` (Matched pill text, Mismatched cell); `tokens-css.test.ts` |
| 5 | `tests/unit/ui/tokens-css.test.ts` (42 pairs) |
| 6 | `tests/unit/ui/tokens-css.test.ts` output pasted into `design/DESIGN.md` section 2 |
| 7 | `tests/unit/report/tokens.test.ts` (paper block, no seance canvas, surface or text value in the report) |
| 8 | `tests/unit/ui/tokens-css.test.ts` (paper block names) |
| 9 | `tests/unit/ui/css-tokens.test.ts` |
| 10 | `tests/unit/ui/components/summoning-circle.test.tsx`; `e2e/seance-visuals-circle.spec.ts` (2 rings, 5 candles, at least 8 runes); `tests/unit/ui/model/runes.test.ts` |
| 11 | `summoning-circle.test.tsx` (one button, `aria-hidden`, no `tabindex`, same text); `e2e/seance-visuals-circle.spec.ts` (accessible name) |
| 12 | `e2e/seance-visuals-circle.spec.ts` (synthetic drop, file and folder pickers, Enter and Space); existing DropZone and Summon tests unchanged |
| 13 | `e2e/seance-visuals-circle.spec.ts` (hover and drag-over change glow and rune transform); `summoning-circle.test.tsx` (no `animation` or `infinite` for the circle) |
| 14 | `e2e/seance-visuals-circle.spec.ts` (reduced motion: rune transform stays `none`) |
| 15 | `summoning-circle.test.tsx` (no colour literal in attributes); `e2e/seance-visuals-circle.spec.ts` (no request leaves the page) |
| 16 | `e2e/seance-visuals-circle.spec.ts` (viewport at 1440x900, no sideways scroll at 390) |
| 17 | `e2e/seance-visuals-sweep.spec.ts` (sweep runs on the sample). Gap: no revisit of a sheet tab (see deviations). |
| 18 | `e2e/seance-visuals-sweep.spec.ts` (cell status classes, `mixed-status.wk1` rose and grey); `grid.test.tsx` (`cell--unlit`, no status class) |
| 19 | `tests/unit/ui/model/sweep.test.ts` (partial totals, monotonic); `totals-surface.test.tsx`; `e2e/seance-visuals-sweep.spec.ts` (Matched counts non-decreasing, Verified starts below final) |
| 20 | `sweep.test.ts` (last step equals engine totals); `e2e/seance-visuals-sweep.spec.ts` (`data-sweep="done"`, `data-lit="160"`, final totals) |
| 21 | `grid.test.tsx` (real status in `aria-label` while unlit); `totals-surface.test.tsx` (`aria-hidden` figures, engine figures in hidden text); `e2e/seance-visuals-sweep.spec.ts`. Gap: no JSON report comparison with and without the sweep (see deviations). |
| 22 | `tests/unit/ui/model/sweep.test.ts` (duration at most 2500, rise per frame) |
| 23 | `e2e/seance-visuals-sweep.spec.ts` (reduced motion: `done` on first read, no running animation) |
| 24 | `e2e/seance-visuals-sweep.spec.ts` (filter change ends the sweep in its final state). Gap: no case for the other user actions. |
| 25 | `e2e/seance-visuals-sweep.spec.ts` (DBF shows no sweep). Gap: no named test for the zero-formula sheet or the phone list. |
| 26 | `sweep.test.ts` (`initialScrollLeft`); `e2e/seance-visuals-sweep.spec.ts` (first formula column in view) |
| 27 | Gap: no named test for cancelling the frame request, timers and listeners on unmount. |
| 28 | `sweep.test.ts`, `runes.test.ts`, `summoning-circle.test.tsx`, and the three `e2e/seance-visuals-*.spec.ts` files |
| 29 | `e2e/seance-a11y.spec.ts` (Summon at 390, sample Sheet at 1440 and 390, Sheet during and after the sweep, plus the existing cases) |
| 30 | No change under the listed folders, no new dependency (gate facts above). Not covered by a test. |
