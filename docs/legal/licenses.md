# Inborn third-party licences

Spec basis: §11.4 (model and component licences), §6.1–§6.2 (catalogue), §5.5–§5.6 (documents and voice). Inventory taken 5 September 2026 in the `legal-docs` worktree with `pnpm licenses list --json` (534 packages, 447 MIT) and `--prod` (438 packages), plus a manual read of every native and model licence. Machine-readable twin: `NOTICE.json` (what the in-app Licences screen renders).

Rule from the spec: anything we bundle or serve from our CDN makes us a distributor, so every such component appears on the in-app Licences screen with name, licence, link and obligations. A model the user fetches from Hugging Face is shown its licence and must tap to accept; that acceptance is theirs, and the screen still lists it once installed.

## 1. Conclusion

**Nothing in the shipped tree conflicts with a closed-source Pro app.** Every runtime component is MIT, Apache-2.0, BSD-2/3, ISC, 0BSD, OFL-1.1 or public domain. Obligations are attribution only (copyright notice + licence text; Apache-2.0 additionally requires passing along NOTICE files and marking modified files, and we modify none). Four items need care and are called out in §5: copyleft components that must never be linked (espeak-ng GPL-3), a dual-licensed dev dependency where we elect BSD (node-forge), MPL-2.0 build tools that never ship, and the model families the spec keeps out of the default catalogue (Gemma terms, Llama Community License, LFM, MRL).

## 2. Models (shipped or served from `models.{{DOMAIN}}`)

| Tier / role | Model | Licence | Rights holder / attribution line | Obligations as distributor | Status |
|---|---|---|---|---|---|
| T0 Instant (bundled) | Qwen3.5-0.8B (GGUF Q4_K_M) | Apache-2.0 | Alibaba Cloud / Qwen team. https://huggingface.co/Qwen/Qwen3.5-0.8B | Include LICENSE + NOTICE text; attribution; no use restrictions passed on | shipped |
| T1 Fast | Qwen3.5-2B | Apache-2.0 | https://huggingface.co/Qwen/Qwen3.5-2B | same | catalogue |
| T2 Sharp | Qwen3.5-4B | Apache-2.0 | https://huggingface.co/Qwen/Qwen3.5-4B | same | catalogue |
| T2 alt | Phi-4-mini-instruct 3.8B | MIT | Microsoft. https://huggingface.co/microsoft/Phi-4-mini-instruct/blob/main/LICENSE | Copyright notice on the Licences screen | catalogue |
| T2 alt | SmolLM3-3B | Apache-2.0 | Hugging Face TB. https://huggingface.co/HuggingFaceTB/SmolLM3-3B | LICENSE + attribution | catalogue |
| T3 Power | Qwen3.5-9B | Apache-2.0 | https://huggingface.co/Qwen/Qwen3.5-9B/blob/main/LICENSE | same as Qwen above | catalogue |
| T3 alt | Ministral 3 8B | Apache-2.0 per spec §6.1 | Mistral AI | **Verify at the exact HF repo before adding**: older Ministral 8B (2410) was MRL (non-commercial), which is out of the catalogue by rule | planned |
| T4 Studio | Muse Glimmer 30B | Apache-2.0 per spec §6.1 | Meta | **Verify licence text at the source before adding**; if it is a Llama-style community licence, "Built with …" and AUP obligations apply | planned |
| Vision | Qwen3.5 mmproj files | Apache-2.0 | same repo as the base model | same | catalogue |
| Embeddings | nomic-embed-text-v1.5 (GGUF) | Apache-2.0 | Nomic AI. https://huggingface.co/nomic-ai/nomic-embed-text-v1.5 | LICENSE + attribution | catalogue |
| Embeddings (Pro) | Qwen3-Embedding-0.6B | Apache-2.0 | https://huggingface.co/Qwen/Qwen3-Embedding-0.6B | same | catalogue |
| Embeddings (low-end) | all-MiniLM-L6-v2 | Apache-2.0 | sentence-transformers / UKPLab | same | catalogue |
| Speech-to-text | whisper base / small (ggml) | MIT | OpenAI (weights and code). https://github.com/openai/whisper/blob/main/LICENSE | Copyright notice | catalogue |
| Speech-to-text (alt) | Parakeet (Core ML) | CC-BY-4.0 (NVIDIA) | NVIDIA | Attribution with the CC-BY text; **CC-BY is fine for a closed app** (attribution only) | planned |
| TTS (desktop Pro) | Kokoro-82M (ONNX) | Apache-2.0 | hexgrad | Attribution. **Do not ship espeak-ng (GPL-3) as G2P**; use misaki (MIT) or another permissive G2P | planned |
| VAD | Silero VAD | MIT | Silero team | Copyright notice | planned |
| Platform | Apple Foundation Models | Apple platform terms | Apple | Not redistributed; Acceptable Use Requirements apply (no medical/legal/financial autonomous outputs, no adult content, no dependency loops). Not used in Work medical/legal flows | shipped on iOS 26 |
| Platform | Gemini Nano (AICore) | Google platform terms | Google | Not redistributed; foreground only | planned |

