# Private on-device AI chat: cross-platform stack research

Date: 2026-09-02. Scope: can/should the RN + llama.rn mobile app also ship as a Windows (and macOS) desktop app and as a web app, and how much code can be unified across iOS / Android / Windows / macOS / Web. All version numbers, dates and figures below were checked against the sources listed at the end.

## 0. Bottom line

1. Desktop (Windows + macOS): YES, and it is the more valuable second platform. Build it as a Tauri v2 shell around the Expo web export, with llama.cpp running natively in Rust (llama-cpp-2 crate) or as a bundled `llama-server` sidecar. Not React Native for Windows: llama.rn has no Windows/macOS target, Expo does not support RN Windows, and you would be writing and maintaining your own C++ TurboModule on the thinnest ecosystem of the five.
2. Web: YES as a "try it in 30 seconds" tier and landing page, NO as the flagship. WebGPU is now default in Chrome/Edge/Firefox/Safari 26, but iPhone Safari caps a tab under ~500 MB, so the web demo on phones is limited to sub-1B models. The "no data leaves your device" promise is only *auditably* true in the installed apps; on the web it is true per session but the user must trust every page load.
3. Unified codebase: an Expo universal app (SDK 54+/55) with one `LocalLM` adapter interface (shape it after the Vercel AI SDK provider interface) and five thin implementations: llama.rn (iOS/Android), Apple Foundation Models (iOS 26+/macOS 26+), wllama (web, same GGUF files as mobile), Tauri/Rust or node-llama-cpp (desktop), Chrome Prompt API (optional web accelerator). Realistic sharing: 80–85 % of app code.
4. Models: standardize on GGUF Q4_K_M across mobile/web/desktop so there is one model catalog. Default tiers: Qwen3.5-0.8B (0.53 GB) → Qwen3.5-2B (1.28 GB) → Qwen3.5-4B (2.74 GB) / Phi-4-mini (2.49 GB) → Qwen3.5-9B / Ministral 3 8B on desktop. All Apache-2.0 or MIT; Gemma 4 is now Apache-2.0 too but its "E2B" file is 3.1 GB. Avoid Llama 3.2 as the default (attribution license) and LFM2.5 as a default unless you accept the sub-$10M-revenue license.
5. Device floor: iPhone with 6 GB RAM (13 Pro / 14 Pro / 15) for 1–3B, 8 GB (15 Pro, all 16/17) for 3–4B; Android 6 GB + arm64 + Snapdragon 8 Gen 2 / Tensor G3 class for 1–3B, 8 GB for 3–4B. Expect ~25–60 tok/s for 1B-class and ~10–20 tok/s for 3–4B on current flagships, with 15–40 % throughput loss from thermal throttling after 5–10 minutes.

## 1. Web: in-browser on-device inference in 2026

### 1.1 Engines

| Engine | Latest | License / health | Model format | Notes |
|---|---|---|---|---|
| WebLLM (MLC) | 0.2.84 (npm) | Apache-2.0, 18.7k stars, repo pushed 2026-09-02, 149 open issues | MLC-compiled weights + WebGPU shaders, own model list | OpenAI-style API, structured output via XGrammar, Vercel AI SDK providers exist (`@built-in-ai/web-llm`, `@browser-ai/web-llm`). Prebuilt list is Llama 3.1/3.2, Qwen2.5, Gemma 2, Phi-3.5, SmolLM2, Mistral 7B, DeepSeek-R1 distills; 1B–3B models need ~0.9–3 GB VRAM. Newer families (Qwen3.5, Gemma 4) require you to compile with MLC yourself. Not GGUF. |
| wllama | 3.6.1 (npm) | MIT, 1.19k stars, pushed 2026-08-27 | GGUF (identical files to llama.rn / node-llama-cpp) | llama.cpp compiled to WASM; since v3.1 uses the upstream `ggml-webgpu` backend for GPU offload (`n_gpu_layers`, default all). Multimodal (image/audio), tool calling, embeddings, split-GGUF parallel download. Hard limit: 2 GB per file (ArrayBuffer) → use `llama-gguf-split`. Multi-threading needs `Cross-Origin-Opener-Policy` + `Cross-Origin-Embedder-Policy` headers. "Compatibility mode" for Safari/Firefox with degraded performance. |
| llama.cpp WebGPU backend ("LlamaWeb", UCSC + Microsoft Research, paper May 2026) | upstream in llama.cpp | MIT | GGUF, 23 quant formats | Streams weights from OPFS into GPU buffers, static memory planning. 29–33 % less memory than WebLLM, 45–69 % higher decode throughput than WebLLM. This is the engine wllama v3 rides on. |
| Transformers.js v4 | 4.0.0, 2026-02-09 | Apache-2.0 | ONNX | WebGPU runtime rewritten in C++ with the ONNX Runtime team; ~200 architectures; >8B models now supported; also runs in Node/Bun/Deno. Best in class for embeddings, Whisper, TTS in-browser; fine for LLMs too. |
| Chrome built-in Prompt API (Gemini Nano) | Stable for websites since Chrome 148 (2026-05-05); extensions since 138 | Google | Gemini Nano (~4 GB shared download managed by Chrome) | Desktop only (Windows 10/11, macOS 13+, Linux, ChromeOS Plus); "mobile platforms not yet supported". Needs 22 GB free disk, GPU with >4 GB VRAM or 16 GB RAM + 4 cores. Users can disable/delete the model since Feb 2026. Vercel AI SDK provider: `@built-in-ai/core`. |

### 1.2 WebGPU availability (gpuweb Implementation Status wiki, checked 2026-09-02)

| Browser | Windows | macOS | Linux | Android | iOS |
|---|---|---|---|---|---|
| Chrome / Edge | v113+ (x64). Windows ARM64: behind experimental flag | v113+ | Intel Gen12+ v144, NVIDIA/Wayland v147, others flag | v121+ on Android 12+ (ARM/Qualcomm/Intel GPUs); Imagination GPUs v139 / Android 16 | n/a (WebKit) |
| Firefox | v141+ | v145 (macOS 26+), v147 all macOS; Intel Macs Nightly | Nightly, expected 2026 | flag, work expected 2026 | n/a |
| Safari | n/a | Safari 26 (macOS 26) default | n/a | n/a | iOS/iPadOS 26 default; iOS 25 and earlier: no WebGPU |

