# Fixes round 31 — evidence (stream `fixes-r26`, 22.9.2026)

Findings F92–F96, from `mosheai-final-6-2026-09-22.md` §3. Static run: no device, no emulator, no browser beyond the
headless `web:smoke` harness.

| file | what it proves |
|---|---|
| `F92-F94-red.txt` | `apps/mobile/test/legal-texts.test.ts` run with `docs/legal`, `apps/site/src` and `apps/site/build.mjs` stashed back to `main`: **18 of 38 fail** — every placeholder file, both DRAFT notices, the rendered screen body, the open-source claims in the policy, `proof.html` and `support.html`, the Secure Enclave sentence, and the incognito line. Green on the fixed tree. Appended: the no-postal-address guard watched red with the address put back. |
| `F95-red.txt` | the incognito suite with the unconditional `copyIntoLibrary` restored and the sweep disabled: **2 of 6 fail** — the attachment lands in the library directory, and the file a crashed session left behind survives the next launch. |
| `F92-web-bundle.txt` | `grep` over the built web bundle (`apps/web/dist/_expo/static/js/web/index-*.js`), the same artefact shape MosheAI grepped inside `Inborn.xcarchive/main.jsbundle` and `index.android.bundle`: `{{COPYRIGHT}}` twice and no other token, zero `Status: DRAFT`, and the filled values present (`models.inbornapp.com`, `support@inbornapp.com`, the support phone number, the Israeli-law clause). |
| `tests.txt` | the whole suite: **991 passed** (core 616, mobile 353, i18n 11, ui 11). |

Gates run after the fix, all clean: `pn typecheck`, `pn lint`, `pn test`, `pn web:build`,
`MODELS_DIR=… pn web:smoke` (6/6 PASS), `node apps/site/build.mjs` + `node apps/site/check.mjs`
(7 pages, no scripts, no external assets, no dead links).

`apps/site/dist/privacy.html` after the rebuild: zero `{{`, zero `Status: DRAFT`, zero `class="ph"` placeholder chips.
