<!-- Audit of docs/spec-src/04..12 against main @ 274e730, 22.9.2026. -->

# Spec conformance audit — Inborn, 22.9.2026

Audited against `main` @ `274e730` on 22.9.2026. Read-only: no build, no emulator, no device and no browser were run for this audit.

## Executive summary (Hebrew)

‏**תקציר מנהלים — ביקורת התאמה למפרט, 22.9.2026**
‏**המסקנה בשורה אחת.** המוצר קרוב מאוד למפרט בשכבת הקוד, ורחוק ממנו בשכבת ההוכחה ובשכבת ההצהרות. אין כאן "הכול בסדר".

‏**מה שנמצא.** עברתי סעיף‑סעיף על תשעה קבצי מפרט מול הקוד ומול מסמכי ה‑QA. הדפוס של F42 חוזר עוד שמונה פעמים: מנגנון נבנה, תורגם לשמונה שפות, חוּוט עד הקצה — ואף מסך לא קורא אותו.

‏**הדוגמה החדה ביותר.** גיליון ההסבר של "החלפה אוטומטית ראשונה" (§8.8 שורה 4c): `policy.ts` מחשב את ההמלצה, `guard.ts` נועל אותה, `ackExplain()` קיים כדי לסגור אותה, וארבעה מפתחות תרגום נשלחים בכל שמונה השפות. בדקתי בעצמי: אף רכיב לא קורא לאף אחד מהם. זה F42 עם שובל נייר גדול יותר מאשר ל‑F42 עצמו.

‏**תשעה דברים חוסמים 1.0. אלה הארבעה החמורים.**

‏1. אנחנו מצהירים בפני אפל, בפני גוגל ובפני המשתמשים שיש מסנן family‑safe שמופעל כברירת מחדל. הוא לא קיים בקוד. זו הצהרה שקרית במדיניות פרטיות שפורסמה, ובתשובה שלנו לכלל 1.2 של אפל.
‏2. אף הגשה בקונסולות לא בוצעה. כל התשובות כתובות ומנומקות; אף אחת לא הוגשה. דירוג IARC הוא חסם קשיח — מאז יולי 2026 גוגל לא מקבלת אפליקציה בלי דירוג.
‏3. מדיניות הפרטיות מתארת נתיב הורדה שהאפליקציה לא משתמשת בו. היא מבטיחה Background Assets מתארחים אצל אפל ב‑iOS 26, ו‑QA תיעד אייפון אמיתי מוריד 1.2 ג'יגה מ‑`models.inbornapp.com`. זו בדיוק הטענה המרכזית של המוצר, סותרת את עצמה בכלי שהבוחן מסתכל בו.
‏4. אינקוגניטו לא שומר מסמך מצורף ב‑RAM בלבד. בדקתי בעצמי: `documents/db.native.ts:45-47` תמיד מחזיר את מאגר ה‑SQLCipher, ואין שום ענף לאינקוגניטו. שורת המסמך, עותק הקובץ והווקטורים שורדים את הסשן. שורות הצ'אט עצמן מטופלות נכון, ולכן נתיב המסמכים הוא החור היחיד — וזה בדיוק מה ש‑§7.5 מוכר כיתרון.

‏**המספר שביקשת לבדוק.** עמודת ההודעות בדסקטופ היא 680 בקוד, וזה תואם גם ל‑§8.9 וגם ל‑§9.3. ה‑760 נשאר רק בדמו. צריך לתקן את הדמו, לא את הקוד.

‏**מה שאי אפשר להוכיח.** אפליקציית הדסקטופ מעולם לא הופעלה. מסך S21 לא מופיע באף מסמך QA. מסך S32 לא קיים בכלל. ביומטריה מעולם לא נרשמה באף ריצה. אנימציית סגירת החותם מעולם לא נצפתה, לא במכשיר ולא בסימולטור. כל באנרי החום והסוללה נראו רק דרך תצוגת ה‑`__DEV__`.

‏**מה שעובד ומוכח.** מפת ההתאמה של §6.1 מדויקת לחלוטין: כל 32 תאי הציונים וכל ארבע שורות השפה תואמות למניפסט החתום v4 בלי הבדל אחד, וכל 12 מחרוזות הסטטוס של §6.5 מאומתות מילה במילה בבדיקות. ההיעדר של הרשאת INTERNET באנדרואיד מוכח על מכשיר אמיתי בשלוש דרכים בלתי תלויות. אימות הרכישה האופליין הוכח בדרך הקשה: רכישה אמיתית נדחתה כי המפתח היה ריק, וגוגל החזירה את הכסף אוטומטית. לוח הצבעים תואם ב‑21 מתוך 22 ערכים, והחריג היחיד הוא תיקון נגישות שהקוד צודק בו והמפרט טועה.

‏**ההמלצה.** לא להגיש לפני שסוגרים את תשעת הפריטים ב‑blocks‑1.0. חמישה מהם הם עבודת מסמכים של שעה עד יום, לא עבודת הנדסה.


## Why this audit exists

On 22.9.2026 Moshe noticed that §8.9's desktop layout had never been implemented, although seven QA passes had run and none had caught it. That became F42. The question this audit answers is not "does the app work" but "what else is in the spec, was never built, and was never noticed".

The answer is that F42 is not unique. It is one instance of a repeating pattern: a mechanism is designed, implemented in `packages/core`, translated into all eight shipped locales, wired to the edge of the UI, and then no screen reads it. Eight more instances are listed in this document, the sharpest being §8.8 row 4c.

## Method and proof bar

Every finding below comes from grep, file reading and the existing QA record. Every requirement sentence, bullet, table row and `elements` / `states` / `edge case` clause in the nine spec files was extracted and classified into exactly one bucket:

| Bucket | Means |
|---|---|
| **IMPLEMENTED+PROVEN** | A code citation **and** a QA row or screenshot showing it on real hardware or a real browser |
| **IMPLEMENTED-UNPROVEN** | The code is there; nothing in `docs/qa/` demonstrates it. The note says what proof is missing |
| **PARTIAL** | Part of the clause is built. The note says which part is not |
| **MISSING** | Not in the code at all |
| **DEFERRED-BY-DECISION** | Cited to an explicit deferring sentence in the spec, in `README.md:596-599` ("Intentionally not built for 1.0"), in `README.md:466` ("Declared cuts for 1.0"), or in the §14 status table |

**The proof bar is hardware.** An Android emulator, an iOS simulator and a headless browser do not make a requirement PROVEN. Only the OnePlus 6T, the OnePlus 11, the iPhone 13 Pro or a real browser session do. Where a simulator is the only evidence, the row says so and is classified UNPROVEN or PARTIAL. This is stricter than the QA documents themselves apply, and it is the reason several rows marked `done` in `docs/qa/edge-cases-matrix.md` appear here as unproven.

Where a claim is load-bearing I verified it personally rather than trusting the investigation. The greps behind gaps 1, 3, 5, 6, 10, 11, 17, 18 and 30 were re-run against the working tree at the time of writing.

## Two facts that limit what any audit can assert

**The native projects are not tracked.** `git ls-files apps/mobile/android` and `apps/mobile/ios` both return nothing; both directories are gitignored prebuild output. The only tracked native configuration is `app.config.ts` plus `apps/mobile/plugins/*`. Several iOS and Android claims rest on regenerated files, and at least one on-disk artifact is stale: the merged release manifest under `android/app/build/` still lists permissions the shipping build does not have. The QA runs and `scripts/check-android-permissions.sh` were used in its place.

**`PrivacyInfo.xcprivacy` is correct and unpinned.** All six required-reason API declarations are present and were verified by `plutil -p` in QA, and the file ships inside the archive. But `grep privacyManifest` over `app.config.ts` and `plugins/` returns nothing, and `ios/` is gitignored. It survives only because Expo's prebuild template happens to emit exactly these categories. One template change and it regresses silently.

## Coverage and counts

507 requirement clauses were extracted from the nine spec files and classified.

| Spec section | Clauses | PROVEN | UNPROVEN | PARTIAL | MISSING | DEFERRED |
|---|---:|---:|---:|---:|---:|---:|
| §4 platforms, §5 architecture, §6 models, §7 features | 111 | 49 | 8 | 32 | 18 | 4 |
| §8 screens (S01–S60, §8.8, §8.9) | 164 | 40 | 25 | 56 | 37 | 6 |
| §9 design system | 61 | 30 | 2 | 17 | 9 | 2 |
| §10 edge cases (70 rows) | 70 | 11 | 8 | 41 | 6 | 4 |
| §11 store and legal, §12 monetization | 101 | 48 | 11 | 27 | 9 | 4 |
| **Total** | **507** | **178** | **54** | **173** | **79** | **20** |