Not in the default catalogue and why (spec §11.4): Gemma ≤3 / 3n / EmbeddingGemma / ShieldGemma (Gemma Terms of Use: use restrictions must be passed on as enforceable terms and a copy delivered; gated on HF); Llama 3.x/4 (Llama Community License: "Built with Llama" notice, derivative naming, AUP); LFM2/LFM2.5 (free below US$10M annual revenue, review at growth); Mistral models under MRL (non-commercial). Gemma 4 is Apache-2.0 and may be offered as an alternative at Sharp/Power (§6.1). Any of these appearing in the catalogue re-opens this document.

## 3. Native and engine components (compiled into the app)

| Component | Version | Licence | Attribution | Notes |
|---|---|---|---|---|
| llama.cpp / ggml | vendored by llama.rn 0.12.9 and wllama 3.6.1 | MIT | Copyright (c) 2023-2026 The ggml authors (Georgi Gerganov) | LICENSE text on the Licences screen |
| llama.rn | 0.12.9 | MIT | Copyright (c) 2023 Jhen-Jie Hong (mybigday). https://github.com/mybigday/llama.rn | No privacy manifest shipped by the pod; see `app-privacy-details.md` |
| wllama (+ wllama-compat) | 3.6.1 | MIT | ngxson. https://github.com/ngxson/wllama | WebAssembly build of llama.cpp served from our origin |
| whisper.cpp (via whisper.rn) | planned | MIT | ggml-org | |
| SQLCipher (via expo-sqlite `useSQLCipher: true`) | bundled in expo-sqlite 57.0.2 | BSD-2-Clause | Copyright (c) 2025, ZETETIC LLC. https://github.com/sqlcipher/sqlcipher/blob/master/LICENSE.md | Notice + disclaimer in docs/Licences screen; "Zetetic" name not used to endorse |
| SQLite | bundled | Public domain | | No obligation |
| sqlite-vec | planned | MIT OR Apache-2.0 | Alex Garcia | choose MIT |
| libsodium | planned (export format) | ISC | Frank Denis | notice |
| React Native | 0.86.3 | MIT | Meta Platforms, Inc. | ships four privacy manifests (see app-privacy-details) |
| Hermes | bundled with RN | MIT | Meta | |
| Expo SDK modules (expo, expo-file-system, expo-sqlite, expo-secure-store, expo-local-authentication, expo-localization, expo-crypto, expo-asset, expo-constants, expo-status-bar) | 57.x | MIT | 650 Industries, Inc. (Expo) | |
| react-native-safe-area-context | 5.7.0 | MIT | Th3rd Wave | |
| react-native-web | 0.21.2 | MIT | Nicolas Gallagher | web only |
| Tauri (crate + CLI) | 2.x | MIT OR Apache-2.0 | Tauri Programme within The Commons Conservancy | desktop; run `cargo license` in `apps/desktop/src-tauri` at each desktop release to list Rust crates (tree not installed in this worktree) |
| Play Asset Delivery (`com.google.android.play:asset-delivery` 2.3.0) and Play Billing 9.x | Android | Android SDK licence (Google) | Google | proprietary but redistributable in apps; the SDK terms already accepted by the developer account |
| ML Kit Text Recognition (bundled model) | planned | Google APIs ToS | Google | on-device bundle; proprietary, allowed in closed apps |
| Fonts: IBM Plex Sans, IBM Plex Mono | | SIL OFL 1.1 | IBM | Attribution; may be embedded; may not be sold on their own |

