# Seance UI evidence

## CSP (task 34)

The lazarus-csp plugin in `vite.config.ts` (apply build) adds this policy to the production `index.html`:

`default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'`

No directive was loosened. `e2e/seance-privacy.spec.ts`: 2 passed. The code scan of task 2 is unchanged.

| Point from design.md | Result |
| --- | --- |
| Inline script | None in the production `index.html`: one external module script and one stylesheet. |
| React style property writes | Cause no CSP refusal. |
| Downloads | Blob anchor downloads work (KSBASE.xlsx, KSBASE.report.html, KSBASE.report.json), so `blob:` is not listed. |
| Favicon | The `data:` favicon is allowed by `img-src data:`. |
| Worker | Loads under `worker-src 'self'`. |
| Outside fetch | `fetch` to `https://example.invalid/x` is refused on `connect-src`, and no request leaves. |
| Session requests | Every request is a GET to the app origin with no body or query, path `/` or `/assets/`, and one fetch of the sample. No file name or SHA-256 appears in any URL. No websocket, no service worker, empty storage. |
| Negative control | A POST to `/x` makes the check fail, so the check can detect a violation. |


## Browser probe (task 3)

`e2e/seance-probe.spec.ts` builds a throwaway app with the repo's `vite.config.ts` and serves it with `vite preview`. Findings (Vite 8, Playwright Chromium):

- (a) `?no-inline` alone is not honoured for .wk1/.WK1. Vite does not know the extension as an asset, keeps the query in the file name and fails with "Could not load ...?no-inline". `?url&no-inline` works for both cases: KSBASE.WK1 becomes `/assets/KSBASE-<hash>.WK1` (upper case kept) serving 24,291 bytes with the manifest SHA-256, and the 691-byte functions.wk1 is emitted as `/assets/functions-<hash>.wk1`, not inlined as `data:`. No `vite.config.ts` change is needed.
- (b) `new Worker(new URL("<path>.worker.ts", import.meta.url), { type: "module" })` is emitted as `/assets/<name>.worker-<hash>.js`, loads from the app origin and answers a message. The transferred buffer is detached on the page, the worker posts read, check, then raised with the manifest SHA-256, and Web Crypto works inside the worker. No config change is needed.
- (c) `locator.setInputFiles(<directory>)` on `<input type="file" webkitdirectory>` gives one File per file in the tree, with `webkitRelativePath` `<folder>/<sub>/<name>`, sub-folders included.
- (d) A drop event carrying a DataTransfer built in the page with `items.add(file)` reaches the handler, but `webkitGetAsEntry()` returns null for every item. Only a drop from the OS has a file-system entry. `dataTransfer.files` holds the files, so the fallback to `files` is the path e2e drops take. Folder drops stay covered by fake entries in Vitest.
- (e) `crypto.subtle.digest` exists on `http://localhost` (`isSecureContext` is true).

## Axe (task 36)

`e2e/seance-a11y.spec.ts` runs @axe-core/playwright 4.14.0 with the tags wcag2a, wcag2aa, wcag21a, wcag21aa and best-practice on these views, all under reducedMotion reduce:

- the Summon view
- the failed-file view
- the Sheet view at 1440x900 and at 390x844
- the Sheet view with the drawer open (1440) and with the dialog open (390)
- the batch view

It also scans the Sheet view once more without reduced motion, after its animations finish.

Result: zero violations of any impact. No lesser findings were printed. No axe rule is disabled.

One finding was fixed during the task: serious `label-content-name-mismatch` on the phone status-list rows. The visible text ran together as `C1A1+B16Mismatched` while the aria-label read "C1, A1+B1, 6, Mismatched". The fix puts spaces between the parts in `src/ui/components/StatusList.tsx`.

The same spec checks:

- the focus ring (computed box-shadow equals the `--focus-ring` token) on the primary pill, a text button, a filter tab, a grid cell and the drawer close button
- the status text in the accessible name of grid cells, list rows, the drawer pill and batch rows
- phone controls at least 44px high and the phone primary pill 48px
- keyboard-only file choice and XLSX download

`e2e/seance-a11y.spec.ts`: 9 passed.

## Layout (task 37)