Three clauses are not applicable (§9.10's Claude design skills, which the spec itself says were not installed, and two store items with no code surface).

Read the two large columns together. **178 clauses are proven on real hardware, which is a genuinely strong result** for a product this size. But **173 are partial and 79 are absent**, and the great majority of those are small, specific omissions inside clauses that are otherwise built. That is the shape of this codebase: very little is wrong, a great deal is three-quarters finished, and almost none of the remainder was noticed before now.

§8 carries most of the damage: 37 missing clauses out of 164. That is expected, because §8 is where the spec is most granular, and it is where F42 came from.

## §4 — Platforms and the one codebase

Spec: `docs/spec-src/04-platforms.html` (113 lines).

| Requirement | Class | Evidence | Note |
|---|---|---|---|
| iOS via llama.rn (llama.cpp, Metal) | PROVEN | `apps/mobile/src/adapters/llamaRn.ts`; real iPhone 13 Pro chat turns across passes 5–12 | |
| Android via llama.rn | PROVEN | same adapter; ~200 turns on the OnePlus 6T across the soak runs | Hexagon NPU is experimental in the spec and absent in code; no deferring sentence names it |
| **Android manifest with no INTERNET permission** | PROVEN | `app.config.ts:88-104` `blockedPermissions`; T32 on the real 6T: no `dumpsys netstats` rows for the uid, `ss -tuapn` 0 sockets, Proof screen `OUT 0 B · IN 0 B` | The single best-evidenced requirement in the audit |
| Exodus zero trackers, Data Safety "no data collected" | PROVEN (scan) / UNPROVEN (filing) | T29: 432 tracker signatures against 40,604 dex classes, 0 hits; `TRACKERS 0` on both real devices | The Data Safety form is written and **not filed** |
| Windows **x64 + ARM** via Tauri v2 + `llama-cpp-2`, CUDA/Vulkan | PARTIAL | `.github/workflows/desktop.yml:70-88` builds `windows-latest` x64 Vulkan and x64 CPU | **No ARM64 job exists.** The spec promises ARM in the platform table |
| macOS Apple Silicon, same code, Tauri + Metal, notarized + sandboxed | UNPROVEN | CI builds macOS arm64; `verify-macos.sh` exists | **Never launched.** No notarized artifact, no runtime proof. README still lists it open |
| Web via wllama, same GGUF files | PROVEN | `adapters/wllama.ts`; `fixes-r21` offline second visit, 22 tok/s, 0 model fetches | |
| Apple Foundation Models as the no-download opener | DEFERRED | `README.md:597`; `adapters/appleFm.ts` is a throwing stub and is not registered in `adapters/index.ts` | |
| **Gemini Nano via ML Kit (optional)** | MISSING | `grep "AICore\|Gemini Nano"` = 0 | **Not on any cut list.** `docs/legal/licenses.md:32` still lists it as planned |
| Phi Silica on Copilot+ (P4) | DEFERRED | the spec marks it P4 | |
| Chrome Prompt API, desktop only, behind an explicit switch | UNPROVEN | `apps/mobile/src/web/chromeNano.ts`; `web/prefs.ts:7` defaults it off; `WebShell.tsx:74-79` marks it "Google's model, managed by Chrome" | The headless Chrome used in every web run has no Prompt API, so the switch has never rendered |
| The strongest wording is reserved for installed apps | PARTIAL | web copy is correctly hedged ("Runs locally in your browser…") | But the "auditable / open source" half of that wording is unsupported on **every** platform — see gap 3 |
| §4.4 split GGUF, OPFS with `persist()` | PROVEN | `web/opfs.ts`; `WebShell.tsx:111 await requestPersist()`; first-visit walk PASS | |
| §4.4 Safari deletes storage after 7 days, explained | PARTIAL | `en.json:131` ships the explanation verbatim | The named control "Keep on this device" does not exist; persist is requested silently |
| §4.4 iPhone Safari under 500 MB → offer the app | PARTIAL | `web/deviceGate.ts:49`; `WebShell.tsx:63-67` | Proven only in headless Chromium with an iPhone user agent, never in real Safari |
| §4.4 COOP/COEP headers, demo on its own origin | PROVEN | `apps/web/headers.mjs:25` `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`; `apps/site` is a separate app | |
| §4.4 hard CSP `default-src 'self'` | PROVEN | `apps/web/headers.mjs:10`; the desktop workflow runs a CSP check | |
| §4.4 SRI on every script | PROVEN | `apps/web/build.mjs:55` injects `integrity=`; `apps/web/dist/index.html:46` carries a real `sha384-…` | |
| §4.4 Service Worker enabling the airplane test in the browser | PROVEN | `web/serviceWorker.ts:1-29` | |
| §4.4 **open source with a published bundle hash** | MISSING | no `LICENSE` file in the repo (verified); the repo is private; the Proof screen prints a git commit | See gap 3 |
| §4.4 models from our own CDN | PROVEN | `cdn-iphone-2026-09-22.md` — a real iPhone pulled 1.2 GB from `models.inbornapp.com`, sha256 identical to the catalog | |
| §4.5 one repo, one release train, ~80-85% shared | PROVEN in substance | `apps/{mobile,web,desktop,site}` + `packages/{core,ui,i18n}` | **Layout drift**: the spec names `apps/app`, `packages/llm` and `packages/models`; `llm` and `models` were folded into `packages/core`. Functionally equivalent, but the spec diagram is stale |
| §4.5 five LocalLM implementations | PROVEN | `adapters/{llamaRn,appleFm,wllama,tauri}.ts` + `web/chromeNano.ts` | appleFm and chrome-nano are stubs or unexercised |
| §4.5 one GGUF catalog serving every platform | PROVEN | `packages/core/src/catalog/manifest.json`, schema 1, version 4, 7 entries | |
| §4.5 storage behind one repository interface | PROVEN | `storage/sqliteRepository.ts` (SQLCipher), `storage/persistent.ts` (IndexedDB on web), `adapters/tauri.ts` (SQLite through Rust) | Web is explicitly **unencrypted** and discloses it via `webStorageNotice` |
| §4.5 RAG uses **sqlite-vec** on mobile and desktop | **Deliberate deviation** | `packages/core/src/rag/vector.ts:4`: "no ANN structure (and no sqlite-vec) is needed at this scale" | Brute-force cosine over int8 vectors instead. Documented in code, never reflected back into the spec |
| §4.5 NativeWind rejected for now | PROVEN | tokens live in `packages/ui/src/tokens.ts` and are used through `StyleSheet` | Matches `README.md`'s cut list |
| §4.5 **Android import via SAF** | MISSING | `grep ACTION_OPEN_DOCUMENT_TREE\|StorageAccessFramework` = 0; Settings shows a read-only "Internal" row | Also edge case 7 |
| §4.6 Expo Web has no Service Worker, so use Workbox | PROVEN | `apps/web/package.json:10` `workbox-build 7.4.1`, plus the hand-written `web/serviceWorker.ts` | |
| §4.6 Android 16 KB pages, checked on a 16 KB emulator | PROVEN, stale | B1: 45/45 `.so` aligned 0x4000, `zipalign -c -P 16` OK, clean launch on a OnePlus 11 and the ps16k emulator | Not re-run since 7.9, and the bundle has since gained three asset packs. No CI alignment gate |
| §4.6 Tauri uses WebKit on macOS, so test the web build in Safari as a proxy | UNPROVEN | no Safari run recorded in any QA document | Every web run used headless Chromium |
| §4.6 Apple Developer ID + notarization, Windows signing certificate | UNPROVEN | the desktop workflow references Developer-ID signing | No notarized artifact exists; no Windows certificate record |
| §4.7 phase order P1 mobile → P2 web → P3 desktop → P4 accelerators | PROVEN in sequence | P1 and P2 are shipped and device-proven; P3 is built and never run; P4 is deferred | |

## §5 — Technical architecture

Spec: `docs/spec-src/05-architecture.html` (121 lines).

| Requirement | Class | Evidence | Note |
|---|---|---|---|
| §5.1 the app opens no socket where it can be avoided; no analytics, crash reporting, remote config, push, ad SDK or version check | PROVEN | no such dependency in any `package.json` or lockfile; T29 0 trackers; T32 0 sockets over 30 minutes behind mitmproxy | |
| §5.1 Android: Instant as a Play fast-follow pack, others on demand, 1.5 GB per pack | PROVEN | `vault/playDelivery.ts:84-115`; `purchases-run-2026-09-11.md` §P — a fresh Play install pulled 7 packs, 4.8 GB | Sharp ships as two shards because of the cap |
| §5.1 Play Billing declares only BILLING, no INTERNET | PARTIAL — **the reason is wrong** | the merger report shows INTERNET rejected from three sources, one being `openiap-google:3.5.0`, the wrapper actually shipped | The end state is right and proven; the spec's stated reason is not |
| §5.1 iOS 26+: additional models as **Apple-hosted asset packs** | MISSING | `catalog/types.ts:14` carries the `apple-asset-pack` variant with **no consumers** | A real iOS 26.6.1 iPhone was recorded downloading from the CDN instead. `privacy-policy.md:38` still promises the Apple path — gap 4 |
| §5.1 iOS 17–25: explicit download from `models.{{DOMAIN}}` via background URLSession | PROVEN | `vault/httpsDelivery.ts:89`; `cdn-iphone-2026-09-22.md` | |
| §5.1 **compile-time host allowlist**, anything else rejected at compile time | PROVEN | `catalog/manifest.ts:16-29`; `core/proof/allowlist.ts:15-39`; rendered on the Proof screen on both real devices | |
| §5.1 download is always an explicit action with its own screen, a byte counter and cancel | PARTIAL | byte counter and cancel exist on the vault card | **There is no download screen** (S32 does not exist), and onboarding's "Start chatting" was specified to start Fast in the background |
| §5.1 visible exit meter, `OUT 0 B` since install; downloads counted as IN only | PROVEN | `Proof.tsx:43-47`; real iPhone and real OnePlus 11 | |
| §5.1 **CI gate: `aapt2 dump permissions` on every APK/AAB, build fails if the permission appears** | PARTIAL | `scripts/check-android-permissions.sh` is correct and has passed on real builds | **`.github/workflows/ci.yml:16-18` sets `android-permission-gate: if: false`** with a TODO. The gate is a human, not CI — gap 6 |
| §5.1 sideloaded Android gets Instant plus import only, and says so | PROVEN | `vault/store.ts:413-414`; `en.json:222`; F26 | |
| §5.1 Android has no in-app Hugging Face search, and the app is a `.gguf` handler | PROVEN | `vault/hf.ts:8` restricts search to iOS; `VaultScreen.tsx:288` ships the browser instruction verbatim | |
| §5.2 `LocalLM` with id, capabilities, load, unload, generate, embed, stats | PROVEN | `packages/core/src/llm/types.ts` | Shape matches the spec including `Delta` with `text` / `reasoning` / `toolCall` / `done` |
| §5.2 streaming always with an AbortSignal; Stop is a real cancel | PROVEN | `Composer.tsx:113-121`; abort plumbed to `lm_abort` on desktop and to the adapters on native | Stop is used as the completion signal in every soak, but **was never pressed to abort mid-answer** |
| §5.2 automatic engine choice, one "model" shown to the user | PROVEN | `lib/models.ts:18` renders the friendly name only | Apple FM is deferred, so the choice is trivial today |
| §5.2 chat templates come from the GGUF and are validated by the catalog, never guessed | PARTIAL | `adapters/wllama.ts:52` reads `chat_template` on web | On iOS and Android the GGUF's built-in template is used with no catalog validation step |
| §5.2 tool calling is local only, no network tools | PROVEN (vacuously) | `llm/types.ts:57,65` declares `ToolCall` and **nothing produces or consumes it** | 1.0 ships no tools at all, so the constraint holds and the capability does not exist |
| §5.3 chats etc. in SQLite with SQLCipher on native, Rust SQLite on desktop, OPFS on web | PROVEN | `sqliteRepository.ts:200`; `persistent.ts:6`; `adapters/tauri.ts` | Web is IndexedDB and **unencrypted**, disclosed by `webStorageNotice` |
| §5.3 random 256-bit DB key in **Secure Enclave** / Android Keystore / DPAPI | PARTIAL | `sqliteRepository.ts:81` generates a random 256-bit key into the Keychain / Keystore | **No Secure Enclave**: `grep SecureEnclave\|kSecAttrTokenID\|StrongBox` = 0. `privacy-policy.md` claims Secure Enclave storage |
| §5.3 on iOS also **`NSFileProtectionComplete`** | MISSING | `grep NSFileProtection\|FileProtectionType` = **0 across the whole tree**; `apps/mobile/ios/Inborn/Inborn.entitlements` is an empty `<dict/>` | Also conflicts with §10 case 47, which asks for `completeUntilFirstUserAuthentication` |
| §5.3 imported documents, chunks and vectors in the same encrypted DB **plus a copy of the document in the app directory** | PARTIAL | the index rows are in the encrypted DB | **The copied document file is plaintext**, while `privacy-policy.md` says imported documents are stored in an encrypted database |
| §5.3 model files unencrypted, excluded from backup, sha256-checked | PROVEN (Android) / UNPROVEN (iOS) | `app.config.ts:86 allowBackup: false` proven by R-B3; `VaultNativeModule.swift:36` sets `isExcludedFromBackup`; hashes verified per shard | T39's iOS half never ran |
| §5.3 incognito chats in RAM only | PROVEN | `sqliteRepository.ts:272` refuses incognito rows outright | Never exercised on a real device |
| §5.3 `.sealed` export with libsodium secretstream + Argon2id | DEFERRED | `README.md:596` cuts it | `grep libsodium\|argon2\|secretstream` = 0. The only AEAD in the tree is XChaCha20-Poly1305 for the licence cache. **The disabled Settings row still says "Export all (encrypted)"** |
| §5.4 Ed25519-signed manifest with name, vendor, size, per-shard sha256, licence, min RAM, tier, capabilities, validated chat template | PROVEN | `catalog/signature.ts:23-30`; `publicKey.ts:2`; manifest schema 1, version 4 | **`vision: false` on Fast and Sharp contradicts §6.1's "vision: yes"** — only Instant and the separate `vision-qwen35` projector carry it (F36) |
| §5.4 Cloudflare R2 delivery, Hugging Face as a backup mirror | PARTIAL | R2 delivery proven end to end on a real iPhone | **The mirror is declared and never read**: `catalog/types.ts:16` has `Delivery.mirror`; `manifest.ts:37-47` ignores it; no manifest sets one |
| §5.4 parallel shards, resume after disconnect, per-shard and final hash, free-space check at size × 1.1, background continuation **with a local notification on completion** | PARTIAL | `catalog/lanes.ts` shards in parallel; resume is byte-exact (T07b, `Range: bytes=264294400-` → 206); space check is `max(bytes × 1.1, bytes + 2 GB)` | **No notification library exists in the tree**, so the completion notice was never built |
| §5.4 manual import of any GGUF from the device | PARTIAL | iOS and Android `VaultScreen.tsx:278-281`; desktop `models.rs:71-104` | No import on web; Android has no SAF picker |
| §5.4 a model unused for 60 days is offered for deletion, never auto-deleted | UNPROVEN | no 60-day sweep found | |
| §5.5 chunk ≈400 tokens, overlap 60 | PROVEN | `rag/chunker.ts:22` `{ targetTokens: 400, overlapTokens: 60, minTokens: 40 }` | Exact |
| §5.5 retrieve top-k with k=6 and MMR | PROVEN | `rag/fusion.ts:26` `mmr(candidates, k, lambda = 0.7)`; RRF at `:10` with k=60 | Hybrid BM25 + int8 vectors → RRF → MMR, which is richer than the spec describes |
| §5.5 store in **sqlite-vec** | Deliberate deviation | `rag/vector.ts:4` states the choice and the reason | Brute-force cosine; documented in code, not in the spec |
| §5.5 every document-grounded answer shows citations with filename and page; no citation means the model says it found nothing | PROVEN | `rag/citations.ts`; `documents/Citations.tsx:30-62`; real 6T `[1] handbook.pdf · p.2` | |
| §5.5 200+ page documents indexed progressively with a progress meter | PARTIAL | `rag/indexer.ts:55-93` with per-page commits | Runs on the JS foreground thread; **the device guard is never consulted**, so indexing will not stop on heat |
| §5.5 sentence-aware chunking with `Intl.Segmenter`, not characters | PROVEN | `rag/chunker.ts:2` cites §5.5 and §10.4 #31 | |
| §5.5 three embedders: nomic-embed 274 MB default, Qwen3-Embedding-0.6B for multilingual Pro, all-MiniLM 46 MB for weak devices | PARTIAL | only `embed-nomic` ships, at 274,290,560 B — exactly the spec's 274 MB | **The multilingual Pro embedder and the small-device embedder do not ship**, and the one that does declares `goodLanguages: ["en"]`. Multilingual RAG is English-only in practice |
| §5.6 STT: iOS 26 SpeechAnalyzer, else whisper; Android SpeechRecognizer offline or whisper; mic permission only on tap | PROVEN | `voice/dictation.native.ts:71`; real iPhone fell from `service-not-allowed` to the Whisper offer | Whisper small for Hebrew is a declared cut |
| §5.6 TTS: system voices free and offline; Kokoro-82M as a Pro desktop upgrade | PROVEN / DEFERRED | system voices ship | `grep kokoro\|espeak\|misaki` = **0**, so the espeak-ng GPL-3 trap is genuinely avoided |
| §5.6 continuous hands-free with Silero VAD as a Pro feature | PARTIAL | `core/voice/vad.ts` with an adaptive floor and 12/6 dB hysteresis; full four-phase loop read off a real iPhone | **The `/voice` route itself is ungated** (`src/app/voice.tsx` renders the screen with no paywall check, verified), while the chat entry point is gated |
| §5.7 app lock with biometrics and a passcode fallback, blocking the app-switcher view | PARTIAL | `lock/useAppLock.ts`; `lock/PrivacyCover.tsx`; FLAG_SECURE via `SecureScreenModule.kt:17` | **Biometrics were never enrolled in any QA run**, on any device, simulator or emulator |
| §5.7 screenshot blocking **(Pro)**: Android FLAG_SECURE, iOS `UIScreen.isCaptured` with an honest explanation | PARTIAL — **the spec is wrong, not the code** | both implemented; `en.json:678` is honest about the iOS limit. `packages/core/test/licence-entitlement.test.ts:123` **asserts** that `screenshotBlock` and `panicWipe` are absent from `FEATURES`, i.e. never gated | §5.7 labels both Pro; §7 labels them Free; the code ships them Free and a test locks that. Emulator only; `isCaptured` → blur never exercised |
| §5.7 panic wipe of DB, key and documents, with N-failed-attempts and a lock-screen shortcut | PARTIAL | `Settings/WipeSheet.tsx` with two confirmations; `lock/useAppLock.ts:82-84`; 1200 ms long-press on the lock screen | The wipe run checked chats, keys and models but not memory; the attempt counter never triggered |
| §5.7 incognito: chat rows never written to the DB or the search index | UNPROVEN | `chat/store.ts:11-13,86-89`; `sqliteRepository.ts:272` refuses incognito rows outright | Correct in code; simulator and emulator only, never a real device |
| §5.7 incognito: **an attached document is indexed in RAM only** | MISSING | Verified: `documents/db.native.ts:45-47` — `openRagStore()` always returns the SQLCipher store and `ragStoreKind()` hard-returns `"sqlcipher"`; there is no incognito branch. `library.ts:236,334` call `putDocument` into it unconditionally | The document row, the copied file and the vectors all persist after an incognito session. This is a stated privacy promise and §7.5 sells it as a differentiator |
| §5.7 incognito: cleared on close, or on moving to the background per a setting | PARTIAL | `chat/store.ts:123 endSession()` — verified to have **zero callers** anywhere in the tree; no such preference exists in `prefsTypes.ts` | The outcome holds today only because the process exits |
| §5.7 incognito: memory neither read nor written; dedicated icon | UNPROVEN | `chat/store.ts:91-104` throws on remember | Unit-level only. **`AppServices.tsx:386` hard-codes `incognito: false` for share-ins**, dropping the user out of an incognito session |
| §5.7 KV cache and buffers zeroed after every incognito session | MISSING | `grep "kv cache\|kvCache\|zeroize\|wipeMemory"` = 0 | |
| §5.7 **model unloaded after 10 minutes of inactivity** | PROVEN in code | `apps/mobile/src/engine.ts:19` `IDLE_UNLOAD_MS = 10 * 60_000`, with a `__DEV__` override for testing | Exact. No device row records an idle unload |
| §5.7 core open source under a permissive licence, bundle hash published per release | MISSING | no `LICENSE` file; repo private; `Proof.tsx:82-83` prints a git commit | Gap 3 |
| §5.8 read available memory before load and show only models that fit (size × 1.4 + KV) | PARTIAL | `catalog/pick.ts:23-44,71-81`; `device/bootTier.ts:26-31`; T36 on a 4 GB profile shows "TOO BIG FOR 4 GB" | The estimate is two static catalog constants, not the spec's formula; there is **no expert override** |
| §5.8 **`increased-memory-limit` entitlement on iOS** | MISSING | `apps/mobile/ios/Inborn/Inborn.entitlements` is an empty `<dict/>`, verified | |
| §5.8 mmap the GGUF | MISSING / contradicted | `adapters/llamaRn.ts:48` sets `use_mlock: true` and never sets `use_mmap` | The opposite of the spec's guidance, and directly relevant to edge case 12 |
| §5.8 KV cache limited to 2–4K tokens on phones, raised for Pro on 8 GB+ | PARTIAL | `device/policy.ts:346` `contextCap: ramGB < 6 ? 2048 : 4096` | Exactly the spec's range. The Pro increase on 8 GB+ is not implemented, and the reduction is silent |
| §6.5 device guard: battery, thermal and memory table | PROVEN in code | `packages/core/src/device/policy.ts` (504 lines, 56 tests in `device-policy.test.ts`); all twelve English status strings match the spec verbatim | **No component reads the recommendation.** ~31 `device.*` keys × 8 locales are dead, and no genuine thermal event has ever occurred in QA |
| §5.9 desktop shell, Rust engine, updater, signing and notarization | PARTIAL | the whole shell exists: `src-tauri/src/{shell,engine,models,licence,updater}.rs` | **Never launched.** No ARM64 Windows job. F41 (a blank window) was found by reading code, not by running it |
| Nine technologies the spec names by product and the code does not contain | MISSING | Silero VAD (`voice/vad.ts:57` ships an energy VAD), Kokoro-82M, Apple SpeechAnalyzer (`dictation.native.ts` ships SFSpeechRecognizer), Core ML (`whisper.native.ts:51` sets `useCoreMLIos: false`), sqlite-vec, mammoth (`rag/extract/docx.ts:2` is hand-written), ML Kit OCR (Tesseract 4.9 instead, because ML Kit has no Hebrew), Qwen3-Embedding-0.6B and all-MiniLM, desktop OCR | **None of the nine is on any cut list.** Several substitutions are good engineering (Tesseract for Hebrew, brute-force cosine at this scale); the problem is that the spec still sells the original names |
| §5.10 i18n with ICU MessageFormat, pseudo-localization, RTL checked in Hebrew and Arabic in every PR | PARTIAL | 8 shipped locales at full key parity plus `pseudo.json`; a pseudo-localization generator exists | **No Hebrew or Arabic locale ships**, and the RTL switch is `__DEV__`-only (`Settings.tsx:206-207`). The rule as written is unexecutable, and `qa-run-2026-09-06.md:76` T24 records exactly that |

## §6 — Models

Spec: `docs/spec-src/06-models.html` (143 lines). The catalog is `packages/core/src/catalog/manifest.json`, schema 1, version 4, seven entries.

| Requirement | Class | Evidence | Note |
|---|---|---|---|
| Tier sizes: Instant ≈0.5 GB, Fast ≈1.3 GB, Sharp ≈2.7 GB | PROVEN | manifest: instant 0.53 GB, fast 1.28 GB, sharp 2.74 GB, sharp-phi 2.49 GB | Sizes agree with the spec |
| Minimum RAM per tier | PROVEN | `minRamGB` 3 / 6 / 6 across the tiers | |
| **Vision: yes on Fast and Sharp** | MISSING | manifest sets `vision: false` on `fast`, `sharp` and `sharp-phi`; only `instant` and the separate `vision-qwen35` projector are true | F36. Either the spec table or the catalog is wrong |
| Device floor and the recommended default per device | PARTIAL | `catalog/pick.ts` `pickDefault()`; `bootTier.ts` | The vault's RECOMMENDED tag follows `rankModels()` (§7.8 use + language), not `pickDefault()` (§6.3). A deliberate evolution that the spec never absorbed |
| **iOS 17 install floor** | MISSING | ships **16.4**: `Podfile:27` and four `IPHONEOS_DEPLOYMENT_TARGET = 16.4` entries; no `ios.deploymentTarget` in any tracked config | `release-checklist.md:246` and `privacy-policy.md:39` both repeat iOS 17 |
| Measured speeds match the ranges shown on the cards | PARTIAL | `catalog/speed.ts:13-60` with an `android-legacy` class; F37 closed on the 6T ("Too slow to use on this phone") | **Open defect U11: Fast measured 13.2 tok/s against a card promising ~15-24** |
| Companion models: embedder, speech, vision projector | PARTIAL | `embed-nomic` 274 MB, `speech-whisper-base` 148 MB, `vision-qwen35` 200 MB all ship | The multilingual Pro embedder and the small-device embedder do not; the shipped embedder is English-only |
| §6.1 the fit map: 32 use-grade cells and 4 language rows | PROVEN | every cell matches signed manifest v4 with **zero differences**, asserted by `packages/core/test/catalog-fit.test.ts` | The most precisely conformant block in the whole audit |
| §6.1 catalog version label | MISSING / stale | `manifest.json:3` is `4`; the spec says "version 3"; `docs/model-fit.md:3` also says 3 | A three-way disagreement about the version of the signed artifact |
| §6.4 chip speed classes | PARTIAL | `catalog/speed.ts:26-39` ships 12 classes | **Six shipped classes appear nowhere in §6.4**, including `android-legacy` at 0.4-0.6 tok/s — the class that produced F37 on the floor device. `USABLE_TOKENS_PER_SEC = 1.5` is also code-only |
| §6.4 battery cost of 0.3-0.5% per 1,000 tokens, heat derate of 15-40% after 5-10 minutes | MISSING | no per-token battery model exists; `speed.ts:3-5` mentions the derate in a comment only | The §6.1 battery tags are hand-authored, not computed |
| §6.2 companion models: Qwen3-Embedding-0.6B, all-MiniLM, whisper small, Parakeet, Kokoro, Gemma 4 | MISSING | zero hits repo-wide for all six | Only `embed-nomic`, `speech-whisper-base` and `vision-qwen35` ship |
| §6.5 the full battery / thermal / memory table | PROVEN in code, UNPROVEN in behaviour | `device/policy.ts` implements every row with 56 tests; all twelve English status strings are verbatim | Thresholds: `batteryLow: 1`, `batteryCritical: 4`, `thermalSerious: 5`, `thermalCritical: 8`, `contextCap` 2048/4096. **No genuine thermal event has ever occurred in QA** and no component reads the recommendation |

## §7 — Feature matrix

Spec: `docs/spec-src/07-features.html` (180 lines), roughly 90 Free / Pro / Work rows plus the §7.8 recommendation rule.

The gating surface is `packages/core/src/licence/gates.ts` (`FEATURES`, `limits()`) and `moments.ts` (`paywallFor`).

| Finding | Class | Evidence |
|---|---|---|
| The eight never-gated guarantees (privacy, security, proof, a good model, unlimited chat, accessibility, languages, reporting) are honoured | PROVEN | `gates.ts:4-7` names all eight and states they are absent on purpose; none appears in `FEATURES`; `Limits` has four numeric fields and no message counter |
| `limits()` free tier: 3 personas, 1 file per chat, quick-action and image caps | PROVEN | `gates.ts:63-72`; `moments.ts:21-25`; observed on device at the 2nd file, the 4th persona, Voice and Sharp |
| **23 of the 39 gate keys have no reference anywhere outside `gates.ts`** | PARTIAL | Verified by me: `encryptedBackup, deviceTransfer, neuralVoices, keyboardExtension, customQuickActions, advancedShortcuts, personaWidgets, macosServices, lanConnection, advancedControls, gpuTuning, customContextLength, speculativeDecoding, multiModel, compareModels, localServer, calendarContacts, iconPacks, detailedStats, professionPacks, recordsDictation, largeModels, teamLicence` |
| …of those, roughly half map to declared 1.0 cuts | DEFERRED | `encryptedBackup`, `deviceTransfer`, `keyboardExtension`, `lanConnection`, `advancedControls`, `gpuTuning`, `speculativeDecoding`, `multiModel`, `compareModels`, `localServer`, `personaWidgets` are all on `README.md:596-599` |
| …and the rest are features the matrix still sells | PARTIAL | `customQuickActions`, `neuralVoices`, `customContextLength`, `calendarContacts`, `iconPacks`, `detailedStats`, `advancedShortcuts`, `macosServices`, and four **Work** keys — `professionPacks`, `recordsDictation`, `largeModels`, `teamLicence` — have no enforcement point at all |
| The hands-free voice route is ungated | MISSING gate | `src/app/voice.tsx` renders `HandsFreeScreen` with no paywall check, verified; the chat entry gates `voiceConversation` at `Chat.tsx:832` |
| OCR is more generous than the matrix | PARTIAL | `DocumentsScreen.tsx:235` gates OCR on `Platform.OS !== "web"` with no `paywallFor` call |
| §7.8 recommendation by use and language | PROVEN | `catalog/recommend.ts`; `VaultScreen.tsx:190-196`; on the real iPhone: `RECOMMENDED ON THIS iPhone · … IN English` |
| The Work tier has no real-device coverage | UNPROVEN | only the Work **SKU** was exercised in the purchase runs; no QA run covers vaults, packs, redaction or signed records on hardware |
| **Eleven rows where the enforced tier is not the spec's tier** | PARTIAL | OCR spec Pro → **no gate** (`gates.ts:11` dead, `DocumentRow.tsx:79` calls `runOcr` unguarded) · strict documents mode spec Pro → no gate (`DocumentsScreen.tsx:169`) · XLSX spec Pro → Work (`documents/office.ts:6`) · CSV spec Pro → no gate · DOCX spec Work → no gate · file picker spec Pro → Free (`importPicker.ts:10` gates on count) · camera spec Pro → Free (`AttachSheet.tsx:48`) · memory read/edit/delete spec Pro → Free (`MemorySheet.tsx:79-141`) · detailed stats spec Pro → Free (`Ledger.tsx:18`) · screenshot blocking and panic wipe spec Pro → Free **and a test locks it** |
| A share-target bypass defeats two gates | MISSING gate | `Chat.tsx:710-722` imports and attaches with no `paywallFor` and no office-kind check | Walks past both the Free file cap and the Work document gate |
| Spec-internal tier conflicts | — | Screenshot blocking appears as Pro in §5.7 and Free in §7 (**the code and its test say Free, so the spec is the error**); XLSX appears as both Pro and Work; the Free file-attach row needs the system picker that a Pro row claims to gate |

## §8 — Screens (S01–S60, §8.8, §8.9)

Spec: `docs/spec-src/08-screens.html` (386 lines). This is the section that produced F42, so it was audited clause by clause: every `elements`, `states` and `edge case` line is its own requirement.

### 8.1 Onboarding

| Requirement | Class | Evidence | Note |
|---|---|---|---|
| S01 open seal 72px, Display headline, 3 thesis lines | PROVEN | `screens/Onboarding/Welcome.tsx:25-29` | `ios-device-pass-11` row 2b, real iPhone |
| S01 "runs on this chip" + chip glyph + real chip name | PROVEN | `Welcome.tsx:30-35`; `Onboarding/deviceLine.ts:13-20` | iPhone `RUNS ON: A15 BIONIC · 6 GB`; 6T `SNAPDRAGON 845 · 8 GB` |
| S01 AI-disclosure line (EU AI Act, Play) | PROVEN | `Welcome.tsx:50`, `en.json:7` | row 2b |
| S01 below-floor line **+ link to an explanation** | PARTIAL | `Welcome.tsx:36` renders text only | No link, no locale key. Never triggered: all QA devices are ≥6 GB |
| S01 reduced motion: static seal | UNPROVEN | `components/Seal.tsx:45-49,85-89` | No QA run with Reduce Motion on |
| S01 VoiceOver announces thesis + disclosure | UNPROVEN | `Welcome.tsx:26` header role | Only the a11y tree was dumped; speech itself failed once as F15 |
| S02 "Ready now" card | UNPROVEN on device | `ModelChoice.tsx:37-46` | Headless browser + emulator only |
| S02 Apple on-device variant, 4 states | DEFERRED | `README.md:596` "Apple FM adapter on device (simulator-only, not sold)" | `adapters/appleFm.ts` throws |
| S02 "~50 tok/s on this phone" on the Instant card | PARTIAL | `ModelChoice.tsx:44`; estimator exists at `catalog/speed.ts:25-30` | S02 never calls the estimator |
| S02 Fast offer with **estimated time** | MISSING | no ETA string anywhere | |
| S02 Wi-Fi-only toggle | PARTIAL | `ModelChoice.tsx:53-56` | On this screen it controls nothing; nothing downloads here |
| S02 one "Start chatting" doing the right thing (Instant now, **Fast in the background on Wi-Fi**) | PARTIAL | `ModelChoice.tsx:31,33` — `onStart` and `onInstantOnly` are the **same function** | No Fast download is ever started from onboarding |
| S02 no space → greyed offer + "Free up 1.5 GB" | PARTIAL | disk watch exists in the vault only (`vault/store.ts:114`) | `ModelChoice.tsx:47-58` has no disk check |
| S02 background download **with a local notification on completion** | MISSING | `grep expo-notifications` across all source = 0 | Completion shows only as an in-app strip |
| S03 two steps, network indicator, question field, streamed answer, live OUT/IN | PROVEN | `Proof/AirplaneTest.tsx:54-137`; `proof/connectivity.ts:12-37` | `qa-run-2026-09-06.md` T01, real 6T with real Airplane Mode; OnePlus 11 in `purchases-run-2026-09-06.md:71` |
| S03 iOS: **the button opens Control Center** with guidance | PARTIAL | `connectivity.ts:40-49` returns `false` on iOS; the indicator is a `Pressable` that does nothing | The iOS half is not attempted |
| S03 web via service worker | PROVEN | `web/serviceWorker.ts:1-29` | `fixes-r21`: offline 2nd visit 1,578 ms, 22 tok/s, 0 model fetches |
| S04 seal closes in **420 ms** | PARTIAL | `Seal.tsx:90` is `Animated.spring(gap,{speed:14,bounciness:6})` | `tokens.ts:138 motion.seal = 420` is never read |
| S04 600 ms green bloom, one haptic, `SEALED · ON-DEVICE` | UNPROVEN | `Seal.tsx:79-94`; `Sealed.tsx:41-44` | The seal close animation has never been observed anywhere, real or simulated |
| S05 biometric toggle, delay, "Also hides chats in the app switcher." | UNPROVEN | `LockOffer.tsx:63-72` | **Biometrics were never enrolled in any QA run** (T14 BLOCKED) |
| S05 biometrics fail at enable → message, not locked | MISSING | `LockOffer.tsx:39-42` `turnOn()` calls `finish(true)` with no authentication | No failure branch exists |
| S05 skip → **one gentle reminder in Settings, never more** | MISSING | `prefsTypes.ts:26,45 lockReminderShown` declared, **zero other references** | The reminder does not exist |

### 8.2 Chat

| Requirement | Class | Evidence | Note |
|---|---|---|---|
| S10 header, seal, model chip, suggestions, composer | PROVEN | `Chat.tsx:963-980,1161-1183`; `Composer.tsx:67-120` | `ios-device-pass-8/9/11/12` |
| S10 loading: seal as an arc **with percent** | PARTIAL | arc `Seal.tsx:126-141`; label is `chat.delivering` = "DELIVERING" | No percent beside the seal; the percent lives on the vault card |
| S10 composer active, **message queued** while loading | MISSING | `Chat.tsx:1116 disabled={status.kind !== "ready"}` | No queue anywhere |
| S10 no model at all → composer disabled with an explanation | PARTIAL | S02 has it; with no model the app boots `NullLM` (`llm/null-lm.ts:6-12`) | Chip reads `DEV`, composer enabled |
| S10 low memory → automatic Instant suggestion | PROVEN | `shell/Banners.tsx:47-51` | Proven on the iPhone **as a false positive** — F43, `ios-device-pass-12` |
| S11 model label, collapsed Ledger, streaming cursor, breathing seal | PROVEN | `AssistantMessage.tsx:33,48-65`; `Ledger.tsx:22-53` | `ios-device-pass-11` row 6; ~200 turns on the 6T |
| S11 numbers **only** in the Ledger | PARTIAL | `Chat.tsx:971` prints live `{tps} TOK/S` in the header | One number escapes, by design of that line |
| S11 long-press: copy, regenerate, read aloud, report | PARTIAL | `Chat.tsx:1206-1308` | **Read aloud FAILED on the real 6T** (F5/T44); Report never invoked on a device |
| S11 edit on a user message | PARTIAL | `Chat.tsx:1240-1252` gated to `lastUserId` only | Spec says any user message |
| S11 amber meter over 80%, "This chat is getting long" | UNPROVEN | `chat/context.ts:7,9` | Highest context ever recorded ≈43% |
| S11 system-stopped + "Continue"; n-gram loop → Regenerate | PROVEN | `Chat.tsx:318-326`; `chat/loop.ts:17-43` | Real 6T R-B8 and `soak-run-2026-09-11.md` |
| S11 background mid-generation: 15–30 s finish + partial save | PROVEN | `Chat.tsx:114,316-331` | Real 6T R-B8 |
| S11 LaTeX rendered, read as text by VoiceOver | PROVEN, fix unretested | `chat/math.ts`; `Markdown.tsx:72-76` | Shipped broken once on a real 6T (B21); no device row re-proves the fix |
| S11 10K tokens in one message, no jank | UNPROVEN | virtualization only | Largest message ever sent in QA = 1,754 tokens |
| S11 side-by-side compare (Pro) | DEFERRED | `README.md:596` | Flag survives at `chat/personas.ts:65`, no UI |
| S12 [+] Photo / Camera / File; citation chips; HEIC downscale + EXIF strip | PROVEN | `AttachSheet.tsx:44-52`; `documents/Citations.tsx:30-62`; `images/pick.native.ts:8-47` | Real 6T T45 (0 EXIF tags), `purchases-run-2026-09-11.md` §N |
| S12 attachment card: name, size, pages, index meter | PARTIAL | chat shows a name-only chip (`Chat.tsx:1076-1085`) | Size/pages/progress live on S40 |
| S12 "Scanned. Run OCR on this phone?" (Pro) | PROVEN, **not Pro-gated** | `DocumentsScreen.tsx:235` has no `paywallFor` | More generous than the spec |
| S12 camera denied → explanation **+ link to Settings** | PARTIAL | `Chat.tsx:877` toast names Settings | No `Linking.openSettings()` |
| S12 100 MB via share sheet → background import | MISSING | `Chat.tsx:709-722` imports inline on the JS thread | No size threshold, no background task |
| S13 Report output — 4 reasons, free text, include-message, save, email | UNPROVEN | `ReportSheet.tsx:12-63`; `Chat.tsx:667-671` | **S13 has never been run on a real device** |
| S14 crisis card, hotline by locale, call button, dismiss | UNPROVEN | `SafetyCard.tsx:15-25`; `chat/safety.ts:27-46` | **S14 has never run on a real device or browser** — iPhone simulator only |
| S14 on-device dictionary **per language** | PARTIAL | `chat/safety.ts:3-13` covers 9 languages | **`ko` and `zh-Hant` ship as UI languages with no crisis phrases at all** |
| S14 medical/legal/money → **fixed** persona-header declaration | PARTIAL | `chat/types.ts:122` is a user-typed optional field | No built-in persona sets one |

### 8.3 Navigation

| Requirement | Class | Evidence | Note |
|---|---|---|---|
| S20 new chat / incognito / folders (Pro) / empty state / "Deletes in 3 days" | PROVEN | `Chats.tsx:204-261,311-316,385-390` | `ios-device-pass-12:190`; `qa-run-2026-09-11.md:159` incl. a clock jump |
| S20 search in titles **and** content, local | UNPROVEN | `storage/sqliteRepository.ts:409-422` | No QA row ever types a query |
| S20 exit readout "FAST 2B · OUT 0 B" | PARTIAL | `shell/ChatsPane.tsx:63` renders `INSTANT · OUT 0 B` | The size token is dropped |
| S20 lock active **blurs** content until auth | PARTIAL | `lock/LockScreen.tsx:38` is an opaque cover | Hidden, not blurred — stronger, but different |
| S20 1,000+ chats virtualized | UNPROVEN | `Chats.tsx:346`; `lib/listClipping.ts:4` disables recycling (F33) | No QA doc ever loads 1,000 chats |
| S20 delete: **confirm** + 5 s Undo | PARTIAL | `Chats.tsx:51,151-158,423-431` | There is no confirm step; "Undo" appears in no QA doc |
| S21 New chat sheet — persona chips, model, incognito, Start | UNPROVEN | `Chats.tsx:437-477` | **S21 appears in no QA document at all** |

### 8.4 Model vault

| Requirement | Class | Evidence | Note |
|---|---|---|---|
| S30 state dot, size, quantization, speed range, battery tag, plain-language line | PROVEN | `vault/ModelCard.tsx:50-51,128-144` | `cdn-iphone-2026-09-22.md:27`; `ios-device-pass-11:66` |
| S30 **provider** on the cartridge | MISSING | `CatalogModel.vendor` (`catalog/types.ts:51`) has **zero render sites** | Populated in the manifest, never displayed |
| S30 **license tag** on the cartridge | MISSING | `ModelCard.tsx` never reads `model.license` | Only Details and HF search show it |
| S30 groups On this device / Fits / Too big (with reason) | PROVEN | `VaultScreen.tsx:183-202` | T36, `qa-run-2026-09-11.md:160` |
| S30 RECOMMENDED tag on the §6.3 default | PARTIAL | `VaultScreen.tsx:190-196` follows `rankModels()` (§7.8), not `pickDefault()` (§6.3) | Deliberate evolution; copy also differs |
| S30 HF search on iOS **and desktop** | PARTIAL | `vault/hf.ts:8` is `Platform.OS === "ios"` while the comment above says "iOS and the desktop" | Desktop HF search is not built |
| S30 above RAM: "Will not run" **with an expert override** | PARTIAL | text proven (T36); `ModelCard.tsx:157` strips every control from a disabled card | No override exists |
| S30 full disk blocks with "Free up 3 GB" | PROVEN | `store.ts:110-124,386-410` | T07(a) — no request reached the server |
| S30 HF gated: token + license acceptance | PARTIAL | token path full (`vault/hf.ts:21-41`) | No in-app licence acceptance tap |
| S31 params / quantization / context / vision / tools / languages / licence / benchmark | PROVEN | `ModelDetails.tsx:39-45,81-107` | `ios-device-pass-12:137` row 14, full table read on the real iPhone |
| S31 header **with chip glyph** | MISSING | `ModelDetails.tsx:66-71` is text only; never imports `ChipGlyph` | The glyph exists and is used in 3 other screens |
| S31 **license link** | MISSING | `CatalogModel` has no `licenseUrl` | The row is inert text |
| S31 "Delete" blocked while loaded | PARTIAL | `ModelDetails.tsx:115-125` | The button is labelled "Remove" |
| **S32 Downloads — the screen does not exist** | MISSING | No `downloads` route; `grep "S32"` = 0 | Dissolved into vault rows, two Settings rows and the Proof log |
| S32 percent | PROVEN | `ModelCard.tsx:62` | `cdn-iphone:26` `8% · 99 MB of 1.2 GB` |
| S32 **speed** and **ETA** | MISSING | `catalog/install.ts:7` carries `bytes`/`total` only | Nothing computes a rate or a time remaining |
| S32 resume | PROVEN | `httpsDelivery.ts:127-138` | T07(b) — `Range: bytes=264294400-` → 206, byte-exact |
| S32 Wi-Fi-only toggle | PARTIAL — **inert on HTTPS** | two toggles (`Settings.tsx:170`, `VaultScreen.tsx:310`); `catalog/resume.ts:55 shouldWait()` has **zero production call sites** | Android is correct by accident (Play enforces its own policy); iOS and desktop ignore the switch |
| S32 "Verify after download" as an **indicator** | PARTIAL | verification is genuinely unconditional (`store.ts:230-251`) | The string does not exist |
| S32 429 / server error → message **offering a mirror** | PARTIAL — mirror MISSING | `catalog/types.ts:16` declares `Delivery.mirror`; `manifest.ts:37-47` never reads it | No manifest sets one |
| S32 bad hash → auto-delete + "Try again" | PROVEN | `store.ts:238-241` | T08 — byte-flipped file deleted, re-download repaired |
| S32 background → **local notification with progress** | MISSING | no notification library anywhere | Transfer continues; Inborn posts nothing |
| S32 **queue survives a restart** | PARTIAL | `vault/record.ts:41-42` persists downloads; restored as `{paused:true}` | Comes back paused with no auto-resume; no queue object, so ordering is lost; Play path stores nothing |

### 8.5 Documents, personas, memory

| Requirement | Class | Evidence | Note |
|---|---|---|---|
| S40 Strict mode toggle, "Ask about selected" | PROVEN | `DocumentsScreen.tsx:164-170,241-250` | `ios-device-pass-11:141`, `-12:192` |
| S40 type / pages / size, indexing states, details sheet | UNPROVEN | `DocumentRow.tsx:27-46`; `DocumentDetails.tsx:26-57` | The real iPhone saw only the **empty** library |
| S40 **projects (folders for documents)** | MISSING | zero hits across `documents/`, `screens/documents/`, `rag/` | Folders exist for chats only |
| S40 **search in the library** | MISSING | no filter field in `DocumentsScreen.tsx` | |
| S40 200+ pages progressive background indexing **with a thermal stop** | PARTIAL | `rag/indexer.ts:55-93` runs in the JS foreground task | `modules/device-guard` is never consumed by `library.ts` or `indexer.ts` — indexing will not stop on heat |
| S40 multi-sheet XLSX **with sheet selection** | PARTIAL | `rag/extract/xlsx.ts:19-34` indexes every visible sheet | No sheet-selection UI |
| S40 vertical CJK | MISSING | grep `vertical\|cjk` = 0 | |
| S41 Free 3 / Pro unlimited, name, system prompt | UNPROVEN | `chat/personas.ts:6,60-62`; `PersonasSheet.tsx:78-86` | Emulator only |
| S41 icon **from an SVG library, not emoji** | PARTIAL | `components/chat/PersonaGlyph.tsx:6` is a map of Unicode text characters in a `<Text>` | Not emoji, not SVG; the file's own comment concedes it |
| S41 default model | PARTIAL | field exists (`chat/types.ts:118`) but the editor is read-only | No picker; the value can never be set |
| S41 **allowed tools** | MISSING | `Persona` has no tools field; no tool-execution path exists | |
| S41 response style | PARTIAL | `PersonasSheet.tsx:88` exposes a numeric temperature | A temperature is not a response style |
| S41 **"Reset persona"** | MISSING | grep = 0 | |
| S41 **import from a signed JSON + foreign-prompt warning**, **export as a file** | MISSING | no import path; `ExportSheet.tsx:48-66` exports chats only | Signed-JSON machinery exists for Work records, not wired to personas |
| S42 Memory — facts panel, edit/delete, source, toggles | UNPROVEN | `MemorySheet.tsx:71-140` | The row was seen on the real iPhone; the sheet was never opened |
| S42 export includes it **only if ticked** | PARTIAL | `ExportSheet.tsx:55-66` exports chat Markdown only | Memory is never exported, so the promise holds; the control does not exist |
| S43 share sheet, six actions, streamed result, Copy, Replace | PROVEN | `QuickActionsSheet.tsx:73-169`; `chat/quickActions.ts:5-6` | Real 6T — a Google Docs field literally rewritten, `44-after-replace.png` |
| S43 **custom action editor (Pro)** | MISSING | only the flag `licence/gates.ts:22 customQuickActions: "pro"` | |
| S43 huge text truncated **with a message** | PARTIAL | `quickActions.ts:9-17` warns at 6,000 chars; `shareTarget.ts:16` truncates silently at 50,000 | |
| S44 full-screen dark, 96px seal, listening ring, thinking breath, transcript, end | PROVEN | `voice/HandsFreeScreen.tsx:32-116` | Real iPhone, `voice-run-2026-09-11.md:25`, 75 s alive |
| S44 speaking: **gentle pulse** | PARTIAL | `HandsFreeScreen.tsx:69` maps speaking→`"sealed"`; `Seal.tsx:32` makes the `generating` prop dead | Colour change only, no pulse |
| S44 **voice picker**, **headphone routing** | MISSING | `voice/tts.ts:122` auto-picks; `grep AVAudioSession\|allowBluetooth` = 0 | Platform default route |
| S44 **Instant-only on 6 GB devices** | PARTIAL | `HandsFreeScreen.tsx:35,109` is a hint | Nothing forces Instant |
| S44 **incoming call (stop and save)** | PARTIAL | `core/voice/handsFree.ts:21 pausedFor:"call"` and its string exist | Nothing ever dispatches `"call"` |
| S44 language unsupported → Whisper Pro | PROVEN | `voice/dictation.native.ts:71`; `HandsFreeScreen.tsx:34-47` | Real iPhone: `service-not-allowed` → "Use Whisper instead · PRO" → paywall |

### 8.6 Proof, privacy, settings

| Requirement | Class | Evidence | Note |
|---|---|---|---|
| S50 mono readouts, allowlist, permission list, airplane button | PROVEN | `Proof.tsx:43-88`; `core/proof/allowlist.ts:15-39` | Real iPhone `ios-device-pass-12:197`; real OnePlus 11 `purchases-run-2026-09-06.md:71` |
| S50 per-session network log | PROVEN **in a browser only** | `Proof.tsx:99-106` | Never opened on a phone in any QA row |
| S50 **build hash vs published** | PARTIAL | `Proof.tsx:82-83` prints version + **git commit** | No sha256 of the binary, no comparison, no "(matches published)" link |
| S50 after the test the OUT 0 B counter **stays as a permanent bar in the chat** | PARTIAL | the persistent readout is `shell/ChatsPane.tsx:63` | The bar is not in the chat, and the test does not place it |
| S50 LAN (Pro) → "LAN · 192.168.1.20" in orange | DEFERRED | `README.md:596` cuts LAN | Colour path exists; no IP is rendered anywhere; `sealState` is only ever `sealed`/`loading` |
| S51 Chats / Documents / Models / Memory / Reports with sizes and "encrypted" | PROVEN | `Settings/Storage.tsx:48-52` | Real iPhone: "Chats 483 KB encrypted (SQLCipher)", "Models 1.19 GB" |
| S51 backup explanation string | UNPROVEN **and factually wrong on Android** | `Storage.tsx:54` | `qa-run-2026-09-11.md:46` confirms `allowBackup="false"`, yet the string says chats are in the backup |
| S51 Export all (Pro, **encrypted with a passphrase**), Transfer to another device | DEFERRED | `README.md:596` cuts `.sealed` backup + device transfer | Rows ship **disabled but visible**, and the label still promises encryption |
| S51 **restore from backup → chats return, models offered in one tap** | MISSING | no restore flow anywhere | `release-checklist.md:271` lists it as a test with no result |
| S52 Appearance theme + size; Security rows; Language; About | PROVEN | `Settings/Settings.tsx:79-139,165-166`; `About.tsx:36-50` | Real iPhone `ios-device-pass-12:193` |
| S52 Appearance: **font** | MISSING | one fixed face (`services/type.ts:9`) | |
| S52 Chat: **default persona**, **thinking visible** | MISSING from Settings | per-chat only (`ChatSettingsSheet.tsx:53-80`) | |
| S52 Chat: **Enter vs Shift+Enter**, **keep screen awake** | MISSING | hard-wired `modules/hardware-keys/index.ts:13-17`, Android only; `grep keepAwake` = 0 | |
| S52 Performance: Auto power "On on phone, Off on desktop" | PARTIAL | `prefsTypes.ts:49 autoPower: true` on every platform | The sub-line describes behaviour the code does not have |
| S52 Performance: collapsed **"Advanced"** group, answer/context length, **acceleration tag with an override** | MISSING | the only "Advanced" is `__DEV__`-gated (`Settings.tsx:196-213`) | No tag, no override, no locale key |
| S52 Downloads: storage location (**Android SAF**) | PARTIAL | read-only row valued "Internal"; `grep StorageAccessFramework` = 0 | |
| S52 Accessibility: **announce per sentence**, **dyslexia font** | MISSING | announcements are unconditional; `grep dyslexia` = 0 | |
| S52 About: "Report a problem" producing a **diagnostic file** | PARTIAL | `About.tsx:26-32` puts diagnostics in a `mailto:` body | No file. Correctly carries no chat content |
| S53 the six biometric labels + the wipe countdown | UNPROVEN, **copy exact** | `core/lock/policy.ts:19-57`; `lock/biometrics.ts:15-33` | The one table in §8 whose copy matches completely. Biometrics never enrolled in any QA run |
| S53 Android via `BiometricManager.canAuthenticate(BIOMETRIC_STRONG)` | PARTIAL | detection is `hasHardwareAsync` + `isEnrolledAsync`; `BIOMETRIC_STRONG` appears nowhere | A weak-only sensor would still label the row |
| S53 Windows via `UserConsentVerifier.CheckAvailabilityAsync` | PARTIAL, unreachable | `biometrics.ts:12` derives platform from `Platform.OS`, never `"windows"` | Desktop is Tauri over the web bundle, so it short-circuits to "passcode" |
| S60 "Pay once. Own it.", one card, local store price, button, Restore | PROVEN | `PaywallScreen.tsx:94-133`; `TierCard.tsx:32-53` | `purchases-run-2026-09-11.md` rows 02/05; live Play ₪60.00, live ASC ₪69.90 |
| S60 value list | PARTIAL / DEFERRED | `licence/gates.ts:80-83` ships 5 lines | 3 spec lines gone, all three README-cut; `TierCard.tsx:18` still says "six value lines" |
| S60 Family Sharing — iOS: yes | PARTIAL | `PaywallScreen.tsx:135` | **Family Sharing is off on all four ASC products**; the "yes" state has never existed |
| S60 phone: Pro primary, Work the anchor | PROVEN | `licence/entitlement.ts:60-65` | Real device row |
| S60 **desktop: order reversed, Work first** | UNPROVEN | `PaywallScreen.tsx:35` `Platform.OS === "web"` | No QA row; also fires for a **phone browser** |
| S60 revocation → features lock, data stays | PARTIAL | `licence/apple.ts:154`; `entitlement.ts:9` | Lock proven (`07-refund.png`); "no chats existed on the proof build", so the data half is unproven |
| S60 **offer codes** | MISSING | no `presentCodeRedemptionSheet`, no redeem entry, no string | |

### §8.8 Cross-screen system states

Structural finding: `packages/core/src/device/policy.ts` computes a full headline/button recommendation (~31 keys × 8 locales in `en.json:766-796`) and **no component reads it**. The shell re-implements a smaller `state.*` subset, so every nuance the core knows is lost between `policy.ts` and the screen.

| # | Requirement | Class | Evidence | Note |
|---|---|---|---|---|
| 1 | "Storage is full. Chats are safe; downloads paused." + open the storage manager | PROVEN | `Banners.tsx:28-29`; `en.json:648` exact | `qa-run-2026-09-11.md` R4-F13 with `/data` really filled |
| 2 | "Slowing down to keep the phone cool" + Switch to Instant | PROVEN **rendering only** | `Banners.tsx:32`; `en.json:16` exact | Rendered via the dev preview; OxygenOS pins Thermal Status 6, so no real thermal event ever |
| 3 | "Stopped to protect the phone · Continue when cool" | PROVEN **rendering only** | `Banners.tsx:30-31`; `en.json:651` exact | Seen once from a **false** critical reading |
| 3b | Continue **lights up when cool** | PARTIAL | `Banners.tsx:31` always renders an enabled-looking CONTINUE | While hot the button looks live and does nothing; `device.button.continueWhenCool` is dead |
| 4a-b | Low Power Mode / Battery 18% lines | UNPROVEN | `Banners.tsx:48-51`; `en.json:654-655` | Previewable, no QA row |
| 4c | **explanation sheet only on the first automatic switch** | MISSING | `policy.ts:167-170` sets `rec.explain`; `guard.ts:284-287` latches it; `guard.ts:132 ackExplain()` has **no callers**; four `device.sheet.*` keys ship in all 8 locales and are rendered by nothing | **The purest F42 in the repo** |
| 5a | jetsam mid-answer → **the partial answer is saved** | MISSING | `Chat.tsx:457-503` writes the assistant row only after the stream; `lib/pausedTurn.ts:26` dies with the process | A real SIGKILL loses the whole partial answer |
| 5b | "The system stopped generation to free memory. Continue?" | PARTIAL | `Banners.tsx:33`; `en.json:652` | Only while the same process lives; "Continue?" dropped from the copy |
| 5c | → Continue / **Switch to a smaller model** | PARTIAL | Continue only | `device.button.switchSmaller` exists and is rendered by nothing |
| 6 | "Apple's model declined; switching to Private model" | MISSING (adapter DEFERRED) | the string exists in **no locale** | README cuts the adapter; the fallback UX was never written either |
| 7 | **"Checking your models" screen** after an engine change, incompatible marked not deleted | MISSING | `grep "Checking your models"` over source and all 9 locales = 0; `grep -i incompatib` = 0 | No screen, no route, no engine-compatibility concept |
| 8 | UNSEALED on every screen | DEFERRED | the spec itself says "future"; nothing ever sets the state | Cracked-ring rendering exists (`Seal.tsx:100,142-152`) |

### §8.9 Desktop and web doors

**Standing caveat.** The Tauri binary has never been launched. `docs/qa/desktop-layout-2026-09-22.md` states plainly: "No screenshot of the desktop app, by instruction… proven in the browser at desktop widths, not in the Tauri window", and records that the window came up **blank** at its default 1120×720. `README.md` still lists "the desktop `.app` runtime proof" as open. **Nothing in the desktop table below can be PROVEN.**

| Requirement | Class | Evidence | Note |
|---|---|---|---|
| 280px sidebar, 680px message column | PROVEN **in a browser** | `lib/layout.ts:10-11` `SIDEBAR_WIDTH = 280`, `COLUMN_WIDTH = 680` | `desktop-layout` shots 01, 05. The number the task flagged: **code is 680 and agrees with §8.9 and §9.3; only `docs/demo-src/inborn-demo.src.html:78,970` still says 760** |
| sidebar sections (chats, projects, vault, proof, settings) | PARTIAL | `ChatsPane.tsx:66-75` = Chats, Vault, **Documents**, Settings, Proof | "Projects" is not a section; Work folders stand in |
| optional document/citation panel | PARTIAL | `layout.ts:12,22 PANEL_WIDTH = 340`; `WideShell.tsx:12-13,46-47` | Library variant photographed; the **citation** variant has no screenshot |
| drag-and-drop of **files** into the library | PARTIAL — **event goes nowhere** | `src-tauri/src/shell.rs:184-196` emits `inborn:documents-dropped`; `adapters/tauri.ts:497` relays it; **no listener consumes it** | A dropped PDF lands nowhere |
| …**and folders** | MISSING | `shell.rs:185` partitions by `.gguf` extension only; no `is_dir()`, no recursion | |
| Command palette Cmd/Ctrl+K; toggle sidebar; Esc stop | PROVEN **in a browser** | `shell/CommandPalette.tsx:24,53-60`; `lib/desktopKeys.ts:17,29-30` | shots 02, 04 |
| Cmd/Ctrl+N new chat; model picker | UNPROVEN | `desktopKeys.ts:20-28`; `shell.rs:74,82` | Cannot be claimed in a browser; the menu owns them |
| Tray: seal state, quick chat, "Quit unloads model" | UNPROVEN | `shell.rs:31-41,131-175` | No tray screenshot exists |
| desktop settings: **model location visible**, **Launch at login (off)** | MISSING | no such rows; `grep -i "launch at login\|autostart"` = 0 | |
| Advanced: **backend picker (Auto/CUDA/Vulkan/Metal/CPU)** | MISSING | `engine.rs:22-28` picks the backend at **compile time** | One binary per backend; no picker |
| Advanced: **VRAM offload**, **local server (Pro)** | MISSING | `grep -i vram` = 0; `gates.ts:33 localServer: "pro"` is the only occurrence in the tree | |
| Paywall: Microsoft Store / Mac App Store | DEFERRED | `licence/provider.web.ts:5-7` "not wired yet (§14.4)" | |
| Paywall: signed Paddle key verified offline | UNPROVEN | `provider.web.ts:36-55`; `core/licence/licenceKey.ts`; `licence.rs` | Unit-tested only; never activated in a running desktop app |
| web entry gate: **WebGPU check** | PARTIAL | `web/deviceGate.ts:69` reads `navigator.gpu` into `gate.webgpu`; **nothing consumes it** | `classifyDevice` branches on form factor + RAM only |
| web entry gate: memory check, phone up to Instant | PROVEN | `deviceGate.ts:47-54` | `fixes-r21` PASS on both doors |
| web first download with a persist request | PROVEN | `WebShell.tsx:111 await requestPersist()` | First-visit walk PASS |
| web first download **with a size choice** | MISSING | `web/boot.ts:38` picks exactly one tier; one fixed source, one button | |
| "Keep on this device" explaining Safari's 7 days | PARTIAL | the explanation ships verbatim (`en.json:131`); `en.json:129` is a lowercase **status**, not a control | Persist is requested automatically, never offered as a choice |
| airplane test through the Service Worker | PROVEN | `web/serviceWorker.ts:9-28` | Offline 2nd visit, 0 model fetches |
| readout "This tab sent 0 B to us" | UNPROVEN | `AirplaneTest.tsx:136` → `en.json:567` | **The web smoke skips the airplane step** (`web-smoke.mjs:149`) — never rendered in any recorded run |
| exact wording "Runs locally in your browser…" and a permanent "Get the app" | PROVEN | `WebShell.tsx:62,81-83`; `en.json:116-117` exact | `web-smoke.mjs:209` |
| no Pro on the web | UNPROVEN | `licence/provider.web.ts:15-34,57` | No QA row opens `/paywall` on the web |
| Chrome Prompt API behind a **marked** switch | UNPROVEN | `WebShell.tsx:74-79`; `web/chromeNano.ts` | The headless Chrome used for every web run has no Prompt API, so the switch has never appeared |

## §9 — FARADAY design system

Spec: `docs/spec-src/09-design.html` (151 lines). Token source of truth: `packages/ui/src/tokens.ts`.

### Palette, token by token

22 spec hexes were checked. **21 are exact.** One deviates deliberately.

| Token | Spec | Code | Line | Verdict |
|---|---|---|---|---|
| dark bg / surface-1 / surface-2 / well / border | `#0A0D11` `#12161B` `#181D23` `#0E1115` `#1F262E` | identical | `tokens.ts:3-7` | MATCH |
| dark text / text-2 | `#EEF2F5` `#9AA6B2` | identical | `tokens.ts:8-9` | MATCH |
| dark **text-3** | `#667380` | **`#7A8794`** | `tokens.ts:10` | **DIFFERS, and the code is right.** The spec claims 4.6:1; `#667380` measures 4.01:1 on `bg` and **3.49:1 on surface-2**, failing WCAG AA. Raised as QA B11, fixed in `8aaa097`, now enforced by `tokens.test.ts:6-11` at 5.30:1 / 4.62:1. **The spec value should change.** |
| accent Filament / sealed / danger Breach / cta-fill / cta text | `#F0B35B` `#3ECF8E` `#F25555` `#E6EAEE` `#0A0D11` | identical | `tokens.ts:11-15` | MATCH |
| full light palette (10 tokens) | as specified | identical | `tokens.ts:21-32` | MATCH |
| glow/fill stay amber and green in light | `#F0B35B` / `#3ECF8E` | identical | `tokens.ts:55` | MATCH |

Extras the code adds and the spec does not name: `onDanger #F3F5F7` (`tokens.ts:17`), light `text3 #5E6975` (`:28`), and light `surface2` collapsing to `#FFFFFF` alongside `surface1` (`:23`), so in light the raised tier is carried by the border alone.

### The rest of §9

| Requirement | Class | Evidence | Note |
|---|---|---|---|
| Default theme follows the system | PROVEN | `tokens.ts:52`; `prefsTypes.ts:39`; `services/theme.ts:31-38` | Settings offers System/Dark/Light |
| The light theme is a real design, not an inversion | PROVEN | `tokens.ts:20-33` (light `well` is not the inverted dark `well`; accent darkens for text while the glow stays amber) | `desktop-layout/05-desktop-1440x900-chat.png` |
| glow-filament amber 35%, **blur 24px**, only behind the seal while generating | PARTIAL | `Seal.tsx:115-118,130` — opacity, colour and scoping exact | **No blur**: a RadialGradient falloff substitutes, because RN SVG has no blur primitive |
| bloom-sealed green 25%, **blur 16px**, 600 ms then gone | PARTIAL | `Seal.tsx:91-94,119-122` with `motion.bloom` = 600 | Same blur caveat; duration and opacity exact |
| mesh white dots 3% at 8px spacing | PROVEN | `shell/primitives.tsx:164-177` | |
| mesh only on vault and onboarding surfaces | PARTIAL | Rendered on four onboarding screens, the **web** vault door, and `Proof/AirplaneTest.tsx:75` | **The real vault screen has no mesh** (`VaultScreen.tsx:218` is a plain View), and a proof surface has one — the inverse of the rule |
| mesh NEVER behind chat text | PROVEN | `Chat.tsx:1131-1132` — the chat root is a bare View, never `<Screen mesh>` | |
| "Accent is never a button fill" | PROVEN | every primary control uses `theme.ctaFill` (`primitives.tsx:46`, `Composer.tsx:118`, `NativeChrome.tsx:109`, `ModelCard.tsx:176`, `TierCard.tsx:50`) | Amber appears only on badges, ticks and progress fills |
| IBM Plex Sans + Mono, both OFL | PROVEN | `apps/mobile/assets/fonts/*` + `LICENSE-OFL.txt`; `services/fonts.native.ts:9-15` | |
| Hebrew and Arabic Plex variants | DEFERRED | `07-features.html:159` D13 — launch is 6 (now 8) Latin/CJK locales; HE and AR come later | Hard prerequisite when either lands |
| Fallback **Geist + JetBrains Mono** | MISSING | `tokens.ts:62-65` uses system stacks | The substantive intent ("never a serif") is enforced by `tokens.test.ts:20-24` |
| Every type step (Display 32/38 −0.02em … MONO LABEL 11/14 +0.08em uppercase) | PROVEN | `tokens.ts:121-128`; `tokens.test.ts:43,47` | Letter-spacing values are the exact em products |
| Body **65–72 characters per line** | MISSING | `lib/layout.ts:11 COLUMN_WIDTH = 680` ≈ 85 characters at 16px Plex Sans | The spec contradicts itself: 680px and 65–72 CPL cannot both hold. Code honours the pixel |
| Never mono for paragraphs | PROVEN | `Markdown.tsx:52-56`; `tokens.test.ts:40-44` | |
| Message column max 680px on tablet and desktop | PROVEN | `lib/layout.ts:11`; `Chat.tsx:1452-1453` | Only the demo is stale at 760 |
| Radius set 4/10/14/20/pill | PROVEN | `tokens.ts:112` | |
| radius 4 = chips | PARTIAL | chat chips and vault chips use `radius.chip` = 999 (`chat/styles.ts:7`, `ModelCard.tsx:187`) | Every chip is a pill |
| radius 20 = sheets **and model cartridges** | PARTIAL | sheets correct; `ModelCard.tsx:182` uses `radius.card` (14) | Visible in `android-vc15/b-01-vault-top.png` |
| iOS 26 concentricity (inner = outer − padding) | MISSING | `grep concentric` = 0; every radius is a flat constant | Nested shapes do not derive from the parent |
| 4pt spacing scale | PARTIAL | `tokens.ts:106` exports `space`; **no importers** | Off-scale 6, 10 and 14 are used in three components |
| 16pt phone margins (20 on large phones) | PARTIAL | `Screen.tsx:104` is a flat 16 | No large-phone variant; the chat surfaces use 12 |
| 44pt minimum touch targets **everywhere** | PARTIAL | correct on the composer, headers, buttons and the Proof screen | Below 44: Segmented 36, suggestion chips 36, vault actions 36, ledger toggle 40, **reasoning toggle 28 with no hitSlop**, code-copy 32 |
| Motion 120/180/280/420 ms | PARTIAL | `tokens.ts:138` defines all four exactly | **`motion.press`, `motion.state`, `motion.sheet` have no consumers, and `motion.seal` (420) is bypassed** by the spring at `Seal.tsx:90`. Only `bloom` and `breathe` are live |
| Easing `cubic-bezier(.23,1,.32,1)` | MISSING | `tokens.ts:139` exports `easing.out` and **it is never imported** | Every animation uses `Easing.inOut(Easing.ease)` instead. The clearest §9.4 violation |
| No bounce except the first seal close and the Android FAB | PARTIAL | exactly two springs exist: `Seal.tsx:90` and `NativeChrome.tsx:90` (comment cites §9.4) | The `sealedOnce` guard is per-mount, not per-install; harmless today because only onboarding drives `sealing` |
| Seal 28px header / 72px empty and onboarding; the only AI indicator | PROVEN | `Chat.tsx:968,1161`; `Screen.tsx:44`; `Seal.tsx:27` | `fixes-r19/a-14`, `ios-device-pass-12/r-18`, `r-20` |
| Seal GENERATING: breathes 0.6→1.0 over 1.6 s ease-in-out | PROVEN | `Seal.tsx:52-72` with `motion.breathe` = 1600 | Exact |
| Seal LOADING label "LOADING 2.7 GB · 41%" | PARTIAL | `Chat.tsx:814` renders `chat.delivering` = "DELIVERING" | No size, no percent |
| Seal UNSEALED cracked red ring | DEFERRED | the spec says "possible only if a cloud path ever opens"; `setSealState` is never called with `unsealed` | Correctly built-but-unreachable |
| Haptics: rigid on close, warning on breach, never while streaming, no sounds | PROVEN | `services/haptics.ts:4-12`; `Seal.tsx:86,98-100`; no `haptic()` in any streaming path | Sounds row in Settings is a disabled toggle reading "Off. There are none." |
| Reduced motion: static ring, no breathing, no bloom | UNPROVEN | `Seal.tsx:43-50,54-56,87-90` | `qa-run-2026-09-06.md:79` "Reduce Motion not run"; `release-checklist.md:195` still lists it open |
| Chip glyph 12px, 4 pins per side, inner square | PROVEN | `shell/ChipGlyph.tsx:3-26` | In the header chip and the onboarding row |
| …also on the cartridges | MISSING | `ModelCard.tsx` never imports `ChipGlyph` | Confirmed visually in `android-vc15/b-01-vault-top.png` |
| Zero-exit readout OUT / IN / CONNECTIONS | PROVEN on Proof | `Proof.tsx:46`; `en.json:573-574` | `ios-device-pass-12/r-18-proof.png` |
| …same readout in the chats drawer | PARTIAL | `ChatsPane.tsx:63` renders only `{model} · OUT {bytes}` | IN and CONNECTIONS are missing from the drawer |
| Ledger receipt: hairline, collapsed, model/quant/context/ms-per-token/time | PROVEN | `Ledger.tsx:24,28-37,61` | Expanded ledger read on the real iPhone, `live-v14-ledger.png` |
| …opens on long-press **or** chevron | PARTIAL | chevron only | Long-press opens the actions sheet instead |
| Vault cartridges: name, provider, size, quant, expected speed | PROVEN | `ModelCard.tsx:120-146` | `b-01-vault-top.png` |
| …on a Faraday-mesh surface | MISSING | `VaultScreen.tsx:218` plain View on `theme.bg` | |
| …LED status dot | PARTIAL | `ModelCard.tsx:47-48` is a colour-coded text glyph | Accepted earlier as review issue #8 |
| …filament-coloured **hairline** progress bar | PARTIAL | `ModelCard.tsx:147-151,188-189` — inside the card, amber while delivering | Height is 4px, not a hairline, and it turns green at 100% |
| Chat anatomy: no bubble, flat, full width, mono label with no numbers | PROVEN | `AssistantMessage.tsx:57-61,156` | `fixes-r19/a-14`, `live-v13-answer.png` |
| User message surface-1, radius 14 with a 4px bottom corner, no tail, max 85% | PROVEN | `chat/UserMessage.tsx:21,38` | |
| Composer well r10, **amber 60% focus border**, grows to 6 lines, 36px cta-fill send circle, 2px context meter | PROVEN | `Composer.tsx:66,105,118-120,147`; `chat/ContextMeter.tsx:17-18` | `0x99` = exactly 60%. Note §9.4 says 44 and §9.6 says 36 for the send button; code follows §9.6 |
| Streaming: no artificial delay | PROVEN | `Chat.tsx:474` writes straight from the token callback | |
| **2px caret blinking at 600 ms** | PARTIAL | `Markdown.tsx:40-46` renders a static `▍` | No blink: no Animated value, no interval |
| Pulsing dot in the 200 ms–2 s wait window | PARTIAL | `AssistantMessage.tsx:139-155` | 500 ms loop with no 200 ms floor and no 2 s ceiling |
| Markdown buffered until the syntax closes | PROVEN | `Markdown.tsx:179-190` (comment cites §9.6) | |
| Auto-scroll only within 100px of the bottom | PROVEN | `Chat.tsx:667-670,1151-1152` | |
| Collapsed "Reasoning · 1.2 s" in text-3 | PROVEN | `AssistantMessage.tsx:63-71`; `en.json:363` | |
| Liquid Glass on iOS 26 **navigation layer only**, `.regular` | PROVEN | `shell/NativeChrome.tsx:10,22-45` | `ios-device-pass-12/r-18-proof.png`. `GlassView` appears nowhere else |
| M3 Expressive floating toolbar; FAB shape morph | PROVEN / UNPROVEN | `NativeChrome.tsx:57-68` proven in `fixes-r19/a-14`; the 16→28 morph (`:85-96`) has no before/after capture | |
| Dynamic color **disabled** on semantic surfaces | PROVEN | `android/app/src/main/res/values/styles.xml` is `Theme.AppCompat.DayNight`; `DynamicColors.applyToActivitiesIfAvailable` is never called | Disabled by construction |
| Desktop minimum window **1040×720** | MISSING | `src-tauri/tauri.conf.json` sets `minWidth: 720, minHeight: 480` | The constant exists and quotes the spec (`lib/layout.ts:7 DESKTOP_MIN = 1040`) but never reaches the window. One-line fix |
| Cmd/Ctrl+N, Cmd/Ctrl+K, Esc, tray | PROVEN in a browser / PARTIAL | `desktopKeys.ts:17,24-27`; `shell.rs:74,78-82` | The native menu binds Stop to `CmdOrCtrl+.`, so it never advertises Esc |
| Web: hover only under `@media (hover:hover)` | MISSING | `grep hover` across `apps/mobile/src` and `public/index.html` = 0 | The rule exists only in the marketing site `apps/site/src/site.css` |
| Web: **2px amber keyboard focus ring** | MISSING | `grep outline\|focus-visible` across the app = 0 | The app relies on the browser default. A real accessibility gap on the web build |
| App icon: closed ring on graphite, one filament highlight at 2 o'clock, layered, adaptive, tinted/clear | PROVEN | `design/icon/inborn-icon.svg:6-25`; `design/icon/Inborn.icon/icon.json`; `assets/android-icon-{background,foreground,monochrome}.png` | Assets inspected. No shield, no lock, no sparkle |
| …survives a 48px silhouette | UNPROVEN | one thick closed ring, so it does by construction | No 48px rendering or tinted capture is committed |
| Do/don't list: no purple, no gradient text, no glow border, no shield/lock outside the seal, no card-in-card, no grey-on-colour, no pure black, no permanent animation | PROVEN | repo-wide greps returned 0 for purple and the named hexes; `packages/ui/src/icons/paths.ts` has no shield or lock; `grep shadowColor\|elevation` across `apps/*/src` and `packages/ui/src` = **0 hits**; both animation loops are conditional and torn down | The strongest-conforming subsection in the audit |
| §9.10 Claude design skills | N/A | the spec itself says the installation "was not performed in the current environment" | Documentation-only |

## §10 — Edge cases (all 70 rows)

Spec: `docs/spec-src/10-edgecases.html` (162 lines). The spec states that every row here is also a §14 test. **Counts across the 70 rows: 11 IMPLEMENTED+PROVEN · 8 IMPLEMENTED-UNPROVEN · 41 PARTIAL · 6 MISSING · 4 DEFERRED-BY-DECISION.**

Two structural facts first. `apps/mobile/android` and `apps/mobile/ios` are untracked prebuild output (`git ls-files` returns nothing for either), so the only tracked native configuration is `app.config.ts` plus `apps/mobile/plugins/*` — several native claims rest on regenerated files. And `docs/qa/edge-cases-matrix.md` has not been touched since the 6.9 and 13.9 runs: **43 of its 70 rows are blank and 16 more are now factually wrong.**

| # | Case | Class | Evidence | What is missing |
|---|---|---|---|---|
| 1 | Built-in Instant on first launch | PARTIAL | `plugins/withBundledModel.js:14`; `ios-device-pass-12` row 0 (`instant.gguf` 532,517,120 B) + T01 Play fast-follow | Only the accelerator clause; core requirement proven |
| 2 | Interrupted download resume | PARTIAL | `httpsDelivery.ts:89,131-135`; `catalog/resume.ts:21-39`; T05 + R4-F14 byte-exact | iOS 26 Apple-hosted packs do not exist yet `privacy-policy.md:38` promises them; no progress notification |
| 3 | 429 / host down / firewall | PARTIAL | host allowlist `manifest.ts:16-29`; `vault/hf.ts:44-63`; `cdn-iphone` rows 2-3 | No mirror list; no manual import on web |
| 4 | Expensive cellular / Low Data | PARTIAL | Play consent `playDelivery.ts:92-100`; policy `resume.ts:52-58` | **Wi-Fi-only default is inert off Android**; `isExpensive`/`isConstrained`/`isActiveNetworkMetered`: 0 occurrences |
| 5 | Wrong or huge model size | PROVEN | real HEAD at `httpsDelivery.ts:141-147`; free-space block `install.ts:38-46`; R4-F20b, `cdn-iphone` rows 2/5/6 | Mismatch branch untested |
| 6 | Storage full / ENOSPC during a DB write | PARTIAL | `paths/noSpace.ts`; WAL `schema.ts:5`; R4-F13 PASS with `/data` really filled | `ACTION_DEVICE_STORAGE_LOW` absent — only a 10 s poll, so pausing happens after ENOSPC |
| 7 | SD card / SAF / external storage | **MISSING** | vault hard-wired internal `vault/paths.ts:6-13`; `ACTION_OPEN_DOCUMENT_TREE` 0 hits | Everything — and **no deferring sentence exists anywhere** |
| 8 | Corrupt file + quarantine | PARTIAL | GGUF sniffing `catalog/gguf.ts:171-218`; quarantine marker `vault/record.ts:14-16`, never auto-loaded `store.ts:346-352`; T08 rejects a random file | **The quarantine path has never run anywhere**; tensor count parsed but never validated |
| 9 | Catalog model the engine cannot run | UNPROVEN | `minEngine` at `catalog/types.ts:82,97` → `pick.ts:76` | T40 `BLOCKED (not run)` since 6.9; no manifest entry sets `minEngine > 1`, so the path is unreachable in the shipped catalog |
| 10 | Gated / licensed models | PARTIAL | token + Keychain `vault/hf.ts:21-41`; licences screen | **No acceptance gate before download**; `grep "accept.*licen"` = 0 |
| 11 | Model does not fit RAM | PARTIAL | `pick.ts:23-44,71-81`; context cap `policy.ts:346`; T36 on a 4 GB profile | Not the spec's estimate (no weights+KV+activations+baseline); **no expert override**; the context reduction is silent |
| 12 | jetsam mid-generation | PARTIAL | memory warnings both platforms; `lib/pausedTurn.ts`; R-B8 on the real 6T | `use_mlock: true` (`adapters/llamaRn.ts:48`) is the opposite of the spec's mmap guidance; partial written only after the stream. **Open defect F43** |
| 13 | Weak Android | PARTIAL | minSdk 26; `android-legacy` class `catalog/speed.ts:13-60`; real 6T §P | **arm64-only is not pinned in any tracked config**; no Play device exclusions; no dotprod/i8mm detection |
| 14 | Old iPhone + OS floor | PARTIAL | 1B-for-4 GB satisfied | **Ships iOS 16.4** (`Podfile:27`, 4× `IPHONEOS_DEPLOYMENT_TARGET = 16.4`) while §6.3, `release-checklist.md:246` and `privacy-policy.md:39` all say 17 |
| 15 | 16 KB pages | PROVEN, stale | B1: 45/45 `.so` aligned 0x4000, `zipalign -c -P 16` OK, OnePlus 11 and ps16k emulator launch clean (7.9.2026) | The launch half has not been re-run since the bundle gained three asset packs; no CI alignment gate |
| 16 | GPU/NPU failure + CPU fallback | PARTIAL | real probe only on web `wllama.ts:20-33` | No native probe (`llamaRn.ts:46` hard-codes `n_gpu_layers: 99`); **no acceleration tag**; no override |
| 17 | Rooted / jailbroken | PROVEN | no Play Integrity or root detection by design; offline verification carried the real refund in `purchases-run-2026-09-06.md` §3.5–3.7 | No run on an actually rooted device |
| 18 | Sustained heat | UNPROVEN | `device/android.ts:20-33`; `policy.ts:434-452`; strings exact | **Never observed**: the 6T reports Thermal Status 6 permanently; soaks 4-8 show a frozen skin sensor |
| 19 | Low battery / saver | PARTIAL | detection + policy + heavy unit coverage | `pauseDownloads`, `pauseIndexing`, `confirmLongAnswer`, `sealGlow` are computed and **read by nothing**. Every soak ran plugged in at 100% |
| 20 | Charging while generating | UNPROVEN | charger-independent thermal path; restore hint | Combination never observed |
| 21 | Background mid-generation | PARTIAL | 15 s grace `Chat.tsx:114,317-333`; R-B8 partial kept and resumed on the real 6T | **`beginBackgroundTask` = 0 hits**; **no `<service>` and no `FOREGROUND_SERVICE`**. `release-checklist.md:101` states a bar the build cannot meet |
| 22 | Killed during a DB write or migration | PARTIAL | WAL; atomic migrations `sqliteRepository.ts:114-126`; R4-F13/F15 | **No `integrity_check`, no Repair path**; `sqliteRepository.ts:213-217` answers "not a database" by calling `deleteDatabaseAsync` — silent total data loss |
| 23 | Concurrent generations, one queue | **MISSING** | `adapters/llamaRn.ts:15,98` `inflight` is overwritten per call; serialization is per-surface `busy` only | No queue, no priorities, no timeout. The spec's "Waiting for the current answer" string exists in no locale |
| 24 | Model switch / delete in use | PARTIAL | wait-then-switch `engine.ts:189-199`; delete blocked while loaded; nine mid-stream reloads, 0 crashes | Spec wants cancel-with-confirmation and an offer to reload; the build does both silently |
| 25 | Shortcut while locked or incognito | DEFERRED | `README.md:596-598` cuts Shortcuts/widgets | For the live analogue: `AppServices.tsx:386` hard-codes `incognito: false`, so a share-in drops the user out of an incognito session |
| 26 | OS or app update changes the engine | PARTIAL | `ENGINE_VERSION` gate; re-verify on byte change; seven consecutive real Play updates on the 6T | **No in-app release notes** though `release-checklist.md:277` makes them a pass criterion; models never re-hashed after an engine bump |
| 27 | Apple FM states | DEFERRED | `README.md:597`; `adapters/appleFm.ts` is a throwing stub, not registered | The team owns no Apple-Intelligence device |
| 28 | Apple Intelligence off / ineligible | PROVEN (vacuously) | "Apple Intelligence" / "Apple FM" → 0 hits in all locales, `docs/legal/`, the site | Nothing for 1.0 |
| 29 | Gemini Nano / AICore | **MISSING** | 0 hits for AICore / Gemini Nano / BACKGROUND_USE_BLOCKED | The Android half entirely, and **it is not a declared cut** — `docs/legal/licenses.md:32` still ships it as "planned" |
| 30 | Huge / scanned / protected PDF, DOCX, XLSX | PARTIAL | streaming per-page index; encrypted refused both platforms; tracked changes `docx.ts:19`; real 6T OCR §N | Images inside documents unhandled; no iOS column reading order; OCR progress/cancel not observable |
| 31 | Non-English / RTL / CJK documents | PARTIAL | tokenizer-aware chunking; per-language recommendation; T18 Hebrew scan OCR'd in correct logical order | **The embedder is English-only** (`manifest.json:318-337`); **only `eng`+`heb` OCR packs ship with no download mechanism**; vertical CJK absent |
| 32 | Beyond the context window | PARTIAL | meter, thresholds, sliding window with pinned system prompt, summary machinery | The summary is **manual**; no marker in the transcript; **zero QA coverage anywhere** |
| 33 | Huge paste / 100 MB share | PARTIAL | 6,000-char quick-action cap with a message; 200 MB file cap; real 6T PROCESS_TEXT → Replace into Google Docs | The 50,000-char share cap is silent; the 100 MB case never run; a `content://media/…` share imports nothing with no error |
| 34 | Prompt injection through documents | UNPROVEN | `rag/injection.ts:8-27,51-58` — 13 patterns, per-request nonce fence, declared in the system prompt | Only one emulator hidden-div probe; never faced an adversarial document outside unit tests. Tool calls do not exist in 1.0, so that clause is vacuous |
| 35 | Images: HEIC / EXIF / huge / denied | PROVEN | `images/pick.native.ts:10,29-45`; T45 on the real 6T — 0 EXIF tags, 24.8 MB PNG → 632,777 B JPEG | Camera-denied branch never exercised |
| 36 | Harmful output + report + classifier | PARTIAL | report on every message; local list; safety system prompt | **No on-device safety classifier exists** (`grep shieldgemma\|familySafe\|classifier` = 0) and no guardrail settings, yet three shipped documents say both exist. T37 was a FAIL on a simulator |
| 37 | Medical / legal / crisis | PARTIAL | `chat/safety.ts:4-56` — 9 languages, 18 regions; non-blocking card | No built-in persona carries a disclaimer; **no Work "verify before use" banner in chat**; `ko` and `zh-Hant` ship with no crisis list |
| 38 | Hallucinations / "can be wrong" | PARTIAL | dismissible persisted notice; citations; model label; real-iPhone rows | **Model size deliberately not shown** (`lib/models.ts:3` cites §8.2) — §8.2 and §10.5 contradict each other |
| 39 | Loops and system-prompt leaks | PARTIAL | n-gram guard `chat/loop.ts:18-44`; real 6T "The model started repeating itself · Regenerate" | **No repeat penalty; stop sequences plumbed but always empty; "reset persona" does not exist** |
| 40 | Wrong language or script | PROVEN | `chat/language.ts:46-50` → system prompt; bidi rendering; Hebrew answer intact on the 6T | No Arabic or CJK answer-language run |
| 41 | "Uncensored" expectations | UNPROVEN | 7 first-party models, all Apache-2.0 or MIT; store copy in 8 locales has 0 hits for uncensored/unfiltered/jailbreak | No QA row records the copy review; no automated gate protects the listings |
| 42 | iCloud / Google backup | PARTIAL | `app.config.ts:86 allowBackup: false`, R-B3 PASS on the merged release manifest; iOS exclusion `VaultNativeModule.swift:36` | No device proof of `isExcludedFromBackup`; `Storage.tsx:54` tells Android users their chats are in the backup |
| 43 | New phone / restore / transfer | PARTIAL | model re-download and Pro restore both proven twice | **Chats cannot restore**: Android has no backup and the iOS key is `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. The answer (passphrase export) is deferred |
| 44 | Same account, several devices | UNPROVEN | "There is no cloud sync. Another device starts empty." shipped and drawn on the iPhone | No QA row quotes the sentence |
| 45 | Shared device / family member | PARTIAL | lock offer; FLAG_SECURE; incognito never persists; Work vault code | "Hide app" guidance absent; T14/T16 never run on a phone; **open F17 — Unvault bypasses a locked vault's code** |
| 46 | User deletes the app | PARTIAL | warning string; export row | The export row is disabled behind Pro, so the offer is cosmetic; never checked in QA |
| 47 | Data Protection under lock | **MISSING** | `NSFileProtection` / `completeUntilFirstUserAuthentication` / `FileProtectionType` → **0 hits** anywhere | Every secret is `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, stricter than the spec but incompatible with the background download that really does run under lock |
| 48 | Offline Pro verification + 30-day grace | PROVEN | JWS chained to a pinned root `apple.ts:41-45,106-139`; `GRACE_DAYS = 30`; `testOfflineCacheGrantsPro` PASS; real Play order acknowledged | The offline half is simulator-only; T23 never ran on a phone |
| 49 | Restore / Family Sharing / refunds | PARTIAL | family-shared ownership accepted; `revocationDate` locks and deletes nothing; proven twice | **Family Sharing is off on all four ASC products**; `paywall.revoked` is translated into 8 languages and **rendered nowhere** |
| 50 | Prices / regions / Work upgrade | PROVEN | `entitlement.ts:60-66`; real Play "Upgrade to Work · ₪149.90" after the live purchase | Regional-price policy is an open decision, not a code gap |
| 51 | Piracy / cracked IAP | PROVEN | the local key check was demonstrably the deciding gate on a real phone (`untrusted-root` → unlock) | |
| 52 | Interrupted purchase (Ask to Buy) | UNPROVEN | `manager.ts:240-243,264-288` finishes on next `start()`; unit test only | **Never executed anywhere**: `askToBuyEnabled = false` in all three XCUITest harnesses |
| 53 | VoiceOver / TalkBack while streaming | PARTIAL | `lib/announce.ts:4-24`; polite per-sentence with a 1,500 ms floor | The only real screen-reader run is **pre-fix and FAIL**; no post-fix run; no 1,000-token run |
| 54 | Dynamic Type + RTL + Markdown | PARTIAL | horizontal scroll for code and tables; real font scale; T25 PASS at 200% | **T24 is FAIL as written** — no RTL locale ships; only `debug.force_rtl`. All proof is simulator/emulator |
| 55 | Hardware keyboard | PARTIAL | `modules/hardware-keys/index.ts:8` Android only; F27 fixed and re-proven on the 6T | **The setting the spec requires does not exist**; iPad, the platform the case names, has no module |
| 56 | One very long message | PARTIAL | FlatList; `listClipping.ts` forces `removeClippedSubviews:false` after F33 | Android gets neither anchoring nor recycling. **No test anywhere** for a 10K-token message |
| 57 | Screenshots and recording | PARTIAL | FLAG_SECURE opt-in; `isCaptured`; privacy cover; honest copy | Emulator only; `isCaptured` → blur never exercised; switcher thumbnail explicitly never captured |
| 58 | Clipboard leaks | **MISSING** | `lib/clipboard.ts` is a bare `setStringAsync`; its own comment defers expiry to M6 | **`prefs.clipboardExpirySec` is written by a live Off/60 s control (`Settings.tsx:146-147`) and read by nothing.** A shipped security promise the code does not keep |
| 59 | Crash logs with prompt text | PROVEN | no third-party crash SDK in any lockfile; TRACKERS 0 on both real devices | No scrubbing mechanism and no lint rule — the guarantee rests on discipline |
| 60 | Third-party SDK network calls | PARTIAL | `scripts/check-android-permissions.sh` is correct; T32 PASS (0 sockets, 30 min mitmproxy); allowlist published | **`.github/workflows/ci.yml:16-22` has `android-permission-gate: if: false`** — the gate is not in CI. The iOS/desktop egress test does not exist |
| 61 | Model supply-chain integrity | PARTIAL | Ed25519 manifest, host allowlist, per-shard sha256, pinned engine versions; `cdn-iphone` row 6 hash identical to the catalog | **Zero fuzzing**; no sandboxed GGUF parsing; no CVE process recorded |
| 62 | LAN on hostile Wi-Fi | DEFERRED | `README.md:596-599` cuts LAN; Android has no INTERNET permission at all | |
| 63 | Sideload / EU stores / notarization | **MISSING** | nothing in `docs/legal/` covers it | The whole row — a docs-only deliverable that was never written |
| 64 | Children and age rating | PARTIAL | full 13+/Teen answers in `app-privacy-details.md:79-101` | `:98` answers Apple's parental-controls question "Yes: content filter on by default" — **a declaration about software that is not in the build** |
| 65 | Regulated professionals | UNPROVEN | `work/packs.ts:57` FORBIDDEN_CLAIMS with tests; pack declarations before use; signed export | **No real-device QA row for the Work tier anywhere**; the verify reminder is one-time, not a persistent banner |
| 66 | Clock / timezone / DST | PARTIAL | re-checks on start, foreground and hourly | `chat/retention.ts:14-16` is pure wall clock: move the clock forward and chats delete early and irreversibly. No test |
| 67 | App Review testers with no network | PROVEN | `ios-build-12` bundles `instant.gguf` 532,517,120 B; llama.cpp loads it from `Inborn.app` on the phone; Android fast-follow T01 | Only `{{TESTER}}` / `{{PRIVACY_URL}}` placeholders to fill |
| 68 | First manifest-signature change | PARTIAL | `schema: 1`, `version: 4`; per-model `minEngine` floor asserted in tests | `manifest.ts:17` hard-rejects any other schema; one compiled key with no rotation overlap; no rotation plan |
| 69 | Cloud-speed expectations | PARTIAL | honest device line; speed ranges incl. `android-legacy`; F37 closed on the 6T | **Open defect U11: Fast measured 13.2 tok/s where its card promises ~15-24.** The pre-made demo does not exist |
| 70 | Widgets / Live Activities | DEFERRED | `README.md:596-598` | |

## §11 — Store and legal

Spec: `docs/spec-src/11-store-legal.html` (71 lines). Evidence caveat: the on-disk merged Android manifest under `apps/mobile/android/app/build/` is a **stale artifact** (it still lists `ACCESS_WIFI_STATE`, `WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED` and lacks `RECORD_AUDIO`) and was not used as evidence anywhere below. The QA runs and `scripts/check-android-permissions.sh` were used instead.

### §11.1 Apple

| Requirement | Class | Evidence | Note |
|---|---|---|---|
| Age rating 13+, honest questionnaire, not Kids | UNPROVEN (answer only) | `docs/legal/app-privacy-details.md:79-103` — 16 rows with reasoning | **Not filed** in App Store Connect |
| Guideline 1.2 — **filtering** of AI output | **MISSING** | no classifier, no safe-mode toggle; `grep familySafe\|classifier` = 0 | `privacy-policy.md:87`, `terms.md:50` and `app-privacy-details.md:193` all claim it exists |
| Guideline 1.2 — reporting | PROVEN | `chat/report.ts`; T37 works with no network; R-B12 PASS on emulator | Simulator/emulator only, never a real device |
| Guideline 1.2 — **blocking** | **MISSING** | `ReportReason` = offensive / dangerous / wrong / other (`chat/types.ts:144`) | `app-privacy-details.md:193` claims a "block persona" reason that does not exist |
| Guideline 1.2 — contact info | UNPROVEN | `About.tsx:13` hardcodes `support@inbornapp.com` | The legal docs still carry `{{SUPPORT_EMAIL}}` unfilled |
| Guidelines 2.3.6, 5.1.1, 5.1.2(i), 5.1.4 | UNPROVEN / PARTIAL | `app-privacy-details.md:191-201` | Privacy-policy URL is `{{PRIVACY_URL}}`; the page is not deployed |
| Reviewer notes (zero network, bundled model, how to test Report) | UNPROVEN | two divergent texts: `app-privacy-details.md:204` and `docs/store/listing.en.json:56` | Not filed; `listing.en.json` claims Family Sharing on iOS, which is false |
| Bundled model for offline review | PROVEN | `app.config.ts:135` `withBundledModel`; `ios-build-12` 532,517,120 B; real-device chat turn in `ios-device-pass-12` | `edge-cases-matrix.md:73` still says the opposite — stale |
| "Data Not Collected" label | UNPROVEN (answer only) | `app-privacy-details.md:5-17` | Not filed. Supporting fact PROVEN: 0 trackers across 40,604 dex classes (T29) |
| PrivacyInfo.xcprivacy with E174.1, 85F4.1, CA92.1, C617.1, 3B52.1, 35F9.1 | PROVEN | `apps/mobile/ios/Inborn/PrivacyInfo.xcprivacy:5-42` — all six plus 0A2A.1; verified by `plutil -p` in QA and present inside the archive | **Not pinned in config**: `grep privacyManifest` over `app.config.ts` and `plugins/` = 0, and `ios/` is gitignored. It survives only because Expo's template emits exactly these categories |
| `NSPrivacyTracking = false` | PROVEN | `PrivacyInfo.xcprivacy:45-46`; collected-data types empty | |
| llama.rn ships no manifest, so the app declares for it | PROVEN | `app-privacy-details.md:21-33` inventory | |
| Xcode "Generate Privacy Report" on the archive (T35) | **MISSING** | `qa-run-2026-09-06.md:87` "not run"; no later run records it | The one check that proves the aggregate app+pods manifest has never been executed |
| SBOM of native libraries | PARTIAL | `NOTICE.json` `group:"engine"` + `licenses.md:36-57` are a hand-maintained inventory | Not machine-readable; `licenses.md:90` still says the generator is "to be written" and `scripts/` has no such file |
| Foundation Models acceptable use | DEFERRED | `README.md:466`; `app-privacy-details.md:200` | |
| Non-consumable Pro | PROVEN | `apple.ts:139` rejects any other type; four ASC products `NON_CONSUMABLE` | |
| **Family Sharing enabled in ASC** | **MISSING / open decision** | `purchases-run-2026-09-06.md:76-81` "family sharing: off" on all four; `:87` calls it a one-way door on Moshe's list | Code side is complete and correct; the real iPhone shows "Family Sharing is not enabled for this product yet." |
| JWS verified on device | PROVEN | `apple.ts:85-160` full x5c chain to a pinned `APPLE_ROOT_CA_G3` with a fingerprint self-check; seven runs on the real iPhone 13 Pro | |
| revocationDate locks features, not data | PARTIAL | `apple.ts:154`; `entitlement.ts:9`; refund run 07 | "No chats existed on the proof build", so the data-survives half is unproven |
| Small Business Program (15%) | **MISSING** (no evidence) | only an assumption in `docs/ops/metrics-without-sdk.md:17` | No enrolment record anywhere |
| iCloud backup excluding models | UNPROVEN | `VaultNativeModule.swift:36` | T39's iOS half explicitly not run |
| Siri AI Extensions (iOS 27) | DEFERRED | `README.md:466` | |

### §11.2 Google Play

| Requirement | Class | Evidence | Note |
|---|---|---|---|
| AI-content (a) in-app reporting **and using reports to filter** | PARTIAL | reporting proven; `app-privacy-details.md:162` downgrades the rest to "reviewed by us when emailed" | No filtering loop exists |
| AI-content (b) no prohibited generation | PARTIAL | the catalogue claim holds — 7 first-party models, all Apache-2.0 or MIT | The cited "safety system prompt" and "family-safe classifier default" are both absent (`chat/context.ts:46` has no safety block) |
| AI-content (c) responsibility incl. testing | PARTIAL | T38 PASS on simulator (crisis card, refusal, loop guard) | No red-team or prohibited-content test exists anywhere |
| AI-content (d) marking AI-generated content | PROVEN | `onboarding.disclaimer` native in **all 8** locales; `chat.modelLabel`; observed as "INSTANT · ON-DEVICE AI" on device | |
| AI-content (e) AI content for minors | PARTIAL | 13+/Teen answers written | The protective control they name does not exist |
| IARC "Teen" | UNPROVEN (answer only) | `app-privacy-details.md:167-183`, full 11-row table | **Not filed.** Play's July-2026 rule bars unrated apps, so this blocks the first upload |
| Data Safety "No data collected / No data shared" + policy URL | UNPROVEN (answer only) | `app-privacy-details.md:107-117` | Not filed; the URL is a placeholder and the page is not deployed |
| **Manifest with no INTERNET**, so Play shows no network access | PROVEN | `app.config.ts:88-104` `blockedPermissions`; gate `check-android-permissions.sh:41-43`; R-B2 PASS on the real Play build; T32 on the OnePlus 6T — no netstats rows, `ss -tuapn` 0 sockets, proof screen `OUT 0 B · IN 0 B` | The strongest-evidenced requirement in the whole audit |
| Saying in the policy that Google sees the download | PROVEN (doc) | `privacy-policy.md:32` | Policy still DRAFT and unpublished |
| Play Billing 9.x | PROVEN | `billing:9.1.0` resolved via `expo-iap` 5.5.0 → `openiap-google` 3.5.0 | |
| "its manifest has no INTERNET, verified" | PARTIAL — **the spec's reason is wrong** | the merger report shows INTERNET REJECTED from three sources, one of them **`openiap-google:3.5.0`**, the wrapper we actually ship | The Billing library itself is clean; the wrapper is not, and is stripped only by `tools:node="remove"` |
| Offline `queryPurchasesAsync` cache | PROVEN | `manager.ts:174-185`; `testOfflineCacheGrantsPro` PASS | |
| Acknowledge within 3 days | PROVEN | `play.ts:98-103`; real order `GPA.3398-…` Processed, not refunded | Negative control: v1's rejected order was auto-refunded |
| Family Library excludes IAP | PROVEN | `PaywallScreen.tsx:136`; real Play build | |
| dataSync foreground service ≤ 6 h in 24 | PARTIAL | the service is Play's own; we declare none | Generation runs in-process, so the cap cannot bind us — but no doc states that conclusion and no test measures it |
| Target API 36 by 31.8.2026 | PROVEN | T34 PASS: merged manifest targetSdk 36 / minSdk 26 | Play pre-launch report half not run |
| Developer verification by 30.9.2026 | UNPROVEN | asserted in `app-privacy-details.md:187` | No console evidence |
| 16 KB pages mandatory | PROVEN (static) / PARTIAL (runtime) | R-B1 45/45 aligned | Runtime proof on a real 16 KB device never executed |
| "Low-value AI apps" differentiation | PROVEN | proof screen, vault and documents all ship and are proven on devices | |

### §11.3 Law

| Requirement | Class | Evidence | Note |
|---|---|---|---|
| On-device only, no collection, no sharing, no tracking | PROVEN (text + substance) | `privacy-policy.md:14-26`; substantiated by T29, T30/R-B2, T32 | Policy is DRAFT and unpublished |
| Purchases and OS diagnostics by Apple/Google as independent controllers | PROVEN (doc) | `privacy-policy.md:53-62` with four operator links | |
| Model download exposes an IP | PROVEN (doc) | `privacy-policy.md:39` names the host, what is and is not transmitted, "no per-request logs" | |
| Support email is the only personal data, legitimate interest, deleted after handling | PROVEN (doc) | `privacy-policy.md:64-66`, Art. 6(1)(f), 90 days | `maintainer-notes.md:10` flags the 90 days as an unratified decision |
| CCPA "do not sell or share" | PROVEN (doc) | `privacy-policy.md:81-83` | |
| **AI Act Art. 50(1)** — disclosure in S01 and persona headers | PROVEN | `onboarding.disclaimer` in all 8 locales; `chat.modelLabel` observed on device | |
| **AI Act Art. 50(2)** — machine-readable marking of every export | **PARTIAL** | Markdown carries YAML front-matter `ai_generated: true` + generator + model + timestamp (`chat/export.ts:74-87`); JSON carries `aiGenerated: true` (`:48-52`); text carries the notice (`:67`); "Export all" concatenates marked bodies | **The Work signed-record JSON carries no marking at all.** `work/signedRecord.ts:23-36` has no `aiGenerated` field and `buildRecord` adds none — and it is the primary artifact of that export path. `ai-act-notes.md:24` calls this stamp a **launch requirement of M8**; `:79`'s promised unit test does not exist |
| Never "HIPAA-compliant" or "privileged" in marketing | PROVEN | `work/packs.ts:57` FORBIDDEN_CLAIMS with tests; T50 PASS | Covers the packs; does not lint store listings or the site |
| Downloadable architecture statement | PARTIAL | `work/statement.ts:31-77`, dated and build-stamped with a §6 non-claims section; T52 PASS | Spec §11.5 item 10 says **PDF**; the output is Markdown, and it is not offered from the website |
| Verify-before-use banners in Work | PROVEN | each pack declaration carries it verbatim, plus the Art. 50(4) sentence | Shown before first use; no T-row asserts a persistent banner during a Work chat |

### §11.4 Model and component licences

| Row | Class | Evidence | Note |
|---|---|---|---|
| Apache-2.0 models — NOTICE/LICENSE + attribution | PARTIAL | `NOTICE.json` carries every Qwen row with `licenseUrl`, attribution and the obligation list; rendered by `About/Licenses.tsx:27-58` | **The obligation is declared but not discharged**: the screen shows name, attribution and a link, never the licence text, and **no LICENSE or NOTICE file for any model is bundled**. Apache-2.0 §4(d) wants the NOTICE to travel with the distribution. Granite 4 is in neither NOTICE.json nor the catalog |
| MIT notices (Phi-4-mini, llama.cpp, whisper.cpp) | PARTIAL | `NOTICE.json` Microsoft copyright line; `licenses.md:40-43` | Same defect. whisper.cpp is "planned" in the doc but `speech-whisper-base` is live in the catalog |
| Gemma terms / ShieldGemma | N/A — correctly excluded | the catalog's 7 models contain no Gemma; `licenses.md:34,84` records the reasoning | **The family-safe classifier is not ShieldGemma because there is no classifier at all**, so no terms screen is needed |
| No Llama in the default catalog | PROVEN | no Llama entry; `grep "built with llama"` = 0 | `muse-glimmer-30b` is held back as `planned` pending licence verification |
| LFM licence; Mistral MRL exclusion | PROVEN (excluded) | `licenses.md:21,34`; `ministral-3-8b` scope `planned` with an empty `licenseUrl` | |
| Apple / Gemini platform terms | DEFERRED | `README.md:466`; `licenses.md:31-32` | |
| Kokoro with the espeak-ng GPL-3 trap | DEFERRED, trap avoided | `grep -i "espeak\|kokoro\|misaki"` = **0 hits** | TTS at 1.0 is the OS synthesiser only. The GPL-3 risk is genuinely zero today |
| IBM Plex OFL attribution | PROVEN | `LICENSE-OFL.txt` in both font directories; plus `icons/LICENSE-lucide.txt` | The only component whose licence text is actually bundled |
| In-app "Model licenses" screen with name, link, restrictions | PARTIAL | `About/Licenses.tsx:8,29,37-52`, sourced from `NOTICE.json` with no hard-coded entries | Licence text is not viewable. Drift: three models marked `catalogue` in NOTICE.json are not in the catalog |
| HF import shows the licence and **requires a tap** | PARTIAL | licence shown at `HfSearch.tsx:186`; gated repos marked | **There is no acceptance tap** — `HfSearch.tsx:177` calls `onPick` straight through |

### §11.5 The ten-item compliance checklist

| # | Item | Verdict |
|---|---|---|
| 1 | 13+ rating, not Kids | UNPROVEN — answers complete, **neither store questionnaire filed** |
| 2 | Offline report button explaining nothing is sent automatically | PROVEN — `report.explain` and `reports.explain` ("Inborn never sends anything."), T37 offline, R-B12 |
| 3 | AI disclosure in onboarding and persona headers, "can be wrong" | PROVEN in all 8 locales |
| 4 | Privacy URL both stores + in-app; Data Not Collected; Data Safety; privacy manifest; zero networked SDKs | PARTIAL — manifest and zero-SDK PROVEN; **all three store filings missing** and the URL does not resolve |
| 5 | Model licences screen + NOTICE files; no Llama; Gemma flow; HF gating | PARTIAL — screen ✓, no Llama ✓, no Gemma needed ✓; **NOTICE files not bundled, HF acceptance tap missing** |
| 6 | Non-consumable Pro, Family Sharing, offline cache, Restore, cancellation, Play acknowledge, no server | PARTIAL — all PROVEN **except Family Sharing, which is off in ASC by open decision** |
| 7 | Backup: models excluded, chats included and encrypted; passphrase export for transfer | PARTIAL — Android exclusion PROVEN, iOS UNPROVEN, **passphrase export is a declared cut**, and `allowBackup="false"` contradicts the policy's promise that chats are in the Google backup |
| 8 | Safety: family-safe default, crisis card, medical/legal declarations, loop control and stop | PARTIAL — crisis card, loop guard and declarations PROVEN; **family-safe default MISSING** |
| 9 | Android: 16 KB, target API 36, foreground-service pattern, developer verification | PARTIAL — 16 KB static ✓ runtime ✗; API 36 ✓; the rest asserted, not evidenced |
| 10 | Work: PDF architecture statement, no forbidden claims, verify banners, retention controls | PARTIAL — claims guard and banners PROVEN; **the statement is Markdown, not PDF, and is not offered from the website** |

### §11.6 Trademarks

The **clearance** work is done and well documented. The **protection** work does not exist.

| Step | Status |
|---|---|
| TMview check in classes 9/42 before choosing the name | **DONE** — `docs/ops/trademark-watch.md:14`: baseline 3.9.2026, re-run 6.9.2026 via `scripts/tm-watch.sh`, 264 results, **0 identical live marks in 9/42 at EM/US/GB/WO, exit 0**. The Autark rejection that forced the rename is documented in `docs/research/trademark-clearance-2026-09-03.md:8` |
| Word-mark filings before any publication (EUIPO / USPTO / UKIPO / ILPO) | **DOES NOT EXIST** — `trademark-watch.md:49-59` is a costed plan only (EUIPO €900, USPTO $700, UKIPO £265, ILPO ≈₪1,600–1,800, attorney $1,500–3,000). **No application number, no receipt, no attorney engagement anywhere.** The spec's own rule is "file before any publication" |
| 6-month Paris priority window | Cannot start — depends on a first filing |
| Monitoring service | PARTIAL — `scripts/tm-watch.sh` works and has run twice; `docs/ops/com.inbornapp.tm-watch.plist` exists but `trademark-watch.md:18` says installing it was **not done**. A monthly watch on paper, running never |
| Prefer a coined word | DONE by decision (the Autark → Inborn rename) |
| First-use documentation from day one | **DOES NOT EXIST** — `trademark-watch.md:67` is an unchecked box. The app is unpublished, which is exactly why filing first is still possible |

## §12 — Monetization

Spec: `docs/spec-src/12-monetization.html` (60 lines).

| Requirement | Class | Evidence | Note |
|---|---|---|---|
| Pro **$19.99** non-consumable | PROVEN | `licence/types.ts:9,29`; Play live `USD 19.99`; ASC `6809166022 \| inborn.pro \| NON_CONSUMABLE \| 19.99 (16.99)`; real devices ₪59.90 (StoreKit) and ₪60.00 (Play) | Net $16.99 matches the spec exactly |
| Launch price **$14.99** for 30 days | PROVEN (mechanism) | `types.ts:11,30,35`; `entitlement.ts:44-46,64`; both stores carry the SKU | **`launchAt` is never set anywhere**, so the window is closed until someone supplies a date. Correct pre-launch, a silent no-op if forgotten on launch day |
| Work **$69.99** | PROVEN | `types.ts:12,31`; ASC 69.99 (59.49) matches the spec's net exactly; ₪199.90 on device | |
| Work upgrade **$49.99** for Pro owners only | PROVEN | `entitlement.ts:63`; the card flipped to the upgrade SKU right after the real Play purchase | |
| Work Team **5 seats $249**, Paddle only | PARTIAL | `licenceKey.ts:20-32` carries `seats`, forgery-tested; `terms.md:22` | **No $249 price exists in code** and **no seat enforcement**: `verifyLicenceKey` never reads `seats`. The number lives only in the marketing site |
| **No annual subscription, not even as an anchor** | PROVEN | four one-time product ids; `apple.ts:139` rejects anything but non-consumable; `play-products.mjs` uses `onetimeproducts` only; `terms.md:21` | Cleanly honoured everywhere |
| US prices as the base, with a fallback notice | PROVEN | `types.ts:27-33`; `paywall.usdFallback` | |
| **Regional pricing from the Bible-apps country-ratio table** | **MISSING — it is store-converted pricing** | `play-products.mjs:4-5` "every other region takes the store's own conversion"; Apple derives 174 territories from the USA base; `grep pricing.json\|getCountryPrice` over the repo hits only the spec HTML | Recorded as an open decision in `README.md:464` and in both purchase runs. The numbers diverge sharply: Play set **BRL 104.99** for Pro ≈ 98% of the US price, against the spec's ≈36% |
| Pro first on phone | PROVEN | `PaywallScreen.tsx:35,64`; `entitlement.ts:65` | T57 PASS: Pro card first, "FOR PROFESSIONALS · Pro for Work $69.99" below |
| **Work first on desktop** | UNPROVEN | same line, `Platform.OS === "web"` | No QA row. Worse: on desktop the provider is `licence-key`, so `PaywallScreen.tsx:119` disables **both** buy buttons — Work-first ordering currently orders two dead cards, and there is no in-app path to Paddle |
| Family Sharing iOS only; Play Family Library excluded | PROVEN | `PaywallScreen.tsx:135-136`; both real devices | |
| Never gated: privacy, security, proof, a good model, unlimited chat, accessibility, languages, reporting | PROVEN | `gates.ts:4-7` names all eight and says they are absent on purpose; the `FEATURES` map contains none of them | |
| Never: ads, data selling, subscription-to-continue, message limits, watermarks, surprise trial end | PROVEN | no ad or analytics dependency in any lockfile; T29 0 trackers; `Limits` has exactly four fields and no message counter; `grep watermark` = 0; no trial mechanism exists | |
| Conversion touchpoints: 2nd file, 4th persona, Voice, export all, Sharp | PROVEN | `moments.ts:21-25`; `DocumentsScreen.tsx:47`; `PersonasSheet.tsx:40,140`; `Chat.tsx:832-837,1376-1377`; `ExportSheet.tsx:26`; `manifest.json` `proOnly` | Voice proven on the real iPhone ("Use Whisper instead · PRO"); Sharp PRO chip observed in F6 |
| …each showing **the feature working (a preview)** and one price line | PARTIAL | one price line ✓ everywhere (`paywall.priceLine`) | The "preview" is "the control stays visible, tagged PRO", not the feature running. The generic `Gate.tsx:27-36` fallback is a bare row with no preview |
| **No popup at launch** | PROVEN | the paywall is a route opened only by a tap; nothing auto-navigates to `/paywall`; `Gate.tsx:13` cites the rule | |
| iOS StoreKit 2 `currentEntitlements` + JWS | PROVEN | `apple.ts:85-160`; seven runs on the real iPhone 13 Pro | |
| Restore calls `AppStore.sync()` | PARTIAL | `provider.native.ts:95-97` calls the expo-iap wrapper; restore proven end-to-end on both stores | Effect proven, the literal API unproven — it lives inside the third-party library |
| Android `queryPurchasesAsync` + **RSA signature against the app's public key** | PROVEN | `play.ts:45-96` with the key pinned at `roots.ts:35`. The negative case is the strongest evidence in the repo: with the key empty a genuine Play purchase was refused `untrusted-root` and auto-refunded; with the key pasted the same flow produced "YOU OWN PRO" | |
| Voided Purchases API needs a server, so unused | PROVEN | `play.ts:9-10`; `entitlement.ts:39-41` | |
| **Windows: `StoreContext.GetAppLicenseAsync`** | **MISSING** | `"microsoft-store"` exists as a type and nothing implements it; `provider.web.ts:6-7` "not wired yet (§14.4)" | No `Windows.Services.Store` reference anywhere |
| Paddle key → signed Ed25519 licence file | PROVEN (crypto) | `licenceKey.ts:34-100` canonical-JSON + Ed25519 against a real pinned key; forged-`seats` rejection test | |
| …containing **device id**, SKU and date | PARTIAL | SKU ✓, date ✓ | **The device id is not in the signed payload.** It is attached locally at verify time, so the same key string verifies on any machine; binding exists only in local state that a copied `licence.json` reproduces |
| …**up to 3 devices** | **MISSING** | no constant, check or counter; `licenceKey.ts:25` points enforcement at "Paddle activation" | No Paddle activation call exists either, so the limit is enforced nowhere |
| …**deactivation from the app** | **MISSING** | `grep -ri deactivat` across core, i18n, mobile, desktop, scripts, legal, README = **0 hits** | `licence_clear` exists as a Tauri command and nothing in the UI calls it |
| Team keys with N seats | PARTIAL | `payload.seats` is signature-protected | No consumer of the field |
| **30-day grace when the store is unreachable** | PROVEN | `types.ts:37 GRACE_DAYS = 30`; `entitlement.ts:32-35`; `paywall.grace` / `graceExpired` ("Nothing was deleted."); `testOfflineCacheGrantsPro` PASS | |
| Cross-store: separate purchase, **20–30% offer code** by hand | PARTIAL | the separate-purchase half is PROVEN (`entitlement.ts:12-19`, `paywall.oneStore`, observed on both stores) | **The 20–30% number appears nowhere** — not in `terms.md:24`, not in `docs/store/`, and no ASC or Play offer code exists |
| No hard Play Integrity, no server | PROVEN | no Play Integrity dependency; `roots.ts:1-4` | |
| §12.5 forecast | N/A | planning, not code | Internally consistent; the only way to test it is the manual monthly read in `docs/ops/metrics-without-sdk.md` |

## Number disagreements between spec and code

Every row is a concrete number the spec states and the code contradicts. "Code wins" means the code is right and the spec should change.

| # | Number | Spec | Code / reality | Where | Verdict |
|---|---|---|---|---|---|
| 1 | Desktop message column | §8.9 and §9.3 both say **680px** | `COLUMN_WIDTH = 680` | `lib/layout.ts:11` | **Agree.** The stale 760 lives only in `docs/demo-src/inborn-demo.src.html:78,970`. Fix the demo, not the code |
| 2 | Dark `text-3` | `#667380` | `#7A8794` | `packages/ui/src/tokens.ts:10` | **Code wins.** The spec value measures 3.49:1 on surface-2 and fails WCAG AA; the code value is enforced by `tokens.test.ts:6-11` |
| 3 | Body line length | 65–72 characters | ≈85 characters at 680px / 16px | `lib/layout.ts:11` | **The spec contradicts itself.** 680px and 65–72 CPL cannot both hold. Pick one |
| 4 | Send button size | §9.4 says 44pt minimum, §9.6 says a **36px** circle | 36×36 in a 44-tall row | `Composer.tsx:147` | Spec-internal conflict; code follows §9.6 |
| 5 | Desktop minimum window | 1040×720 | `minWidth: 720, minHeight: 480` | `src-tauri/tauri.conf.json` | **Code is wrong.** `lib/layout.ts:7` even defines `DESKTOP_MIN = 1040` and quotes the spec, but it never reaches the window |
| 6 | Seal close duration | 420 ms | a spring, `speed:14, bounciness:6` | `Seal.tsx:90` | `tokens.ts:138 motion.seal = 420` is defined and never read |
| 7 | Motion scale | 120 / 180 / 280 / 420 ms | all four defined; **three have no consumers and the fourth is bypassed** | `tokens.ts:138` | Only `bloom` (600) and `breathe` (1600) are live |
| 8 | Glow / bloom blur | 24px and 16px | no blur; a RadialGradient falloff | `Seal.tsx:115-122` | RN SVG has no blur primitive. Opacity, colour, scoping and duration are exact |
| 9 | Cartridge radius | 20 | `radius.card` = 14 | `ModelCard.tsx:182` | |
| 10 | Chip radius | 4 | `radius.chip` = 999 | `chat/styles.ts:7`, `ModelCard.tsx:187` | Every chip is a pill |
| 11 | iOS install floor | §6.3 declares iOS 17 | **16.4** | `Podfile:27` and 4× `IPHONEOS_DEPLOYMENT_TARGET` | `release-checklist.md:246` and `privacy-policy.md:39` both repeat 17 |
| 12 | Fast onboarding size | §8.2 says 1.3 GB | 1.2 GB from the catalog | `catalog/manifest.json` | **Code wins** — the screen deliberately reads the catalog (F24) |
| 13 | Fast measured speed | card promises ~15-24 tok/s | **13.2 tok/s measured** | `ios-device-pass-12:159,235`, open defect U11 | A card that over-promises is exactly what edge case 69 exists to prevent |
| 14 | Brazil Pro price | spec ratio implies ≈$7.20 (36% of US) | **BRL 104.99 ≈ $19.5**, ~98% of US | Play console, `purchases-run-2026-09-06.md:29` | The country-ratio mechanism was never implemented |
| 15 | Israel Pro price | one price | ₪60.00 on Play, ₪59.90 on the App Store | both runs | Each store's own conversion; a 0.17% cross-store gap |
| 16 | Work Team | $249, 5 seats | no price in code, no seat enforcement | `licence/types.ts:28-33`, `licenceKey.ts:25` | The number exists only in the marketing site |
| 17 | Cross-store offer code | 20–30% | no number anywhere; `terms.md:24` promises "a discount code" | — | No ASC or Play offer code exists |
| 18 | Paddle device limit | up to 3 devices | no constant, no counter | — | Enforced nowhere |
| 19 | UKIPO trademark fee | £205 + £60 (post 1.4.2026) | correct in the spec | `trademark-watch.md:61` | The gap backlog's £220 is the stale one |
| 20 | Vision support | §6.1 claims "ראייה: כן" for Fast and Sharp | `vision: false` on both | `catalog/manifest.json` | Only Instant has a matching projector (F36) |
| 21 | Launch window | 30 days | `LAUNCH_WINDOW_DAYS = 30` ✓ but `launchAt` is never set | `manager.ts:72` | Mechanism correct, never armed |
| 22 | Grace period | 30 days | `GRACE_DAYS = 30` | `licence/types.ts:37` | **Agree** |
| 23 | Free page cap | 20 pages | `FREE_PAGE_CAP = 20` | `documents/library.ts:26` | **Agree**, never exercised on a device |
| 24 | Context warn threshold | 80% | `CONTEXT_WARN = 0.8` | `chat/context.ts:7` | **Agree**, never triggered (max observed ≈43%) |
| 25 | Auto-scroll window | 100px | 100 | `Chat.tsx:667-670` | **Agree** |
| 26 | Sidebar width | 280px | `SIDEBAR_WIDTH = 280` | `lib/layout.ts:10` | **Agree** |
| 27 | Free-space rule | size × 1.1 everywhere | mobile `max(×1.1, +2 GiB)`, desktop `+512 MiB`, web `+256 MiB` | `install.ts:38`, `models.rs:15`, `opfs.ts:5` | Three different rules for one stated number |
| 28 | Fit multiplier | size × 1.4 + KV cache, against **available** memory | `bytes/GB + 1`, against **total installed** RAM | `catalog/huggingface.ts:105-108`, `catalog/pick.ts:23-27` | Neither the multiplier nor the KV term exists |
| 29 | Catalog version | 3 | `4` | `manifest.json:3` | `docs/model-fit.md:3` also says 3. Three-way disagreement |
| 30 | Sharp whole-model hash | a final hash over the whole model | the `sha256` field carries **shard 1's** hash | `manifest.json` sharp entry, `store.ts:235` | Per-shard verification is real; the final whole-model check is not |
| 31 | nomic-embed display size | 274 MB | `274,290,560 B`, rendered as **262 MB** | `manifest.json:327` | Decimal in the spec, binary in the UI. Same for Instant (533 vs 508) and Sharp (2.74 GB vs 2.6 GB) |
| 32 | whisper base | 142 MB | `147,951,465 B` = 148 MB decimal | `manifest.json:365` | `whisper.native.ts:8` repeats the spec's 142 |
| 33 | Vision projector | ≈300-600 MB | `204,987,232 B` = 205 MB | `manifest.json:412` | 32% below the stated floor |
| 34 | Desktop models | 7-9B, and 30B on a 24 GB GPU | catalog tops out at 4B | `catalog/manifest.json` | The Power and Studio tiers are deferred; §4.2's whole desktop argument rests on models that do not exist |
| 35 | Shard downloads | parts in parallel | strictly sequential | `httpsDelivery.ts:59-70` | Three model lanes run in parallel (`lanes.ts:19`); shards within a model do not |
| 36 | Retry backoff after a drop | 2 / 4 / 8 → 60 s | `backoffMs` exists, is unit-tested, and is **never called** | `catalog/resume.ts:62` | There is no automatic retry after a disconnect |
| 37 | Unused-model sweep | 60 days | no constant exists | `vault/record.ts:13` writes `lastLoadedAt` and nothing reads it | |
| 38 | R2 catalog cost | 60 GB ≈ $1/month | 8 objects, 7.15 GB ≈ $0.11/month | `docs/ops/cdn-r2.md:120-123` | The spec sized a catalog five times larger than the one that ships |
| 39 | Release checklist | 40 items | 57 tests | `docs/qa/release-checklist.md:1` | §5.9 points at a document that outgrew the number |
| 40 | Launch languages | 6 (D13) | 8 | `packages/i18n/src/index.ts:16` | D13 was never amended; key count is 1,027, not the stated ~1,000 |
| 41 | Background grace | §5.8 and §6.5 say 15 s; §8.2 says 15-30 s | 15 s | `Chat.tsx:114` | The spec disagrees with itself |
| 42 | Device-policy tests | README says 41 | 56 | `packages/core/test/device-*.test.ts` | |

## Places where the spec contradicts itself

These are not code defects. Each needs one decision, and until it is made no implementation can be judged conformant.

1. **Screenshot blocking: Pro or Free.** Two §7 rows disagree with each other about which tier owns screenshot protection.
2. **XLSX: Pro or Work.** The feature matrix assigns it to both.
3. **iOS Data Protection class.** §10 case 47 asks for `completeUntilFirstUserAuthentication`; §5.3 and the shipped code use `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, which is stricter but makes any work under a locked device impossible — including the background download §5.4 promises.
4. **iOS-26 Apple-hosted asset packs.** Promised in §5.4, §11.1 and `privacy-policy.md:38`; cancelled in §14 and never built. `catalog/types.ts:14` still carries the `apple-asset-pack` variant with no consumers, and a real iPhone was observed pulling 1.2 GB from `models.inbornapp.com`.
5. **Body column: 680px or 65–72 characters.** Mutually exclusive at 16px Plex Sans.
6. **Send button: 44pt (§9.4) or 36px (§9.6).**
7. **Model size next to answers.** §8.2 says friendly name only, no size; §10.5 case 38 wants the size shown so users calibrate expectations. `lib/models.ts:3` cites §8.2 and drops it.
8. **"No bounce on security states" (§9.9) vs "bounce allowed on the first seal close" (§9.4).** The seal close *is* the security state.
9. **AI Act timing.** §11.3 presents 2.12.2026 as a cushion; `docs/legal/ai-act-notes.md:24` explicitly corrects it — "Art. 50(1) and Art. 50(2) must be satisfied from the first EU release". The note is the authority and the spec HTML was never updated.
10. **Technical numbers on the vault cartridge.** §8.4 says numbers belong only in Details; the section's own wireframe at `08-screens.html:176-177` draws params, bytes, quantisation and tok/s on the cartridge. The code follows the wireframe.
11. **"Verify after download" as a visible indicator (§8.4) vs verification being unconditional.** The behaviour is right; the promised string does not exist.
12. **Screenshot blocking and the lock-screen quick wipe: Pro (§5.7) or Free (§7).** The code ships them Free and `packages/core/test/licence-entitlement.test.ts:123` asserts they are never gated. Here the spec is the error, and it should be corrected before anyone builds the gate.
13. **Apple Foundation Models' phase.** §6.1 sells it as a shipping built-in tier, §4.5 lists the adapter in P1, and §4.1 and §14.5 place it in P4. The spec cannot decide.
14. **Web chat storage: OPFS (§5.3 table) or in-memory / IndexedDB (§5.3 prose).** The code ships IndexedDB, unencrypted, and discloses it.
15. **Models excluded from backup (§5.3) vs chats included in the backup (§10 case 42)** on a build where `allowBackup="false"` means neither is.
16. **Kokoro: desktop-only (§5.6), platform-free (§7.4), or a phone voice picker (§8.5 S44).** Three placements for a component that does not ship.
17. **The 200+ page progressive-indexing story (§5.5) vs the 20-page Free cap (§7.3).** A free user never reaches the scenario §5.5 describes.
18. **"Without a citation the model says it found nothing" (§5.5)** is stated unconditionally, but the behaviour only exists in strict mode, which ships **off**.
19. **"(OCR if scanned)" as an automatic pipeline step (§5.5)** vs the shipped "Run OCR on this phone?" prompt.
20. **§6.1's own headline example** says the line reads `CLOSEST: FAST` and then, one clause later, `CLOSEST: SHARP`. The device shows FAST.
21. **One status line at a time (§6.5)** vs `Banners.tsx:25-56`, where several rows stack.
22. **`release-checklist.md:213` defines the permission pass as "no ACCESS_NETWORK_STATE"**, while the shipping gate allows it (`check-android-permissions.sh:15`) and every AAB declares it. A QA document that cannot be satisfied by the build it gates.

## Claims the product ships that the code does not support

Ranked by how badly each would land in front of a reviewer, a regulator or a user.

1. **The family-safe filter does not exist.** Asserted in four shipped places: `docs/legal/privacy-policy.md:87`, `docs/legal/terms.md:50`, `docs/legal/app-privacy-details.md:161` and `:193` — the last being our literal answer to Apple Guideline 1.2 and to Play's AI-content policy. `grep familySafe|classifier|shieldgemma` over the source returns nothing. `app-privacy-details.md:98` also answers Apple's parental-controls question "Yes: content filter on by default". This is a false statement in a published privacy policy and a false declaration to two app reviews.
2. **The verifiable-client claim is false in four shipped places.** There is no `LICENSE` file in the repo; the Proof screen's "Source code" URL returns HTTP 404 because the repo is private; the app shows a git commit rather than a published bundle hash; no pen-test report exists. The claim appears in `docs/legal/terms.md:14`, `docs/legal/privacy-policy.md:91`, `packages/core/src/work/statement.ts:75` and `screens/Proof/Proof.tsx:82-85`.
3. **The privacy policy describes a delivery path the app does not use.** `privacy-policy.md:38` tells users that on iOS 26 models arrive as Apple-hosted Background Assets and "your App Privacy Report will show no domains". `docs/qa/cdn-iphone-2026-09-22.md` documents an iOS 26.6.1 iPhone pulling 1.2 GB from `models.inbornapp.com`. The app's central claim is network honesty, and this sentence contradicts it in the reviewer's own tooling.
4. **Three privacy-policy claims the code does not implement**: Secure Enclave key storage, iOS Data Protection (`NSFileProtectionComplete` is absent and the entitlements file is an empty `<dict/>`), and "imported documents are stored in an encrypted database" (the copied file is plaintext).
5. **A security control in Settings that does nothing.** The Off/60 s clipboard-expiry segmented control at `Settings.tsx:140-148` writes `prefs.clipboardExpirySec` (`prefsTypes.ts:28,47`) and `lib/clipboard.ts:5-11` ignores it. A shipped, translated promise that the clipboard clears, which it never does.
6. **"Pro is enabled for Apple Family Sharing"** — stated as fact in `terms.md:26` and repeated to reviewers in `docs/store/listing.en.json:56`. It is off on all four ASC products, and the app itself tells the user so on the real iPhone.
7. **"Conversations are included in your iCloud or Google device backup"** — `privacy-policy.md:72`. On Android `allowBackup="false"`, so they reach no Google backup. `app-privacy-details.md:137` states the opposite of the policy, correctly. A user relying on §6 of the policy will lose their chats.
8. **"Activating a licence key sends the key to Paddle's licensing endpoint once"** — `privacy-policy.md:45`. No such call exists; verification is pure offline Ed25519. Harmless to users, but it is the one place the no-network story is broken, and it is broken by a document rather than by code.
9. **"Report reasons include 'block persona'"** — `app-privacy-details.md:193`. Blocking is Apple 1.2's third pillar and is not implemented in any form.
10. **Two disabled "Pro" rows advertise features on the 1.0 cut list** — `.sealed` backup and device-to-device transfer at `Settings/Storage.tsx:57-58`, one of them labelled "Export all (encrypted)" while nothing encrypts.
11. **`docs/qa/edge-cases-matrix.md` is materially stale** — 16 rows are factually wrong (rows 1, 5, 6, 8, 11, 15, 21, 37, 41, 42, 45, 57, 58, 61, 67, 69), 43 are blank, and four test mappings point at unrelated tests (row 23 → the background test, row 32 → the thermal test, row 34 → a tool-call test for a feature 1.0 does not ship, row 44 → a restore test). F43, the newest open defect on the §10.2 path, appears nowhere in it.

## Never observed on a real device or browser

Screens, states and whole subsystems that exist in code and have no device or browser evidence in any QA run.

- **The entire desktop application.** `docs/qa/desktop-layout-2026-09-22.md` ran headless Chromium against the web build, not the Tauri binary, and records that the window came up **blank** at 1120×720. Tray, menus, drag-and-drop, model import, licence-key activation and the Work-first paywall order are all unverified at runtime.
- **S21 New chat sheet** — not one row in any QA document.
- **S32 Downloads** — the screen does not exist.
- **S13 Report output** and **S14 Safety card** — simulator and emulator only.
- **S53 biometric unlock** — biometrics were never enrolled on any device, simulator or emulator in any run.
- **The seal close animation** (420 ms close, 600 ms bloom, haptic) — never observed anywhere, real or simulated.
- **S03 Airplane test on iOS** — proven twice on Android hardware; every iPhone session takes `airplane-skip`, and the web smoke skips it too, so `"This tab sent 0 B to us"` has never rendered in a recorded run.
- **Every thermal and battery banner** — rendered only through the `__DEV__` preview, and once from a false critical reading. OxygenOS pins Thermal Status 6, so no genuine thermal event has ever occurred in QA.
- **Reduced motion, 200% text scale, the M3 FAB shape morph, Liquid Glass on sheets** — the design sign-off that covers them cites screenshots that live in session scratch and were never committed.
- **The Chrome Prompt API switch** — the headless Chrome used for every web run has no Prompt API, so the switch has never appeared on screen.
- **S20's stateful half** — pinned, archived, swipe, undo, search-with-a-query and the 1,000-chat path have no device coverage at all.
- **The Work tier on hardware** — only the Work SKU was ever exercised; no real-device run covers vaults, packs, redaction or signed records.

## Ranked gap list

Severity scale: **blocks-1.0** (the app cannot be submitted, or submitting it would be dishonest) · **should-fix-before-submission** (submittable, but the first reviewer or user who looks will find it) · **1.0.1** (real, not urgent) · **deferred** (a decision already recorded in README or the spec).

Fix size is an estimate of engineering effort: XS under an hour, S half a day, M a day or two, L a week or more.

### blocks-1.0

| # | Gap | Spec line | What exists | Fix |
|---|---|---|---|---|
| 1 | **The family-safe filter is declared to two app stores and to users, and does not exist.** | §11.1 Guideline 1.2 "סינון", §11.2 AI-content (a)(b), §11.5 item 8 "family‑safe כברירת מחדל" | No classifier, no mode, no setting. Four shipped documents assert it, including our literal Guideline 1.2 answer and Apple's parental-controls question answered "Yes: content filter on by default" | Either build an Apache-2.0 on-device classifier plus a visible setting (**L**), or delete the claim from `privacy-policy.md:87`, `terms.md:50`, `app-privacy-details.md:161,193,98` and re-answer both store questionnaires (**S**). Whichever is chosen, it must be one answer |
| 2 | **Store-console filings that block the first upload.** | §11.5 items 1 and 4 | Every answer is written and reasoned in `docs/legal/app-privacy-details.md`. **Nothing is filed.** IARC is the hard blocker — Play's July-2026 rule bars unrated apps. Apple's privacy label, age rating, review notes, Play Data Safety, target audience and both privacy URLs are all open, and the privacy page is not deployed | Console work, plus deploying the page and filling the 8 legal placeholders. **M** (Moshe only) |
| 3 | **The verifiable-client claim is false in four shipped places.** | §5.9 / §11.3 Work positioning | No `LICENSE` file in the repo (verified); the Proof screen's source URL 404s because the repo is private; the app shows a git commit, not a published bundle hash; no pen-test report exists | Publish the repo with a licence and wire a real bundle hash, or soften the four strings (`terms.md:14`, `privacy-policy.md:91`, `work/statement.ts:75`, `Proof/Proof.tsx:82-85`). **S** for the strings, **L** for the real thing |
| 4 | **The privacy policy describes a model-delivery path the app does not use.** | §11.3, §5.4 | `privacy-policy.md:38` promises Apple-hosted Background Assets on iOS 26 and "no domains in your App Privacy Report". A real iPhone was recorded pulling 1.2 GB from `models.inbornapp.com` | Rewrite the paragraph to describe the CDN honestly. **XS**. This is the app's central claim, contradicted in the reviewer's own tooling |
| 5 | **A shipped Settings security control that does nothing.** | §7.5 clipboard expiry | `Settings.tsx:140-148` offers Off / 60 s and writes `prefs.clipboardExpirySec`; `lib/clipboard.ts` ignores it and its own comment defers expiry to M6 | Implement the timer, or remove the control. **S** |
| 6 | **The zero-INTERNET CI gate is disabled.** | §5.1 "שער CI" | `.github/workflows/ci.yml:16-18` `android-permission-gate: if: false` with a TODO. The script works and has passed on real builds; the gate is a human running it per release | Produce an APK in CI and flip the flag, or make the release script refuse to upload without it. **S**. The whole privacy claim rests on one permission |
| 7 | **No database integrity check and no Repair path; corruption is answered by deletion.** | §10.3 case 22 | `sqliteRepository.ts:213-217` catches "not a database" and calls `deleteDatabaseAsync` — silent, total, irreversible loss of every chat on an app whose promise is that chats live only here. T40 never ran | Add `quick_check` on open, a Repair path and an export-before-wipe prompt. **M** |
| 8 | **Incognito does not keep an attached document in RAM.** | §5.7 "מסמך שצורף מאונדקס ב-RAM בלבד" | Verified: `documents/db.native.ts:45-47` always returns the SQLCipher store and `ragStoreKind()` hard-returns `"sqlcipher"`; `library.ts:236,334` write through it unconditionally. The document row, the copied file and the vectors all survive the session. `chat/store.ts:123 endSession()` has zero callers, so "cleared on close" holds only because the process exits | Route incognito imports to `MemoryEmbeddingStore` and call `endSession()`. **S**. This is a privacy promise §7.5 sells as a differentiator, and chat rows are handled correctly, which makes the document path the one hole |
| 9 | **Family Sharing is promised in three places and off in App Store Connect.** | §12.1, §12.4 | Code is complete and correct; the switch is a one-way door on Moshe's decision list; the real iPhone displays "Family Sharing is not enabled for this product yet." | Decide and flip, or remove the promise from `terms.md:26` and `listing.en.json:56`. **XS** plus a decision |

### should-fix-before-submission

| # | Gap | Spec line | What exists | Fix |
|---|---|---|---|---|
| 9 | **The desktop binary has never been launched.** | §8.9, §5.9 | CI builds macOS arm64 and Windows x64; `verify-macos.sh` exists; no launch, no answer, no notarized artifact. F41 (a blank window) was found by reading code, and the layout proof ran headless Chromium against the web build. README still lists the runtime proof as open. Also **no Windows ARM64 job** (`.github/workflows/desktop.yml:70-88`) against §5.9's promise | Launch it once on each OS and record a chat turn, a tray screenshot and a licence-key activation. **M** |
| 10 | **§8.8 row 4c: the first-automatic-switch explainer sheet was never built.** | §8.8 row 4 | `policy.ts:167-170` computes `rec.explain`; `guard.ts:284-287` latches it; `guard.ts:132 ackExplain()` exists to dismiss it; four `device.sheet.*` keys ship in all 8 locales. **Verified: no component reads any of it and `ackExplain` has no callers.** The wider `device.*` family is ~31 keys × 8 locales of dead translation | Build the sheet, or delete the machinery and the strings. **S**. This is F42 with a bigger paper trail than F42 had |
| 11 | **Wi-Fi-only downloads are inert on iOS and desktop.** | §8.4, §10.1 case 4 | Two independent toggles write to two unread stores; **`shouldWait()` has zero production call sites, verified**. Android is correct only because Play enforces its own policy. A user on cellular with the switch on still pulls 1.2 GB | Call `shouldWait` from the HTTPS downloader and unify the two prefs. **S** |
| 12 | **No inference queue.** | §10.3 case 23 | `adapters/llamaRn.ts:15,98` overwrites `inflight` per call, so two `generate` calls reach the same context. Only per-surface `busy` flags stand between chat, the documents ask and quick actions. A plausible native crash with no test anywhere | Serialize at the engine with a real queue. **M** |
| 13 | **The AI Act export stamp is missing from the Work signed record.** | §11.3 Art. 50(2); `ai-act-notes.md:24` calls it a launch requirement of M8 | Markdown, JSON and text exports all carry the marking. `work/signedRecord.ts:23-60` has no `aiGenerated` field, and it is the primary artifact of that export path. The promised unit test does not exist | Add the fields and the test. **XS**, but note it changes `contentHash` |
| 14 | **`docs/qa/edge-cases-matrix.md` is materially stale and would mislead the next QA run.** | §10 preamble "every row here is a test" | 16 rows factually wrong, 43 blank, four test mappings pointing at unrelated tests, and F43 absent | Re-run the matrix against this audit. **S** |
| 15 | **Android has no foreground service and iOS has no `beginBackgroundTask`.** | §10.3 case 21 | The 15 s grace is a JS timer iOS may suspend; `grep FOREGROUND_SERVICE` and `beginBackgroundTask` both return nothing. `release-checklist.md:101` states a pass bar the build cannot meet | Either implement both or restate the promise and the checklist. **M** |
| 16 | **Two Android-only edge cases ship as broken promises.** | §10.6 case 42, §5.3 | `allowBackup="false"` is correct and proven, yet `Storage.tsx:54` tells Android users their chats are in the device backup, and `privacy-policy.md:72` repeats it | Fix the two strings. **XS** |
| 17 | **The desktop window can shrink below the specified minimum.** | §9.7 "1040×720" | `tauri.conf.json` sets 720×480 while `lib/layout.ts:7` defines `DESKTOP_MIN = 1040` and quotes the spec | Change two numbers. **XS** |
| 18 | **iOS ships a 16.4 deployment target against a declared iOS 17 floor.** | §6.3 | `Podfile:27` and four `IPHONEOS_DEPLOYMENT_TARGET` entries say 16.4; `release-checklist.md:246` and `privacy-policy.md:39` say 17 | Pin the target in `app.config.ts` or change the declared floor. **XS** |
| 19 | **The hands-free `/voice` route is ungated on a release build.** | §7 voice tier | `src/app/voice.tsx:5-7` renders with no paywall while the chat entry point is gated | Add the gate. **XS** |
| 20 | **Model licence obligations are declared but not discharged.** | §11.4, §11.5 item 5 | The licences screen shows name, attribution and a link; **no LICENSE or NOTICE file for any model is bundled**. Apache-2.0 §4(d) wants the NOTICE to travel with the distribution. The HF import shows a licence and never asks for a tap | Bundle the texts, add a "View licence" control and an acceptance tap. **S** |
| 21 | **Two disabled Pro rows advertise declared 1.0 cuts.** | §8.6 S51 | `Settings/Storage.tsx:57-58` ship `.sealed` backup and device-to-device transfer as greyed rows, one labelled "Export all (encrypted)" while nothing encrypts | Hide them. **XS** |
| 22 | **Catalog and spec disagree on vision.** | §6.1 "ראייה: כן" | `manifest.json` sets `vision: false` on Fast and Sharp; only Instant has a matching projector (F36) | Fix the spec table or ship the projectors. **S** |
| 23 | **No Hebrew or Arabic locale ships and the RTL switch is `__DEV__`-only**, so §5.10's "checked in Hebrew and Arabic in every PR" is unexecutable. `qa-run-2026-09-06.md:76` T24 records exactly that | §5.10 | 8 Latin/CJK locales at full key parity; `debug.force_rtl` behind `__DEV__` | Either ship one RTL locale or restate the rule as a pseudo-RTL check. **M** |
| 24 | **The clearance is done and no trademark is filed.** | §11.6 "הגשה לפני כל פרסום" | Two clean TMview runs and a costed filing plan. **Zero applications, no attorney engagement, no first-use record, and the monthly watch plist was never installed** | File before the first public listing. **S** plus roughly $2,000 |
| 25 | **Nine named technologies are absent and on no cut list.** | §5.5, §5.6, §4.5 | Silero VAD, Kokoro-82M, Apple SpeechAnalyzer, Core ML, sqlite-vec, mammoth, ML Kit OCR, the Qwen3 and MiniLM embedders, desktop OCR. Several substitutions are better engineering than the spec's choice, notably Tesseract for Hebrew and brute-force cosine at this scale | Correct the spec or add them to the cut list. **S**, documentation only. Today the spec sells nine components the product does not contain |
| 26 | **The spec, not the code, is wrong about two Pro labels.** | §5.7 screenshot blocking and lock-screen quick wipe | `licence-entitlement.test.ts:123` asserts both are absent from `FEATURES`, and §7 agrees they are Free | Fix §5.7 before someone builds a gate that a passing test forbids. **XS** |
| 27 | **`openiap-google` declares INTERNET and is stripped only by `tools:node="remove"`.** | §11.2 | The end state is right and proven; the spec's stated reason ("the Billing library's manifest has no INTERNET") is wrong about the wrapper we actually ship | Note it in the spec and keep the permission gate in CI (see gap 6). **XS** |

### 1.0.1

| # | Gap | Fix |
|---|---|---|
| 26 | S32 Downloads: no screen, no speed, no ETA, no visible "Verify after download", no mirror, no completion notification, and the restored queue comes back paused with its ordering lost | **M** |
| 27 | S41 Personas: no allowed-tools, no reset, no import or export, a default-model field with no picker, a temperature standing in for response style, and a Unicode glyph where the spec asks for SVG | **M** |
| 28 | S52 Settings: font picker, default-persona row, thinking-visible row, Enter vs Shift+Enter, keep-screen-awake, dyslexia font, announce-per-sentence, Android SAF picker, and the user-facing Advanced group with an acceleration tag and override | **L** |
| 29 | §8.9 desktop settings: model location, launch at login, backend picker, VRAM offload, local server. The backend is a compile-time feature flag, one binary per backend | **L** |
| 30 | Desktop file drag-and-drop: `shell.rs:184-196` emits `inborn:documents-dropped`, `tauri.ts:497` relays it, and **no listener consumes it, verified**. Folders are not handled at all | **S** |
| 31 | §8.8 row 7: the "Checking your models" screen after an engine change. The string exists in no locale and there is no engine-compatibility concept | **M** |
| 32 | §8.8 row 5a: a jetsam kill loses the partial answer, because the assistant row is written only after the stream ends | **S** |
| 33 | Crisis phrases are missing for Korean and Traditional Chinese, two of the eight shipped UI languages | **XS** |
| 34 | S40 documents: no projects, no library search, no thermal stop during indexing, no XLSX sheet selection, no vertical CJK | **M** |
| 35 | S50 Proof: no sha256 build hash and no "matches published" comparison; the exit meter is not in the chat and the airplane test does not place it | **S** |
| 36 | The `easing.out` curve and three of the four motion durations are exported and never imported; the streaming caret does not blink; the vault has no mesh; the cartridge has no chip glyph, provider or licence tag | **S** |
| 37 | Web: no 2px amber focus ring and no `@media (hover:hover)` gate in the app build (both exist only in the marketing site); the WebGPU probe is read into `gate.webgpu` and consumed by nothing; no size choice on the first download | **S** |
| 38 | Paddle licence keys are not device-bound by signature, the 3-device limit is enforced nowhere, and deactivation does not exist (`grep -ri deactivat` = 0 across the whole tree) | **M** |
| 39 | No offer codes on any platform, and the spec's 20–30% cross-store discount exists as a sentence with no artifact | **S** |
| 40 | 23 of 39 gate keys in `licence/gates.ts` have zero call sites. Roughly half map to declared cuts; the rest still gate features the matrix sells, including four Work keys (`professionPacks`, `recordsDictation`, `largeModels`, `teamLicence`) | **S** |
| 41 | No golden screenshots anywhere in the repo, so there is no visual-regression baseline; the crash-report path is a `mailto:` body rather than a file | **M** |
| 42 | No `eas.json`: the spec's EAS build path was silently replaced by local gradle and xcodebuild, and the substitution is recorded nowhere | **XS** |
| 43 | No string-extraction step and no translation pipeline; `pseudo.mjs` is a manual script with no workflow and no assertion | **S** |

### deferred

Apple FM adapter and its chip and fallback UX · side-by-side model compare · `.sealed` backup and device-to-device transfer · keyboard extension · Shortcuts, widgets and Live Activities · LAN, multi-model, speculative decoding and GPU/context tuning · OCR in the browser tier · NativeWind styling · Whisper small for Hebrew · Microsoft Store and Mac App Store purchase hooks · UNSEALED mode (the spec itself marks it future) · Gemma terms and "Built with Llama" (neither family ships) · Power and Studio tiers · Windows desktop parity beyond x64 · Hebrew and Arabic locales.

Each is covered by an explicit sentence in `README.md:596-599` ("Intentionally not built for 1.0"), `README.md:466` ("Declared cuts for 1.0"), the §14 status table, or the spec's own "future" marking. **Two things commonly assumed to be deferred are not**: Gemini Nano on Android has no deferring sentence anywhere and `docs/legal/licenses.md:32` still lists it as planned, and SD-card / SAF storage (edge case 7) is absent from every cut list.
