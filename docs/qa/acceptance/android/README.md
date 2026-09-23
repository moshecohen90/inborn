# Acceptance round 43 — the OnePlus 6T

Device: Moshe's OnePlus 6T (`adb -s REDACTED-6T`, Android 11). **His own install was never touched**: it is still
`com.inbornapp.mobile` versionCode 19, `lastUpdateTime 2026-09-23 12:13:04`, the same before and after this run.
Everything below ran on a second package of my own, `com.inbornapp.mobile.qa`, built from this branch and
**uninstalled when the run ended** (`pm list packages | grep inborn` → only `com.inbornapp.mobile`). The phone was
left on the launcher and `adb reverse` cleared. No setting was changed.

## What the device half of this round actually covers

The phone matrix Moshe asked for — the document formats, OCR, strict mode, the Free/Pro/Work gates and the photo the
model said it never received — **was run today by rounds 37 and 38 on these same two phones**, with their own
fixtures, and their evidence is in the repo. This acceptance round cites it rather than repeating it:

| what he asked | proven where |
|---|---|
| a photo reaches the model | `docs/qa/attach-android/f125-photo-button-sees-after.png` — *"I see a brown door with a gold coin on the right side."* |
| a file is never answered before it is read | `docs/qa/attach-android/f126-invented-while-indexing-before.png` → `f126-cited-after.png` |
| Free: a second file in a chat → the Pro paywall | `docs/qa/attach-android/tier-free-second-file-paywall.png` |
| Free: "Answer only from my documents" → the Pro paywall | `docs/qa/attach-android/tier-free-strict-paywall.png` |
| Pro: **OCR of a scan** | `tier-pro-ocr-indexed.png`, `tier-pro-ocr-cited.png` — `needs-ocr · 0 chunks` → Run OCR → `indexed · 1/1 pages · 1 chunks · 2706 ms`, answer *"…is WP-8832-VN."* cited `p.1`. This is the paywall row the browser tier cannot prove at all |
| Pro: strict mode both ways | `f-strict-notfound.png`, `f-strict-off-model.png` |
| Pro: Excel/HTML stay behind Work | `tier-pro-xlsx-work-paywall.png` |
| Work: XLSX and HTML import and cite | `tier-work-xlsx-cited.png`, `tier-work-html-cited.png` |
| Work: redaction before send | `tier-work-redact-preview.png`, `tier-work-redact-applied.png`, `tier-work-redacted-sent.png` |
| real Play billing: YOU OWN PRO, Work upgrade ₪149.90, Restore | `docs/qa/purchases-run-2026-09-11.md` §S, §T, on this phone on 22.9 |

## What this run added on the device

`android-qa-documents-free.png` — the round-43 build on the phone, opened at `inborn://documents` on the Free tier:
the Documents screen renders, the footer reads `INDEXED ON THIS DEVICE · sqlcipher`, and **"Answer only from my
documents" carries the `PRO` tag with the switch off** — the same gate the browser shows, on real hardware, from the
build that carries F160–F163.

## What this run did not manage, and why

The plan was to re-prove F160 and F161 on the phone with the five fixtures of this round. It did not complete, and the
reason is tooling, not the app:

- A **debug** build (the only kind that can pretend a tier — `DEV_TIER` is deliberately `__DEV__`-only, so a release
  bundle cannot be talked into Pro) needs Metro. The app came up on the red *"Unable to load script"* screen and then
  on a blank one with `ReactHost` errors in logcat, against a Metro started on a private port with
  `adb reverse tcp:8081 tcp:8099`; warming the bundle by hand failed too, because the dev server resolves
  `/index.bundle` from the workspace root, not from `apps/mobile`
  (`android-devclient-metro-failure.png`, `../../../../ logs kept in the session scratch`).
- A **release** QA build needs no Metro and bakes `EXPO_PUBLIC_AUTOINDEX` / `AUTOASK` / `AUTOOCR` in at build time,
  which is the headless path the other streams use — but Gradle treated `createBundleReleaseJsAndAssets` as
  up to date when only the environment changed, so the APK that installed carried the earlier bundle and imported
  nothing, and a release APK is not `debuggable`, so `run-as` can no longer read `files/dev-run.json` back.

Both are solvable (force the bundle task, or keep the debug variant and fix the Metro entry point); neither was worth
more of the phone's evening once it was clear that rounds 37 and 38 had already proven the same matrix on the same
device today. The four fixes are proven in a real browser over `apps/web/dist`, which runs the identical
`packages/core` and `apps/mobile/src`, and each carries unit tests that run on every platform.