`e2e/seance-layout.spec.ts`: 8 passed. It runs at 1440x900 and 390x844 on Summon, the sample Sheet, mixed-status.wk1 with the drawer or dialog open, and a batch with a no-formula file.

Two defects were found and fixed in `src/ui/styles/app.css`:

- The Summon view at 390 scrolled sideways (scrollWidth 446 for clientWidth 390) because the candle glow reaches 20% past the drop zone. Fixed with `overflow-x: clip` on `.page`.
- Batch rows in the 320px panel cut "constants.wk1", "mismatch.wk1" and "66.6% verified, 1 mismatched" with an ellipsis. Fixed with a grid that puts the pill beside the name and the kind and short line on the row under it.

Screenshots are attached to the Playwright report. There is no pixel baseline.

## Responsiveness (task 38)

`e2e/seance-responsive.spec.ts` builds a 5,000-formula WK1 with `scripts/lib/wk1-writer.ts`, drops it, and watches longtask entries and a requestAnimationFrame counter. A control first runs a 120 ms busy loop in a page task and the observer must record it (it does), so a clean run means something.

Longest long task between the drop and the first grid row, limit 200 ms:

| Run | Longest long task | Frames | Frames with progress surface shown |
| --- | --- | --- | --- |
| Spec alone | none recorded (no task of 50 ms or more) | 55 | 7 |
| Full parallel e2e run | 94.0 ms | 107 | 14 |

An 8,192 by 256 generated sheet keeps fewer than 2,000 gridcells in the DOM, also after scrolling to the middle.

## Requirements 63 to 81

| Requirement | Test |
| --- | --- |
| 63 | `tests/unit/ui/purity.test.ts` (network and storage scan of `src/ui` and `src/workers`) |
| 64 | `e2e/seance-privacy.spec.ts` (CSP meta; fetch to another origin blocked) |
| 65 | `e2e/seance-privacy.spec.ts` (every request GET, same origin, no body or query; negative control) |
| 66 | `e2e/seance-privacy.spec.ts` (storage, cookies, caches, IndexedDB empty) and `tests/unit/ui/purity.test.ts` |
| 67 | `e2e/seance-a11y.spec.ts` (axe on every view) |
| 68 | `e2e/seance-a11y.spec.ts` (focus ring, status text in names) and `tests/unit/ui/components/status-pill.test.tsx` (glyph shapes) |
| 69 | `e2e/seance-a11y.spec.ts` (keyboard file choice and download) and `e2e/seance-drawer.spec.ts` (grid keys, Enter, Escape) |
| 70 | `e2e/seance-a11y.spec.ts` (phone 44px controls, 48px pill) |
| 71 | `tests/unit/ui/components/error-panel.test.tsx`, `progress-surface.test.tsx`, `toast.test.tsx` and `e2e/seance-worker-failure.spec.ts` |
| 72 | `tests/unit/ui/tokens-css.test.ts` (reduced-motion rule), `tests/unit/ui/css-tokens.test.ts` (no infinite) and `e2e/seance-a11y.spec.ts` (scans under reduced motion) |
| 73 | `tests/unit/ui/tokens-css.test.ts` and `tests/unit/report/tokens.test.ts` |
| 74 | `tests/unit/ui/css-tokens.test.ts` |
| 75 | `e2e/seance-layout.spec.ts` (no horizontal scroll) |
| 76 | `e2e/seance-layout.spec.ts` (no console error, page error or failed request across sample, files, drawer, batch and downloads) |
| 77 | `tests/unit/ui/model/*.test.ts`, `tests/unit/ui/drop.test.ts`, `tests/unit/workers/raise-protocol.test.ts` |
| 78 | `tests/unit/ui/components/*.test.tsx` |
| 79 | `e2e/seance-sample`, `seance-files`, `seance-drawer`, `seance-states`, `seance-downloads`, `seance-batch`, `seance-worker-failure`, `seance-privacy`, `seance-a11y` and `seance-layout` specs |
| 80 | `e2e/fixtures/seance-files.ts` (mismatch.wk1, mixed-status.wk1 built with wk1-writer, not in the manifest) used by `e2e/seance-drawer.spec.ts` and `e2e/seance-states.spec.ts` |
| 81 | The final gate (task 41) |
