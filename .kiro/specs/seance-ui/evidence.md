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
