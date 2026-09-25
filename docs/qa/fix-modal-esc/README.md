# Round 102: Esc closes every modal from its first frame, and the re-indexing line follows the library (F401–F402)

Source: web recheck 3 (`ESC-result-*.json`, `attach/report.json`). Every run is headless Chromium with Instant in OPFS.
"Before" is origin/main ba07e6a (raw export). "After" is this branch's deployable build (`apps/web/dist`, after `pn web:build`).
`checks.txt` lists every verdict and `gates.txt` the gates.

| F | Before | After |
|---|---|---|
| F401 | 15 trials per modal, Esc at 0/50/150/300 ms after it appears. The chat row menu, Documents details and Documents → Ask stay open in 12 of 15 at 1440 and 390, and so does the passage sheet at 390. The command palette at 1440 stays open in 3 of 15 (`before-*-stuck-*.png`, `ESC-before-*.json`). | 0 of 15 stuck in all eight cases, with no navigation behind the modal (`ESC-after-*.json`). |
| F402 | The line reads "Still re-indexing 1 of 1 document" before and after the log's `indexed ·` line (`F402-before-0-pending.png`, `F402-before-2-after-indexed.png`, `REINDEX-before.json`). | It reads "Still re-indexing" while the rebuild runs (`F402-after-0-pending.png`). It changes to "Re-indexing finished…" when the log says indexed (`F402-after-0-done.png`, `F402-after-2-after-indexed.png`). The next question has no line, and its `[rag]` line has no `reindexing=` and cos 0.835 (`F402-after-3-next-answer.png`, `REINDEX-after.json`). |

Scope notes. The palette exists only in a wide window. At 1440 a citation opens the side panel, not a modal. ModelDetails,
HfSearch and the vault confirm are phone-only screens, because the web bundle resolves `VaultEntry.web.tsx`. The web
paywall has no licence-key entry. Those modals are covered by `AppModal`, the ESLint rule and `test/fixes-r102.test.ts`.

Red first: `F402-red-unit.txt` is the new `reindex.test.ts` case failing on the old `AskResult`. `F401-lint-guard-red.txt`
is ESLint and the test rejecting a probe file that imports `Modal`. The probe file was deleted.

Commands (from this folder, with a `pn web:serve` host on `BASE`):

```
DIST=../../../apps/web/dist PORT=8763 MODELS_DIR=/path/to/.models node ../../../scripts/serve-web.mjs
OUT=/tmp/r102 BASE=http://127.0.0.1:8763 PROFILE=p node setup.mjs
OUT=/tmp/r102 BASE=http://127.0.0.1:8763 PROFILE=p TAG=after W=1440 node esc.mjs
OUT=/tmp/r102 BASE=http://127.0.0.1:8763 PROFILE=p TAG=after W=390 node esc.mjs
OUT=/tmp/r102 BASE=http://127.0.0.1:8763 PROFILE=fresh TAG=after node reindex.mjs
```