Practical coverage: ~90 %+ of desktop users, ~70–75 % of mobile users can run WebGPU today. Notable hole: Chrome on Windows-on-ARM (Snapdragon X Copilot+ laptops) still needs a flag.

### 1.3 Performance on typical hardware

| Hardware | Model | Engine | tok/s (decode) | Source |
|---|---|---|---|---|
| Apple M3 Max | Llama 3.1 8B q4 | WebLLM | ~41 | tianpan.co / egnworks |
| Apple M3 Max | Phi-3.5 mini | WebLLM | ~71 | same |
| Laptop with discrete GPU | Llama 3.2 3B | WebLLM | 20+ | egnworks |
| Apple M3 | Llama 3.2 1B f16 | llama.cpp WebGPU | ~52 | LlamaWeb paper |
| RTX 5080 desktop | 1–3B models | llama.cpp WebGPU | 100+ decode, 3,000+ prefill | LlamaWeb paper |
| Low-power GPUs (phones, iPhone 17 Pro Max, Galaxy S24) | ≤1B | llama.cpp WebGPU | 4–17 | LlamaWeb paper |
| Any WebGPU laptop | LFM2.5-230M | custom WebGPU kernels | ~1,400 | Liquid AI demo |

Rule of thumb from MLC: WebLLM reaches ~80 % of native MLC speed. The pure-WASM CPU path (no WebGPU) is several times slower than native CPU and should be a fallback only.

### 1.4 Storage: caching models in the browser

- All engines store weights in origin storage (Cache API, IndexedDB or OPFS). Quota is shared per origin between the three.
- Chrome/Edge: up to ~60 % of free disk per origin; eviction is LRU under storage pressure unless `navigator.storage.persist()` was granted.
- Safari 17+ (WebKit storage policy): browser apps up to ~60 % of total disk per origin (older 1 GiB + prompt model is gone); home screen web apps get the same treatment; non-browser apps that embed WebKit get 15 %; LRU eviction, origins in persistent mode or with open pages are protected.
- Safari ITP still deletes script-writable storage of sites the user has not interacted with for 7 days of Safari use. For a 2 GB model this means a rare user pays the download again. Ask for `persist()`, and prefer OPFS written from a worker via `FileSystemSyncAccessHandle` (this is what LlamaWeb does to stream weights to the GPU without a copy in the WASM heap).
- Mobile quotas are much smaller and `QuotaExceededError` must be handled.

### 1.5 UX and technical limits

- First load: 0.5–2.7 GB download (Q4_K_M of 0.8B–4B). Parallel chunked download (wllama split GGUF), resumable, hash-verified, with a "keep this device's copy" persist prompt.
- Memory: WASM heap is grow-only (memory is not released until the tab closes); Chrome desktop copes with 4–6 GB models on 16 GB machines; iPhone Safari limits a tab to <500 MB (LlamaWeb paper) and WebGPU `maxBufferSize` defaults to 256 MiB on iPhone (raisable to ~1 GB when requested), so only the smallest models (sub-1B) fit on iPhone web. Android Chrome works since v121 but is memory bound too.
- Windows-on-ARM Chrome has no WebGPU by default; Firefox on Linux/Android not yet; Safari is "compatibility mode" in wllama.
- Cross-origin isolation headers (COOP/COEP) needed for threads break third-party embeds (payment iframes, YouTube) on the same page. Put the demo on its own origin.
- Service workers: Expo ships none; Expo docs recommend Workbox and warn about update pitfalls.
- Background tabs are throttled; generation should run in a Worker.

### 1.6 Can "no data leaves your device" be credible on the web?

Honest answer: technically true per session, but not verifiable by the user the way an installed, signed, offline-capable binary is. What makes it as credible as possible:

1. Serve the app from your own origin with a strict CSP: `default-src 'self'`, `connect-src` limited to the model CDN, no third-party scripts, no analytics. Add Subresource Integrity on every script.
2. Make the app work with the network off (Service Worker + OPFS) so a user can literally run the airplane-mode test; state that in the UI.
3. Publish the source, build reproducibly, and publish the hash of the deployed bundle so anyone can compare.
4. Host models on your own CDN (R2) so the model download does not tell Hugging Face which model each IP is fetching.
5. Do not use the Chrome Prompt API silently: it is on-device, but the model is Google's and Chrome manages the download; gate it behind an explicit toggle.
6. Be explicit in copy: the browser and OS themselves may phone home (Chrome usage stats, Safari services); your app does not.

Position the web tier as "runs locally in your browser, nothing sent to us", and reserve the strongest privacy language ("auditable, works fully offline, no server in the loop") for the native apps.

### 1.7 PWA as a desktop substitute on Windows/macOS

- Chrome/Edge install PWAs on Windows/macOS/Linux (manifest-based). Safari on macOS 14+ has "Add to Dock" for any site. Firefox 143+ has "web apps / taskbar tabs" on Windows only, no manifest install, no macOS.
- Microsoft Store: PWABuilder packages a PWA as `.msixbundle` for free and it ships in the Store with Store-delivered updates. Apple: no Mac App Store path for a PWA.
- Verdict: a PWA is an acceptable interim "desktop" for the web tier and lets Windows users find you in the Store early, but it cannot give you native GPU backends (CUDA/Vulkan/Metal via llama.cpp), 7–9B models, tray/background presence, arbitrary file access for RAG, or the installed-binary trust story. Phase 3 (Tauri) remains necessary for the flagship desktop product.

## 2. Windows (and macOS) desktop options

### 2.1 Option (a): React Native for Windows / macOS + llama.rn

- llama.rn: iOS and Android only. README: Android "currently only supported arm64-v8a / x86_64", iOS uses a prebuilt `rnllama.xcframework`; build scripts are `build-ios.sh`, `build-android.sh`, `build-opencl.sh`, `build-hexagon-htp.sh` (no macOS/Windows). Latest npm tag 0.13.0-rc.2; requires the New Architecture since 0.10; MIT; 1.03k stars; pushed 2026-08-28.
- React Native Windows: 0.84.0 (2026-06-30, needs Visual Studio 2026), 0.83.0 (2026-06-04), 0.82.0 (2026-03-17, Paper removed, Fabric-only). 17.3k stars but 796 open issues. No Expo support ("As an out-of-tree platform, Expo doesn't officially support React Native Windows"; Expo Modules API supports only macOS and tvOS beyond iOS/Android).
- React Native macOS: 0.81.0 (2026-01-17), Fabric, 4.4k stars, 104 open issues, actively merging 0.84–0.87.
- What you would build: a Windows C++ TurboModule around llama.cpp (Vulkan/CUDA builds) plus a macOS slice for llama.rn's xcframework, and keep both in sync with llama.cpp's release cadence yourself. Every Expo module without a Windows implementation becomes a fork or a shim.
- Verdict: highest effort and highest maintenance risk of the five, worth it only if a native XAML UI is a hard requirement.

