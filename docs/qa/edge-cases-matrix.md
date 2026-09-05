# Edge-case matrix: spec §10 → tests → implementation status

Every numbered case in spec §10 (70 rows) mapped to the tests in `release-checklist.md`. The **Status** column is empty on purpose; the lead fills it per milestone (values: `todo`, `partial`, `done`, `n/a-<platform>`), with the PR or commit in **Evidence**.

| # | Case (short) | Spec | Test id(s) | Status | Evidence |
|---|---|---|---|---|---|
| 1 | First launch without a model: Instant bundled / fast-follow | §10.1 | T01, T02, T03 | | |
| 2 | Download interrupted (close, disconnect, lock) | §10.1 | T05 | | |
| 3 | 429 / Hugging Face down / corporate firewall / China | §10.1 | T04 (mirror list), T08 (manual import) | | |
| 4 | Expensive cellular / Low Data Mode | §10.1 | T04 (size before download, Wi-Fi-only default) | | |
| 5 | Wrong or huge model size | §10.1 | T04, T07 | | |
| 6 | Storage full (before/during/after, DB write, OS update) | §10.1 | T07 | | |
| 7 | SD card / external storage (Android) | §10.1 | T08 (SAF import location) | | |
| 8 | Corrupt / truncated / wrong-format file | §10.1 | T08 | | |
| 9 | Catalogue model the engine cannot run | §10.1 | T40 (minEngineVersion) | | |
| 10 | Gated / licensed models (HF token, Gemma, Llama) | §10.1 | T04 (licence acceptance tap), T37 (Licences screen) | | |
| 11 | Model does not fit RAM | §10.2 | T36 | | |
| 12 | jetsam mid-generation / large model | §10.2 | T11 | | |
| 13 | Weak Android (4–6 GB, no dotprod) | §10.2 | T36 | | |
| 14 | Old iPhone (3–4 GB) and OS floor | §10.2 | T36 | | |
| 15 | 16 KB pages | §10.2 | T33 | | |
| 16 | GPU/NPU backend failure | §10.2 | T11 (acceleration tag), T33 | | |
| 17 | Rooted / jailbroken device | §10.2 | T23 (no Play Integrity dependence) | | |
| 18 | Heat and sustained load | §10.2 | T11 | | |
| 19 | Low battery / Low Power / Battery Saver | §10.2 | T11 | | |
| 20 | Charging during generation | §10.2 | T11 | | |
| 21 | Background mid-generation / lock / call | §10.3 | T12, T13 | | |
| 22 | Killed during DB write / migration | §10.3 | T07, T40 | | |
| 23 | Concurrent generations (two chats, Shortcut, widget) | §10.3 | T12 (queue), T14 (Shortcut under lock) | | |
| 24 | Model switch / delete while in use; download ends mid-chat | §10.3 | T04, T06 | | |
| 25 | Shortcut while locked or in incognito | §10.3 | T14, T16 | | |
| 26 | OS/app update changes engine or format | §10.3 | T40 | | |
| 27 | Apple FM changes with OS, modelNotReady, guardrail refusals, 4,096 window, locale | §10.3 | T09, T10 | | |
| 28 | Apple Intelligence off / ineligible / China / EU limits | §10.3 | T10 | | |
| 29 | Gemini Nano / AICore unavailable or downloading | §10.3 | (Phase 4) no test yet; add when integrated | | |
| 30 | Huge / scanned / protected PDF, DOCX tracked changes, XLSX, images in docs | §10.4 | T17, T18, T19 | | |
| 31 | Non-English, mixed scripts, RTL PDF, vertical CJK | §10.4 | T18 | | |
| 32 | Conversation beyond context window | §10.4 | T11 (token meter, sliding window, summary) | | |
| 33 | Huge paste / clipboard images / 100 MB via share sheet | §10.4 | T19 | | |
| 34 | Prompt injection through documents | §10.4 | T17 (tool calls need confirmation; documents are data) | | |
| 35 | Images: HEIC/HDR/Live, huge, EXIF, sensitive screenshots, camera denied | §10.4 | T19 (extend when image input ships in M5) | | |
| 36 | Harmful / hateful / sexual / dangerous output | §10.5 | T37, T38 | | |
| 37 | Medical, legal, financial, mental-health requests; crisis language | §10.5 | T38 | | |
| 38 | Hallucination and over-confidence ("can be wrong") | §10.5 | T37 | | |
| 39 | Ignores system prompt, loops, does not stop | §10.5 | T38 | | |
| 40 | Wrong language or script in the answer | §10.5 | T38 | | |
| 41 | "Uncensored" expectations vs store policy | §10.5 | T37 (copy check), store listing review | | |
| 42 | iCloud/Google backup of models and chats | §10.6 | T39 | | |
| 43 | New phone / restore / transfer | §10.6 | T39, T21 | | |
| 44 | Same Apple ID on several devices, no cloud sync | §10.6 | T21 (copy states "no cloud sync") | | |
| 45 | Shared device / family member finds the app | §10.6 | T14, T16 | | |
| 46 | User deletes the app | §10.6 | T15 (storage warning + export offer) | | |
| 47 | Data Protection: locked device while background download finishes | §10.6 | T05 (lock case), T39 | | |
| 48 | Offline Pro verification without a server | §10.7 | T20, T23 | | |
| 49 | Restore, Family Sharing, refunds, cancellation | §10.7 | T21, T22 | | |
| 50 | Price changes, regions, offer codes, Work upgrade | §10.7 | T20 (Work upgrade SKU visible only to Pro owners) | | |
| 51 | Piracy / cracked IAP on jailbreak | §10.7 | T23 (local JWS check, no Play Integrity) | | |
| 52 | Interrupted purchase (Ask to Buy, pending, disconnect) | §10.7 | T20 | | |
| 53 | VoiceOver/TalkBack during streaming | §10.8 | T26 | | |
| 54 | Dynamic Type with code/tables; RTL with LTR code; screen reader on Markdown | §10.8 | T24, T25, T26 | | |
| 55 | Hardware keyboard Enter vs Shift+Enter | §10.8 | T28 | | |
| 56 | Very long single message; scroll jumps | §10.8 | T26 (1,000-token answer), T11 | | |
| 57 | Screenshots and recording of sensitive chats | §10.9 | T14 (switcher), plus FLAG_SECURE / isCaptured check in T14 | | |
| 58 | Clipboard leaks | §10.9 | T37 (copy with expiry, localOnly) | | |
| 59 | Crash logs containing prompt text | §10.9 | T11 (inspect any crash log for user content) | | |
| 60 | Third-party SDK adding network calls | §10.9 | T29, T30, T31, T32 | | |
| 61 | Model supply-chain integrity (malicious GGUF) | §10.9 | T08, T40 | | |
| 62 | Local-network features on hostile Wi-Fi | §10.9 | (Pro LAN feature, later) no test yet; add with the feature | | |
| 63 | Sideload / alternative stores (EU) and notarization | §10.9 | T30 (same claims), age-rating declarations in `app-privacy-details.md` | | |
| 64 | Children and age rating | §10.10 | store questionnaires (`docs/legal/app-privacy-details.md` §3, §4.4), T37 | | |
| 65 | Regulated professionals (Work) | §10.10 | T37 (verify banner), architecture statement PDF | | |
| 66 | Clock / time-zone / DST changes for auto-delete and reminders | §10.10 | T40 (monotonic timers; add explicit case: change device time during a 24 h auto-delete) | | |
| 67 | App Review testers without network or model | §10.10 | T02, review notes in `app-privacy-details.md` §6 | | |
| 68 | First update that changes the manifest signature | §10.10 | T40 | | |
| 69 | Expectation of cloud speed | §10.10 | T01/T02 (honest speed estimate in onboarding) | | |
| 70 | Widgets / Live Activities showing partial answers on the lock screen | §10.10 | T14 (no previews while locked; Live Activity shows progress only) | | |

Gaps to close as features land: #29 (Gemini Nano), #35 image input, #62 LAN, #66 explicit clock-change case. Each needs a test id added to `release-checklist.md` in the same PR that ships the feature.