## 4. JavaScript runtime dependencies (in the bundle)

From `pnpm licenses list --prod --json`. Only the packages that can end up in the JS bundle matter; Expo/Metro CLI transitives (chrome-launcher, xcode, terser, lightningcss, node-forge, caniuse-lite …) are build-time and never ship. Everything shipped is MIT except:

| Package | Licence | Attribution |
|---|---|---|
| intl-messageformat 11.2.14 | BSD-3-Clause | Copyright (c) 2019 FormatJS / OpenNext (Eric Ferraiuolo) |
| i18next 26.4.1, react-i18next 17.0.13, i18next-icu 2.4.4 | MIT | i18next / Locize |
| react 19.2.3, react-dom | MIT | Meta |

Full list with versions is generated into `NOTICE.json` (`components[].scope = "js"`). Regenerate at each release:

```
corepack pnpm licenses list --prod --json > /tmp/lic.json   # then run the NOTICE generator (to be written in scripts/, see §6)
```

## 5. Items that need care

| Item | Licence | Risk for a closed-source Pro app | Action |
|---|---|---|---|
| espeak-ng (Kokoro's default G2P) | GPL-3.0 | Linking it would obligate releasing the app source | Never link; use misaki (MIT) or Supertonic/Kitten per spec §11.4 |
| node-forge 1.4.0 (Expo CLI transitive) | BSD-3-Clause OR GPL-2.0 | None: dual licence, we elect BSD; build-time only | Record the election here; nothing ships |
| lightningcss 1.33.0 | MPL-2.0 | None: file-level copyleft, build tool, not shipped, not modified | none |
| caniuse-lite | CC-BY-4.0 | Build-time data only; not redistributed | none |
| Gemma family, Llama family, LFM, MRL models | see §2 | Use restrictions must be passed on; "Built with Llama" branding; revenue caps | Keep out of the default catalogue; if a user imports one, show the licence and require a tap |
| ShieldGemma for the family-safe classifier | Gemma Terms | Would force a terms-acceptance screen in onboarding | Prefer an Apache-2.0 classifier (spec §11.4 alternative) |
| Apple Foundation Models | Apple AUR | Prohibits medical/legal/financial autonomous outputs and "dependency or spiraling" | Route Work medical/legal personas to GGUF models only; family-safe stays on |
| Parakeet | CC-BY-4.0 | Attribution only; fine | Attribution text in NOTICE when added |

## 6. What the in-app Licences screen shows (S-settings › Licences)

One list, grouped Models / Engine / Libraries / Fonts, each row: name, version, licence (SPDX id), one-line attribution, "View licence" (opens bundled text), and for models the "Restrictions" line (none for Apache/MIT; the passed-through terms for anything else). Source of truth: `docs/legal/NOTICE.json`, copied into the app bundle at build time; the screen must not hard-code any entry. A small script (`scripts/gen-notice.mjs`, to be written by the shell stream) should merge `pnpm licenses list --prod --json` into the `js` scope of `NOTICE.json` so the JS list never drifts.

## 7. Sources

- Qwen3.5 model cards and LICENSE files: https://huggingface.co/Qwen/Qwen3.5-0.8B, https://huggingface.co/Qwen/Qwen3.5-9B/blob/main/LICENSE
- Phi-4-mini-instruct LICENSE (MIT): https://huggingface.co/microsoft/Phi-4-mini-instruct/blob/main/LICENSE
- nomic-embed-text-v1.5 (Apache-2.0): https://huggingface.co/nomic-ai/nomic-embed-text-v1.5
- Whisper (MIT): https://github.com/openai/whisper/blob/main/LICENSE; whisper.cpp (MIT): https://github.com/ggml-org/whisper.cpp
- SQLCipher LICENSE.md (BSD-2-Clause, Zetetic LLC): https://github.com/sqlcipher/sqlcipher/blob/master/LICENSE.md
- llama.rn LICENSE (MIT, Jhen-Jie Hong): node_modules/llama.rn/LICENSE; wllama package.json `license: MIT`
- Apple Foundation Models Acceptable Use Requirements: https://developer.apple.com/apple-intelligence/acceptable-use-requirements-for-the-foundation-models-framework/