### 2.2 Option (b): Electron + node-llama-cpp

- node-llama-cpp 3.20.0 (2026-08-11), MIT, 2.2k stars, 28 open issues. Runs in Node, Bun and Electron (main process only; using it in a renderer crashes). Scaffold: `npm create node-llama-cpp@latest -- --template electron-typescript-react`.
- Prebuilt binaries (no compile on the user's machine): Windows x64 CUDA (built with CUDA 12.4 and 13.1; 163 MB unpacked), Windows x64 Vulkan (95 MB), Windows x64 CPU (45 MB), Windows arm64, macOS Metal (arm64/x64), Linux x64/arm64 (+ riscv64). If no matching binary exists it can build from source (up to an hour) unless disabled.
- Features: JSON-schema grammars at generation level, function calling, embeddings, rerank, chat-template handling, model download with speed/ETA. Vercel AI SDK providers exist (`lgrammel/ai-sdk-llama-cpp`, `llamacpp-ai-provider`).
- Packaging: keep native binaries unpacked from ASAR; cross-OS packaging is not possible (x64→arm64 only), so you need a CI matrix. Microsoft Store: electron-builder `appx` target produces MSIX, the format the Store prefers.
- Size/RAM: Electron ships Chromium + Node, 120–200 MB installers vs 3–10 MB for Tauri; more RAM at idle. That matters less next to a 2–5 GB model, but it is a visible trust/"bloat" signal for a privacy product.

### 2.3 Option (c): Tauri v2 + Rust llama.cpp

- Tauri v2: Rust core, system WebView (WebView2 on Windows, WKWebView on macOS), installers 10–20x smaller than Electron; also builds iOS/Android (not needed here). Sidecar support is first-class.
- Rust bindings: `llama-cpp-2` (utilityai/llama-cpp-rs), Apache-2.0, 640 stars, pushed 2026-09-02, mirrors llama.cpp's C API (some unsafe surface), CUDA/Vulkan/Metal via cargo features. `mistral.rs` (candle-based, CUDA/Metal, GGUF, active through mid-2026) is an alternative engine. The zero-binding route: bundle the official `llama-server` (~15 MB plus backend DLLs; separate CUDA and Vulkan builds) as a Tauri sidecar and talk OpenAI-compatible HTTP on localhost; several 2026 local-AI desktop apps do exactly this (Helix, warpdrv, MumbleFlow).
- Microsoft Store: Tauri emits EXE (NSIS) and MSI only, not MSIX. The Store accepts an "EXE or MSI app" product that links to your installer; requirements: offline installer, silent install (`/S`), code-signed, offline WebView2 bootstrapper, publisher name must differ from product name. Third-party `tauri-windows-bundle` can produce Store-ready MSIX if you want full Store hosting.
- WebGPU inside the WebView is irrelevant when inference is native; if you ever want the web engine inside the shell, WebView2 may need `--enable-unsafe-webgpu` via `additionalBrowserArgs`, WKWebView follows the system WebKit (WebGPU default on macOS 26).
- Verdict: recommended. Smallest binary, best security posture, native GPU backends through llama.cpp, and the frontend is the same Expo web export.

### 2.4 Option (d): Windows ML / ONNX Runtime GenAI / Phi Silica / Foundry Local

- Windows AI APIs (Windows App SDK): `LanguageModel` (Phi Silica) runs on the NPU of Copilot+ PCs and, per 2026 docs, on some non-Copilot+ Windows 11 GPUs; also imaging, OCR, semantic search; LoRA for Phi Silica in preview. Accessed from WinRT (C#/C++), so from Electron/Tauri you need a small native bridge (Rust `windows` crate or a C# sidecar).
- Windows ML (GA, powered by ONNX Runtime): OS-installed execution providers for CPU/GPU/NPU (NPU EPs need Windows 11 24H2 build 26100+), nothing to bundle; ONNX Runtime GenAI runs Phi-4-mini and friends on AMD/Intel NPUs. Model format is ONNX, not GGUF, so it is a second model pipeline.
- Foundry Local: 20+ models behind an OpenAI-compatible API on any DirectX 12 GPU, but it is a separately installed runtime, not a library you can embed in a consumer app.
- Verdict: treat Phi Silica as the Windows analogue of Apple Foundation Models (a zero-download starter model where available), not as the engine.

### 2.5 Option (e): Expo + react-native-web + Tauri shell

- Pattern documented by Netguru and the `mateusz1913/tauri-and-expo-research` monorepo (archived 2025-10-22 but still the reference): shared UI + business-logic packages, Expo app for iOS/Android/web, Tauri app whose frontend is the web build, `.tauri.tsx` files resolved by the bundler the same way `.ios.tsx`/`.web.tsx` are. With Expo SDK 54+ the web build is Metro (no Webpack), Expo Router gives file-based routes with static rendering.
- Verdict: this is the unification path; see section 3.

### 2.6 NPU stories

- Windows Copilot+ PCs (40+ TOPS NPU, 16 GB RAM floor): Phi Silica via Windows AI APIs; llama.cpp has a Hexagon NPU backend that also runs on Windows on Snapdragon (`pkg-wos`), Llama-3.2-1B at ~51–52 tok/s in the upstream doc; Intel's OpenVINO backend landed upstream on 2026-04-08 (Intel CPU/iGPU/NPU, Q4_0/Q4_K_M/Q8_0); no AMD XDNA backend in llama.cpp as of mid-2026. IDC/Gartner expect NPU-equipped "AI PCs" to be about half of 2026 shipments, but the installed base is still mostly non-NPU (and IDC cut its 2026 PC forecast to −10 % on RAM prices), so GPU (Vulkan/CUDA/Metal) plus CPU must remain the baseline and NPUs are an optimization.
- Apple macOS 26: Foundation Models framework on Apple-silicon Macs (M1+), same ~3B model as iOS, 4,096-token context per session (iOS 26.4 added `contextSize` and `tokenCount(for:)`). WWDC 2026 (iOS/macOS 27) adds a public `LanguageModel` protocol so any provider (Gemini via Firebase, Anthropic, a local model) plugs into the same `LanguageModelSession` code.

### 2.7 Comparison

| | (a) RNW/RN-macOS + own module | (b) Electron + node-llama-cpp | (c) Tauri + Rust/sidecar | (d) Windows ML / Phi Silica | (e) Expo web + Tauri |
|---|---|---|---|---|---|
| Maturity for local LLM | Low (no binding exists) | High | High (llama.cpp itself) | Medium, Windows-only | High (= c) |
| GPU accel | whatever you build | CUDA, Vulkan, Metal prebuilt | CUDA, Vulkan, Metal (cargo features / server build) | DirectML/NPU via ORT; Phi Silica NPU | = c |
| Installer size | ~30–60 MB + binaries | 120–200 MB + 45–163 MB binaries | 3–10 MB + 15–160 MB binaries | n/a | = c |
| Microsoft Store | MSIX native | MSIX via electron-builder | EXE/MSI listing or 3rd-party MSIX | MSIX | = c |
| macOS | RN-macOS (separate app target) | yes (Metal) | yes (Metal; Mac App Store possible with sandbox work) | no | yes |
| Code shared with RN mobile | UI: high; native: none | UI via RNW web export: high | UI: high; inference: adapter only | none | highest |
| Solo-dev risk | very high | low | medium (some Rust) | medium | medium |

## 3. Unified codebase

### 3.1 Architecture

```
apps/
  mobile+web (Expo SDK 54/55, Expo Router, RN 0.83/0.84, New Architecture)
  desktop    (Tauri v2; frontendDist = expo export --platform web; Rust crate with llama-cpp-2 or llama-server sidecar)
packages/
  ui          (NativeWind v4 or Tamagui components, .web.tsx / .native.tsx variants)
  core        (chat state, conversation store, prompt templates, RAG pipeline, model catalog, download manager, settings)
  llm-adapter (LocalLM interface + platform implementations)
  models      (signed manifest of GGUF files: name, sha256, size, license, min RAM, tier)
```

Inference adapter: define one interface modeled on the Vercel AI SDK `LanguageModel` provider (streaming text, tool calls, structured output, embeddings, abort, token usage). Implementations:

| Platform | Engine | Package | Model format |
|---|---|---|---|
| iOS / Android | llama.cpp | `llama.rn` via `@react-native-ai/llama` (AI SDK provider, 0.12.0, 2026-01-28) | GGUF |
| iOS 26+ (iPhone 15 Pro+), macOS 26+ | Apple Foundation Models | `@react-native-ai/apple` (text, embeddings, transcription, speech; tool calling) | built in |
| Android (optional, later) | Gemini Nano via ML Kit GenAI Prompt API (1.0.0-beta2; Pixel 8+/Galaxy S24+, best on Pixel 10) | Expo module you write | built in |
| Web | wllama (WebGPU + WASM) | `@wllama/wllama` (+ thin AI SDK provider) | GGUF (same files) |
| Web (optional) | Chrome Prompt API | `@built-in-ai/core` | Gemini Nano |
| Desktop | llama.cpp in Rust or `llama-server` sidecar | Tauri `invoke` + event stream; or node-llama-cpp in Electron | GGUF (same files) |

Because llama.rn, wllama, node-llama-cpp and the Rust crate are all llama.cpp, one GGUF catalog, one chat-template set, one grammar/tool-calling story and one download manager serve mobile, web and desktop. WebLLM would break this (separate compiled artifacts), which is the main reason to prefer wllama on the web.

### 3.2 What is shared and what is not

| Layer | Shared? | Notes |
|---|---|---|
| UI components, screens, navigation (Expo Router) | ~95 % | NativeWind/Tamagui; `.web.tsx` for hover/keyboard/menus |
| Chat/session state, storage schema, settings | 100 % | SQLite via expo-sqlite (native), OPFS/IndexedDB (web), SQLite via Rust (desktop) behind one repository interface |
| Model catalog, download manager, hash verification | ~90 % | file APIs differ: expo-file-system / OPFS / Tauri fs |
| RAG (chunking, embeddings, vector search) | ~85 % | vector store adapter: sqlite-vec (mobile/desktop), in-memory or IndexedDB (web) |
| Inference | adapter interface only | 5 implementations, 200–800 LOC each; Rust side 1–3k LOC |
| Speech (STT/TTS), file pickers, share sheets, tray, auto-update | platform | whisper.rn / SpeechAnalyzer / Transformers.js Whisper; system TTS |
| Packaging, signing, CI | platform | EAS (mobile), static hosting (web), Tauri bundler + Apple notarization + Windows signing |

Estimate: 80–85 % of application code shared; desktop-specific ≈ 3–5k LOC (Rust + glue); web-specific ≈ 1–2k LOC.

### 3.3 UI layer choice

- NativeWind v4: Tailwind syntax compiled ahead of time; works on web and native; fastest for a solo dev with AI agents (agents generate Tailwind well). Dark mode automatic.
- Tamagui: optimizing compiler that extracts CSS on web and flattens views natively; strongest universal performance and theming; steeper setup, more config to debug.
- Unistyles 3: fast, typed, now with web support; smaller ecosystem.
- Recommendation: NativeWind v4 unless you hit measurable render cost in long chat lists (then Tamagui). Never import raw HTML elements in shared code.

### 3.4 Pitfalls

1. RN Windows is not an Expo target; do not plan the desktop on it.
2. Expo web: no service worker out of the box (Workbox), react-native-web adds 30–40 KB and has flexbox/fixed-positioning differences; keep prop signatures identical across `.web.tsx`/`.native.tsx`; run `npx expo export --platform web --analyze` before shipping.
3. COOP/COEP for multithreaded WASM: isolate the demo origin from marketing pages with third-party embeds.
4. iPhone Safari web: sub-1B models only; detect and tell the user to install the app.
5. Windows-on-ARM Chrome has no WebGPU by default; the desktop app avoids this because inference is native.
6. Tauri uses WebKit on macOS and Chromium on Windows: test the web build in Safari as the macOS proxy.
7. Apple Foundation Models: 4,096-token session window, availability states (device ineligible, Apple Intelligence off, model downloading); design conversation trimming and a fallback to the GGUF engine.
8. Android 16 KB pages: mandatory on Play since 2025-11-01 for updates targeting Android 15+. llama.rn builds with `-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON`; you still need AGP 8.5.1+, NDK r28+, RN 0.77+, and every other native dependency aligned; test on a 16 KB emulator image.
9. Licensing hygiene: Llama 3.2 requires "Built with Llama" display and license copy; LFM2.5 is free only under $10M annual revenue; EmbeddingGemma and Gemma 3 carry the Gemma license (Gemma 4 is Apache-2.0).
10. Code signing costs and lead time: Apple Developer ID + notarization, Windows code-signing certificate (or Azure Trusted Signing) are required for Store and for SmartScreen.

### 3.5 Phases and effort (solo senior TypeScript developer using AI coding agents; estimates, not measurements)

| Phase | Scope | Effort |
|---|---|---|
| 1. Mobile (decided) | Expo app, llama.rn + Apple FM adapters, model catalog and downloads, chat UX, RAG v1, store submission | 8–12 weeks to store-ready; the adapter interface and shared packages are laid down here |
| 2. Web landing + web demo | Expo web export, wllama adapter (WebGPU + WASM fallback), OPFS cache with persist, COOP/COEP hosting, CSP/SRI, device gate (desktop: ≤4B; phone: ≤1B), PWA manifest + Workbox, optional Chrome Prompt API toggle | 3–5 weeks |
| 3. Desktop (Windows + macOS) | Tauri v2 shell over the web export, Rust crate or `llama-server` sidecar with Vulkan + CUDA (Win) and Metal (mac) builds, Tauri fs/sqlite adapters, updater, signing/notarization, Microsoft Store (EXE/MSI listing), optional Mac App Store | 5–8 weeks |
| 4. Platform accelerators (optional) | Apple FM on macOS inside Tauri (Swift sidecar), Phi Silica on Copilot+ PCs (WinRT bridge), Hexagon/OpenVINO NPU builds, Gemini Nano on Android | 2–4 weeks each |

Recommendation: keep the phase order mobile → web → desktop, but make the decision to do desktop now, because it shapes the adapter interface and the model catalog in Phase 1. If desktop demand shows up before Phase 2 is done, the PWA + PWABuilder Store listing is a two-day stopgap.

## 4. Model landscape for on-device (September 2026)

### 4.1 Chat models by tier (GGUF, Q4_K_M unless noted)

| Tier | Model | Q4_K_M file | License | Multimodal | Notes |
|---|---|---|---|---|---|
| 0: instant (≤1B) | Qwen3.5-0.8B | 533 MB (Q8_0 812 MB) | Apache-2.0 | vision (mmproj) | 262k ctx; PocketPal on iPhone 15 Pro: 27 tok/s at Q8 |
| 0 | LFM2.5-1.2B | ~0.66–0.7 GB | LFM Open License (free <$10M revenue) | VL-1.6B variant; audio variant | very fast (59.7 tok/s on iPhone 17 Pro via MLX 4-bit); thinking variant |
| 0 | Gemma 3 270M / 1B | 0.3 / 0.8 GB | Gemma license | no | superseded by Gemma 4 but still the smallest Google options |
| 1: fast (1–2B) | Qwen3.5-2B | 1.28 GB (Q8_0 2.01 GB) | Apache-2.0 | vision | default "fast" tier |
| 1 | Llama 3.2 1B | 0.81 GB | Llama 3.2 Community (attribution) | no | 128k ctx |
| 1 | Gemma 4 E2B | 3.11 GB (5.1B total params, 2.3B effective) | Apache-2.0 (April 2, 2026) | vision + audio | too big a file for the "fast" tier despite the E2B name |
| 2: quality (3–4B) | Qwen3.5-4B | 2.74 GB (Q8_0 4.48 GB) | Apache-2.0 | vision | default "quality" tier |
| 2 | Phi-4-mini 3.8B | 2.49 GB | MIT | no | 128k ctx; strong reasoning/math; flash-reasoning variant |
| 2 | SmolLM3-3B | 1.92 GB | Apache-2.0 | no | fully open recipe; 128k variant |
| 2 | Llama 3.2 3B | 2.02 GB | Llama 3.2 Community | no | |
| 2 | Ministral 3 3B | ~2 GB | Apache-2.0 (Dec 2025) | vision | multilingual |
| 2 | Gemma 4 E4B | 4.98 GB (8B total, 4.5B effective) | Apache-2.0 | vision + audio | desktop-class file size |
| 3: power (7–9B, desktop) | Qwen3.5-9B | ~5.5 GB | Apache-2.0 | vision | 16 GB laptops |
| 3 | Ministral 3 8B | ~5 GB | Apache-2.0 | vision | |
| 3 | Llama 3.1 8B | ~4.9 GB | Llama 3.1 Community | no | |
| 3 | Gemma 4 12B | ~7–8 GB | Apache-2.0 | vision + audio | llama-server audio support June 2026 |
| 4: high-end desktop | Muse Glimmer 30B (Meta, 2026-08-10) | ~18 GB | Apache-2.0 | text + images | single consumer GPU; node-llama-cpp 3.20 added support |

Meta has no Llama 4 small models; its on-device story is still Llama 3.2 1B/3B, and its 2026 open release is the 30B Muse Glimmer.

### 4.2 RAM requirements

- Working rule: runtime RAM ≈ GGUF size × 1.3–1.5 plus KV cache (context × layers). Unsloth's Qwen3.5 guidance: 0.8B/2B → 3.5 GB, 4B → 5.5 GB, 9B → 6.5 GB at 4-bit.
- Phones: 6 GB → tier 0–1 (and 3B at short context); 8 GB → tier 2; 12 GB → tier 3 at tight margins.
- Desktop: 8 GB → tier 2; 16 GB → tier 3; 32 GB or a 24 GB GPU → tier 4.

### 4.3 Multimodal (image input) on device

- Qwen3.5 0.8B/2B/4B/9B: vision via `mmproj` in llama.cpp; llama.rn supports mmproj projectors; wllama supports image input.
- Gemma 4 E2B/E4B: vision (llama.cpp PR #21309, 2026-04-02) and audio (llama-server, June 2026) through the integrated `gemma4uv` projector.
- LFM2.5-VL-1.6B, Ministral 3 (vision), Phi-3.5-vision (WebLLM).

### 4.4 Embeddings for document RAG (GGUF, run by the same engine)

| Model | Size | License | Notes |
|---|---|---|---|
| all-MiniLM-L6-v2 | 46 MB | Apache-2.0 | smallest usable; English |
| bge-small-en-v1.5 | ~33M params, ~70 MB | MIT | English |
| EmbeddingGemma-300M | 212–247 MB (Q2–Q5), <200 MB RAM | Gemma license | multilingual, built for on-device |
| nomic-embed-text-v1.5 | 274 MB | Apache-2.0 | 8k ctx, good default |
| Qwen3-Embedding-0.6B | Q4_K_M 395 MB, Q8_0 639 MB | Apache-2.0 | best quality/multilingual in this size; matching Qwen3 reranker exists |

llama.rn exposes embeddings and rerank; node-llama-cpp exposes embeddings and rerank; wllama exposes embeddings; Transformers.js v4 runs these on WebGPU too. Vector store: sqlite-vec on mobile/desktop, in-memory or IndexedDB on web.

### 4.5 Speech

- STT: `whisper.rn` 0.7.4 (whisper.cpp + NVIDIA Parakeet, Core ML on iOS 15+, realtime transcriber with Silero VAD; ggml whisper tiny/base/small are 75/142/466 MB). Apple SpeechAnalyzer (iOS 26, fully on-device, Apple claims ~2x faster than Whisper Large V3 Turbo) is exposed through `@react-native-ai/apple` transcription and `expo-speech-transcriber`; Android has offline `SpeechRecognizer` and Argmax Pro SDK. Web: Transformers.js v4 Whisper/Voxtral on WebGPU.
- TTS: system voices are free and offline (AVSpeechSynthesizer, Android TextToSpeech, Web Speech API on desktop). Neural options: Kokoro-82M via ONNX (`expo-kokoro-onnx`, sherpa-onnx; quality over speed, heavy on phone CPUs), Piper/VITS via sherpa-onnx, llama.rn's experimental codec.cpp TTS, Apple FM speech synthesis via `@react-native-ai/apple`.

### 4.6 Model download hosting

- Hugging Face direct: free for public repos; anonymous resolver limit is 3,000 requests per 5-minute window per IP (shared behind NAT), authenticated 5,000; many apps (PocketPal) download straight from HF. Risks: you do not control availability, rate limits or the Xet migration, and HF sees each user's IP + model choice.
- Own CDN on Cloudflare R2: $0.015/GB-month storage, $0 egress, Class B reads $0.36 per million. A 60 GB catalog costs about $1/month to store; 10,000 downloads of a 2.7 GB model (27 TB egress) cost $0 on R2 versus roughly $2,000+ on an egress-billed CDN at ~$0.08/GB.
- Recommendation: R2 as primary with a signed manifest (sha256 per file, size, license, min-RAM tier), HF as fallback mirror, resumable chunked downloads, verify after download, one catalog for all platforms.

## 5. Device compatibility floor

### 5.1 iPhone

| RAM | Devices | Practical model ceiling (GGUF) | Notes |
|---|---|---|---|
| 3–4 GB | SE 2/3, iPhone 11–14 (non-Pro), 13 mini | ≤1B Q4 (0.5–0.8 GB) | per-app budget ~0.9 GB (SE 3 GB) to ~2 GB; Increased Memory Limit entitlement does not raise ≤4 GB devices |
| 6 GB | 13 Pro/Pro Max, 14 Pro/Pro Max, 15/15 Plus, 14 Plus | 2B Q4 comfortable, 3B Q4 with short context | ~3 GB app budget |
| 8 GB | 15 Pro/Pro Max, all 16 (incl. 16e), 17/17e | 3–4B Q4 (2.5–3 GB) | ~4,000 MB app budget on 16 Pro; Apple Intelligence + Foundation Models available |
| 12 GB | 17 Pro/Pro Max, iPhone Air | 7–9B Q4 possible | jetsam allows ~50–67 % of RAM depending on device state |

Measured speeds:

| Device | Model | Engine | tok/s |
|---|---|---|---|
| iPhone 15 Pro | Qwen3.5-0.8B Q8_0 | PocketPal (llama.rn) | 27.1 |
| iPhone 16 Pro | Qwen2.5-1.5B 4-bit | llama.cpp class, sustained-load study | 40.5 peak → 23.7 sustained (−41.5 %) |
| iPhone 17 Pro (12 GB) | Qwen3 0.6B / Llama 3.2 1B / LFM2.5 1.2B / Qwen3 1.7B, 4-bit | MLX | 62 / 58 / 60 / 39.5 (TTFT 160–360 ms) |
| iPhone 17 Pro | Phi-4-mini 3.8B Q4_K_M | llama.cpp apps | ~13–18 (secondary source) |
| iPad Pro M5 | same 1B-class models | MLX | 86–124 |

Jetsam: the kernel kills the app instantly when resident memory crosses the per-device budget. Use `com.apple.developer.kernel.increased-memory-limit` (iOS 15+) and extended virtual addressing, mmap the GGUF, keep KV cache bounded (2–4k tokens on phones), and read `os_proc_available_memory()` before loading. Apple Foundation Models (iPhone 15 Pro+, 4,096-token window) is the zero-download starter on 8 GB+ iPhones.

### 5.2 Android

- Floor: 6 GB RAM, arm64-v8a (llama.rn ships arm64 + x86_64 only), Android 8+; realistic quality floor is Snapdragon 8 Gen 2 / Tensor G3 / Dimensity 9200 class. 8 GB RAM for 3–4B models; 12–16 GB flagships for 7–8B at ~5 tok/s (Snapdragon 8 Elite).
- Measured: Pixel 6 / Galaxy S21 (6 GB, 2021) run 1–3B Q4 at 3–6 tok/s; Pixel 8 Pro (12 GB) 10–14 tok/s on 3B; Pixel 9 Pro Phi-4-mini ~14 tok/s; Galaxy S24 Ultra Qwen2.5-1.5B 4-bit 12.2 peak → 10.4 sustained (−15 %) with GPU clock 1,000 → 720 MHz; Snapdragon 8 Elite 8B at ~5 tok/s. Mid-range 5–15 tok/s, flagship 15–30 tok/s for 1–3B.
- Acceleration in llama.rn: OpenCL on Adreno 700+ GPUs, experimental Hexagon NPU on SM8450+; llama.cpp upstream Hexagon doc shows Llama-3.2-1B at ~51 tok/s.
- Zero-download starter: Gemini Nano via ML Kit GenAI Prompt API (1.0.0-beta2; Pixel 8+, Galaxy S24+, best on Pixel 10 with nano-v3).
- 16 KB page size: required by Google Play since 2025-11-01 for new apps and updates targeting Android 15+; misaligned `.so` files crash at launch on 16 KB devices. llama.rn passes `ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON`; you need AGP 8.5.1+, NDK r28+, RN 0.77+ and aligned third-party SDKs.

### 5.3 Thermal throttling and battery

| Device | Throughput loss under sustained generation | Battery |
|---|---|---|
| iPhone 16 Pro (A18 Pro) | −41.5 % (40.5 → 23.7 tok/s) within ~15 consecutive ~800-token generations; Normal → Warm (−38 %) → Hot | 5 % over 20 iterations (~16k generated tokens) ≈ 0.3 % per 1k tokens |
| Galaxy S24 Ultra (SD 8 Gen 3) | −15 % (12.2 → 10.4 tok/s), GPU 1,000 → 720 MHz by iteration 8; display off | 7 % over 20 iterations (~13k tokens) ≈ 0.5 % per 1k tokens; 1.59 W average; 146 mJ/token |
| Xiaomi 14 Pro (SD 8 Gen 3) | prime-core frequency −~50 % after ~500 s of continuous inference (CPU 34 → 40+ °C) | |
| Android tablets | | ~4.5 mAh per 64-token prompt + 128-token answer |
| General 2026 field reports | 20–40 % slower after 5–10 minutes of continuous inference | iPhone 16 Pro with a 3B model: 2–4 hours of continuous use |

Design rules: cap context and max tokens on phones, stop or slow generation when `ProcessInfo.thermalState` is `.serious`/`.critical` (Android `PowerManager.getThermalHeadroom`), unload the model after idle, prefer GPU/NPU offload, never run inference in the background, and show the user the model tier that fits their RAM instead of a raw model list.

## Sources

Web engines and WebGPU
- https://webllm.mlc.ai/docs/
- https://github.com/mlc-ai/web-llm
- https://github.com/mlc-ai/web-llm/issues/683
- https://github.com/ngxson/wllama
- https://github.ngxson.com/wllama/docs/
- https://arxiv.org/html/2605.20706v1 (Llamas on the Web / LlamaWeb, llama.cpp WebGPU backend)
- https://www.microsoft.com/en-us/research/publication/llamas-on-the-web-memory-efficient-performance-portable-and-multi-precision-llm-inference-with-webgpu/
- https://huggingface.co/blog/transformersjs-v4
- https://github.com/huggingface/transformers.js/releases/tag/4.0.0
- https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
- https://web.dev/blog/webgpu-supported-major-browsers
- https://tianpan.co/blog/2026-04-17-browser-native-llm-inference-webgpu
- https://www.egnworks.com/blog/running-llms-in-the-browser-with-webgpu
- https://essamamdani.com/blog/lfm2-5-230m-webgpu-browser-inference-1400-tokens-per-second
- https://medium.com/@marcelo.emmerich/webgpu-bugs-are-holding-back-the-browser-ai-revolution-27d5f8c1dfca
- https://localaimaster.com/blog/run-llm-in-browser
- https://www.npmjs.com/package/@built-in-ai/web-llm
- https://www.browser-ai.dev/docs/ai-sdk-v6/web-llm
- https://localmode.dev/

Chrome built-in AI
- https://developer.chrome.com/docs/ai/built-in-apis
- https://developer.chrome.com/docs/ai/prompt-api
- https://chromereleases.googleblog.com/2026/05/stable-channel-update-for-desktop.html (Chrome 148, 2026-05-05)
- https://9to5google.com/2026/05/06/google-chrome-4gb-storage-ai-details/
- https://www.ghacks.net/2026/05/06/google-chrome-is-silently-downloading-a-4gb-gemini-nano-ai-model-to-user-devices-without-consent/

Browser storage and PWA
- https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- https://webkit.org/blog/14403/updates-to-storage-policy/
- https://renderlog.in/blog/origin-private-file-system-opfs/
- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing
- https://firefox-source-docs.mozilla.org/browser/components/taskbartabs/docs/index.html
- https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/microsoft-store
- https://docs.expo.dev/guides/progressive-web-apps/

Desktop: React Native Windows / macOS, Electron, Tauri, Windows AI
- https://github.com/mybigday/llama.rn
- https://api.github.com/repos/mybigday/llama.rn/contents/scripts
- https://github.com/microsoft/react-native-windows/releases
- https://github.com/microsoft/react-native-macos/releases
- https://github.com/expo/expo/discussions/22273
- https://docs.expo.dev/modules/additional-platform-support/
- https://node-llama-cpp.withcat.ai/guide/electron
- https://node-llama-cpp.withcat.ai/guide/CUDA
- https://github.com/withcatai/node-llama-cpp/releases
- https://registry.npmjs.org/@node-llama-cpp/win-x64-cuda/latest (163 MB), /win-x64-vulkan/latest (95 MB), /win-x64/latest (45 MB)
- https://www.electron.build/docs/appx/
- https://v2.tauri.app/distribute/microsoft-store/
- https://github.com/Choochmeque/tauri-windows-bundle
- https://github.com/utilityai/llama-cpp-rs
- https://crates.io/crates/llama-cpp-2
- https://github.com/EricLBuehler/mistral.rs
- https://github.com/tjcrims0nx/Helix
- https://medium.com/@dillon.desilva/building-local-lm-desktop-applications-with-tauri-f54c628b13d9
- https://tech-insider.org/tauri-vs-electron-2026/
- https://www.pkgpulse.com/guides/electron-vs-tauri-2026
- https://github.com/tauri-apps/tauri/issues/6381 (WebView2 WebGPU flag)
- https://learn.microsoft.com/en-us/windows/ai/apis/
- https://learn.microsoft.com/en-us/windows/ai/apis/phi-silica
- https://learn.microsoft.com/en-us/windows/ai/windows-ai-comparison
- https://learn.microsoft.com/en-us/windows/ai/new-windows-ml/overview
- https://www.amd.com/en/developer/resources/technical-articles/2026/ai-model-deployment-using-windows-ml-on-amd-npu.html
- https://github.com/ggml-org/llama.cpp/blob/master/docs/backend/snapdragon/README.md
- https://medium.com/openvino-toolkit/openvino-lands-in-llama-cpp-run-gguf-models-on-intel-cpu-gpu-and-npu-d6fca1d633e8
- https://github.com/ggml-org/llama.cpp/blob/master/docs/backend/OPENVINO.md
- https://counterpointresearch.com/en/reports/ai-advanced-pcs-to-surpass-half-of-global-shipments-in-2026
- https://www.tomshardware.com/tech-industry/idc-warns-pc-market-could-shrink-up-to-9-percent-in-2026-due-to-skyrocketing-ram-pricing-even-moderate-forecast-hits-5-percent-drop-as-ai-driven-shortages-slam-into-pc-market

Apple Foundation Models
- https://www.createwithswift.com/exploring-the-foundation-models-framework/
- https://developer.apple.com/documentation/technotes/tn3193-managing-the-on-device-foundation-model-s-context-window
- https://infoq.com/news/2026/03/apple-foundation-models-context
- https://dev.to/arshtechpro/wwdc-2026-apple-just-opened-the-foundation-models-framework-to-any-llm-provider-5ejn
- https://firebase.blog/posts/2026/06/apple-foundation-models-gemini/
- https://support.apple.com/en-us/121115
- https://www.macrumors.com/2026/06/08/siri-ai-compatible-iphone-models/

Unified codebase
- https://www.netguru.com/blog/react-native-expo-tauri
- https://github.com/mateusz1913/tauri-and-expo-research
- https://reactnativerelay.com/article/react-native-web-expo-cross-platform-2026
- https://expo.dev/changelog/sdk-55
- https://expo.dev/changelog/sdk-56-beta
- https://github.com/callstackincubator/ai
- https://registry.npmjs.org/@react-native-ai/llama
- https://www.callstack.com/blog/meet-react-native-ai-llms-running-on-mobile-for-real
- https://github.com/lgrammel/ai-sdk-llama-cpp
- https://medium.com/react-native-journal/nativewind-vs-tamagui-vs-unistyles-which-styling-library-should-you-use-in-2026-cf4f4d78b76f
- https://www.pkgpulse.com/guides/nativewind-vs-tamagui-vs-twrnc-react-native-styling-2026

Models, licenses, sizes
- https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF
- https://huggingface.co/unsloth/Qwen3.5-2B-GGUF
- https://huggingface.co/unsloth/Qwen3.5-4B-GGUF
- https://unsloth.ai/docs/models/qwen3.5
- https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF
- https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF
- https://levelup.gitconnected.com/google-just-released-gemma-4-and-the-license-change-is-the-real-story-29c7d940f57c
- https://github.com/ggml-org/llama.cpp/pull/21309
- https://ai.google.dev/gemma/docs/core/model_card_4
- https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF
- https://huggingface.co/unsloth/SmolLM3-3B-GGUF
- https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF
- https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF
- https://www.llama.com/llama3_2/license/
- https://mistral.ai/news/mistral-3/
- https://huggingface.co/mistralai/Ministral-3-3B-Instruct-2512-GGUF
- https://www.liquid.ai/blog/introducing-lfm2-5-the-next-generation-of-on-device-ai
- https://www.therundown.ai/tools/lfm-2-5 (LFM Open License terms)
- https://unsloth.ai/docs/models/tutorials/lfm2.5
- https://research.meta.ai/blog/introducing-muse-glimmer-open-agentic-model
- https://www.cnbc.com/2026/08/10/meta-muse-glimmer-open-weight-ai.html
- https://www.bentoml.com/blog/the-best-open-source-small-language-models
- https://www.promptquorum.com/power-local-llm/mobile-llm-models-phi4-gemma-smollm

Embeddings, speech
- https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF
- https://huggingface.co/unsloth/embeddinggemma-300m-GGUF
- https://developers.googleblog.com/en/introducing-embeddinggemma/
- https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF
- https://insiderllm.com/guides/embedding-models-rag/
- https://github.com/mybigday/whisper.rn
- https://github.com/ggml-org/whisper.cpp
- https://www.callstack.com/blog/on-device-speech-transcription-with-apple-speechanalyzer
- https://github.com/DaveyEke/expo-speech-transcriber
- https://github.com/isaiahbjork/expo-kokoro-onnx
- https://github.com/k2-fsa/sherpa-onnx

Hosting
- https://huggingface.co/docs/hub/rate-limits
- https://egresscost.com/cloudflare/
- https://www.bucketmate.app/blogs/cloudflare-r2-pricing-2026

Device floor, thermal, battery
- https://arxiv.org/html/2603.23640v2 (LLM Inference at the Edge: sustained-load study, iPhone 16 Pro / S24 Ultra)
- https://rickytakkar.com/blog_russet_mlx_benchmark.html (iPhone 17 Pro / iPad Pro M5 MLX benchmarks)
- https://www.vance.xin/2026/05/12/202605121702/ (PocketPal, iPhone 15 Pro, Qwen3.5-0.8B 27 tok/s)
- https://github.com/a-ghorbani/pocketpal-ai/discussions/155 (benchmark definition PP 512 / TG 128)
- https://huggingface.co/spaces/a-ghorbani/ai-phone-leaderboard
- https://umurinan.com/pages/posts/ios-memory-mcp-server.html (per-app budgets: 16 Pro ~4,000 MB, SE ~900 MB)
- https://developer.apple.com/forums/thread/688973
- https://zenn.dev/mtfum/articles/ios_memory_entitlements?locale=en
- https://insiderllm.com/guides/run-llms-old-phones-mobile-inference/
- https://dev.to/alichherawalla/how-to-run-llms-locally-on-your-android-phone-in-2026-no-cloud-no-account-2cd1
- https://www.buildmvpfast.com/blog/on-device-llm-mobile-llama-ios-android-2026
- https://grapeup.com/blog/running-llms-on-device-with-qualcomm-snapdragon-8-elite
- https://developer.android.com/guide/practices/page-sizes
- https://android-developers.googleblog.com/2025/05/prepare-play-apps-for-devices-with-16kb-page-size.html
- https://raw.githubusercontent.com/mybigday/llama.rn/main/android/build.gradle
- https://developers.google.com/ml-kit/genai/prompt/android
- https://android-developers.googleblog.com/2025/10/ml-kit-genai-prompt-api-alpha-release.html
