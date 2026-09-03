# Design research: private, offline, on-device AI chat app

Date: 2026-09-02. Scope: (1) Claude design skills available online and how they fit the local setup; (2) 2026 design direction for an app that must read as "AI" while conveying power and security; (3) one concrete design system plus three alternatives. Repo stars and "last push" values were read live from the GitHub API on 2026-09-02.

## TL;DR

- Nothing needs to be bought or built from scratch. The official Anthropic `frontend-design` skill is already installed on this machine as a plugin but is switched off. Turn it on.
- Install two more skills for this job: `pbakaus/impeccable` (design director with 23 commands, native iOS/Android variants, 258K installs) and `emilkowalski/skills` (motion taste from a Vercel/Linear alum, includes `prototype`, `animate-expo`, `apple-design`).
- Use the built-in `design` skill (Claude Design canvas) for the artboard mockups the founder can tweak by hand, and `artifact-design` before building the interactive HTML prototype.
- 2026 "AI look" is streaming text, a process-only shimmer or breathing indicator, dark glass on the navigation layer, confidence and source signals, calm motion. The clichés to avoid: purple-to-blue gradients, sparkles, orbs and aurora mist, Inter for everything, cards inside cards, bounce easing.
- Security and power in 2026 come from restraint plus proof: warm near-black surfaces, one rationed accent, monospace telemetry, hairline borders, and verifiable claims ("bytes out: 0", airplane-mode test) instead of shield icons.
- Proposed direction: **FARADAY**. Cold graphite base `#0A0D11`, text `#EEF2F5`, a single amber "Filament" accent `#F0B35B` for power, a semantic "Sealed" green `#3ECF8E` used only for the on-device state, danger `#F25555`. IBM Plex Sans + IBM Plex Mono (both open licence, Hebrew coverage). Signature element: one **Seal ring** that loads, closes, breathes while generating, and is the app's only AI indicator.

---

## Part 1. Claude design skills

### 1.1 What is already on this machine

| Item | State | How it fits |
|---|---|---|
| `frontend-design@claude-plugins-official` | Installed 2026-04-24, last updated 2026-08-24, **disabled** in `~/.claude/settings.json` (`"enabledPlugins": {"frontend-design@claude-plugins-official": false}`) | The official Anthropic aesthetic-direction skill (see 1.2). Enable it; no download needed. |
| Built-in `design` skill | Available | "Create a design canvas": multi-artboard `.dc.html` mockups published as an Artifact running Claude Design's canvas editor (early preview of Claude Design inside Claude Code). The founder can click-select, edit text, undo, save versions, export PNG/PDF. Use it for the screen-flow mockups. |
| Built-in `artifact-design` skill | Available | Design fundamentals loaded before writing any Artifact. Mandatory before the interactive HTML prototype. |
| Built-in `dataviz` skill | Available | Only if the prototype shows telemetry charts (tokens/s, memory). |
| `~/.claude/skills/` | 27 company skills (ASO, support, board, etc.) | No design skills present. No `npx skills` CLI cache present (`~/.skills` absent). |
| `~/.agents/skills/` | Absent | Nothing installed through the Vercel `skills` CLI yet. |

To enable the official plugin: run `/plugin`, open the installed list and toggle `frontend-design` on, or set the value to `true` in `~/.claude/settings.json` under `enabledPlugins`.

### 1.2 Anthropic official repository: github.com/anthropics/skills

173,109 stars, last push 2026-09-01. 19 top-level skills. Registered as a Claude Code plugin marketplace with `/plugin marketplace add anthropics/skills`, then `/plugin install example-skills@anthropic-agent-skills`. Individual skills also install with the Vercel `skills` CLI: `npx skills add anthropics/skills --skill frontend-design`. skills.sh reports 844.8K installs of `frontend-design`.

Design-relevant skills in the repo:

| Skill | What it does | Relevance here |
|---|---|---|
| `frontend-design` | Acts as a studio design lead. Forces a token plan (4 to 6 named hex values, 2+ type roles, layout, one "signature" element), then a self-critique pass against the three default AI looks it names explicitly: (1) cream `#F4F1EA` + serif + terracotta, (2) near-black + single acid-green/vermilion accent, (3) broadsheet hairlines with zero radius. Also has a strong UX-writing section. | Core. Note that default look (2) is dangerously close to a naive "dark security app". Our system avoids it by making green semantic only and the accent amber. |
| `canvas-design` | Writes a design "philosophy" manifesto then renders PNG/PDF artwork. | Marketing posters and app-store art, not product UI. |
| `theme-factory` | 10 preset colour+font themes for slides/docs/HTML plus on-the-fly theme generation. | Pitch deck only. |
| `brand-guidelines` | Applies Anthropic's own brand. | Not applicable. |
| `web-artifacts-builder` | React + Tailwind + shadcn scaffold bundled into one HTML artifact. Its style guide literally says: avoid "excessive centered layouts, purple gradients, uniform rounded corners, and Inter font". | Option for the interactive prototype if it needs state and routing. |
| `algorithmic-art`, `slack-gif-creator` | Generative art, GIFs. | Could produce the Faraday mesh texture or onboarding loops. |
| `skill-creator` | Author a project skill. | Use to freeze the final FARADAY tokens into a project skill so every later session obeys them. |

### 1.3 Claude Design (the product) and how it maps to Claude Code

- Announced 2026-04-17 by Anthropic Labs. Research preview for Pro, Max, Team and Enterprise (Enterprise admins must enable it). Powered by Claude Opus 4.7 at launch.
- Produces designs, prototypes, slides, one-pagers, wireframes, mockups, landing pages and code-powered prototypes (voice, video, shaders, 3D). Refinement through inline comments and adjustment controls. Exports to Canva, PDF, PPTX, HTML, or internal URLs.
- Onboarding builds a design system by reading codebases and design files, then applies it across projects.
- Hand-off: "When a design is ready to build, Claude packages everything into a handoff bundle that you can pass to Claude Code with a single instruction."
- Inside Claude Code the built-in `design` skill is the early preview of the same canvas editor. So the practical flow is: design canvas (artboards) → founder edits → hand-off → Claude Code builds the HTML prototype with `artifact-design` + `frontend-design` + impeccable.

### 1.4 Community design skills usable with Claude Code

| Skill | Repo | Stars / last push | What it does | Install |
|---|---|---|---|---|
| **impeccable** | github.com/pbakaus/impeccable | 64,813 / 2026-09-02, v4.1.3, 258.2K installs on skills.sh | "Design director" skill built on Anthropic's frontend-design. 23 commands (`shape`, `critique`, `audit`, `polish`, `animate`, `harden`, `onboard`, `adapt`, `typeset`, `colorize`, `distill`, `live`...), `PRODUCT.md`/`DESIGN.md` memory, 61 deterministic detector rules (no LLM needed), browser "live" variant mode, and **native iOS/Android variants** of `audit` and `adapt`. Explicit anti-pattern list: Inter, grey text on colour, pure black, nested cards, bounce easing. | `npx impeccable install` from the project root (choose Claude, project scope), then `/impeccable init`. Plugin route: `/plugin marketplace add pbakaus/impeccable` then install from `/plugin`. |
| **emilkowalski/skills** | github.com/emilkowalski/skills | 34,689 / 2026-08-21 | Emil Kowalski (Vercel, Linear; author of Sonner and animations.dev). Skills: `emil-design-eng`, `animate`, `animate-expo` (React Native/Expo gestures, sheets, haptics, off-JS-thread motion), `review-animations`, `improve-animations`, `find-animation-opportunities`, `animation-vocabulary`, `apple-design` (WWDC principles translated to web), `write-swift`, `pick-ui-library`, `prototype` (builds several variants with a switcher). | `npx skills@latest add emilkowalski/skills -a claude-code -y` (add `-g` for user scope). |
| **ui-ux-pro-max** | github.com/nextlevelbuilder/ui-ux-pro-max-skill | 124,033 / 2026-09-02 | Searchable database: 79 UI styles, 192 palettes, 74 font pairings, 99 UX guidelines, 192 reasoning rules, "design system generator" printout, pre-delivery checklist. Python 3 required. Has a paid Premium tier. Output is a template-style recommendation; good as a lookup, weak as taste. | `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` then `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill`. CLI: `npm i -g ui-ux-pro-max-cli && uipro init --ai claude`. |
| **vercel-labs/agent-skills → web-design-guidelines** | github.com/vercel-labs/agent-skills | 30,733 / 2026-08-28 | Lints UI code against Vercel's Web Interface Guidelines (fetched fresh each run), reports `file:line`. Also `react-native-skills`, `composition-patterns`. | `npx skills add vercel-labs/agent-skills --skill web-design-guidelines` |
| **interface-design** | github.com/Dammyjay93/interface-design | 5,644 / 2026-06-20 | For app UI, not marketing. Saves decisions to `.interface-design/system.md` and reloads them, so spacing/radius/elevation stay consistent across sessions. Direction boards when an image tool exists. | `npx skills add Dammyjay93/interface-design` |
| **ui-skills (ibelick)** | github.com/ibelick/ui-skills | 7,990 / 2026-08-28 | Registry + CLI + MCP of design-engineering skills (e.g. `baseline-ui`). | `npx ui-skills get baseline-ui` or MCP `https://www.ui-skills.com/mcp` |
| **mblode/agent-skills** | github.com/mblode/agent-skills | 99 / 2026-09-02 | `ui-design`, `ui-animation` (springs, easing from screen recordings), `typography-audit` (78 rules), `product-design`. | `npx skills add mblode/agent-skills -g --agent claude-code -y` |
| **mobile-app-ui-design (ceorkm)** | github.com/ceorkm/mobile-app-ui-design | 299 / 2026-06-25 | Mobile conventions: thumb zone, 8-pt grid, 60/30/10, max 4 type sizes, industry conventions incl. AI and crypto. | `npx skills add ceorkm/mobile-app-ui-design` |
| **mobile-app-design (awesome-skills)** | github.com/awesome-skills/mobile-app-design | 67 / 2026-02-05 | iOS HIG + Material + a11y + React Native notes. Stale. | `npx skills add awesome-skills/mobile-app-design` |
| **superdesign-skill** | github.com/superdesigndev/superdesign-skill | 494 / 2026-08-21 | Design agent on an infinite canvas; reads your codebase; needs `@superdesign/cli` login to superdesign.dev (cloud). Overlaps the built-in Claude Design canvas. README warns not to install both via `npx skills add` and the plugin in Claude Code. | `/plugin marketplace add superdesigndev/superdesign-skill` + `/plugin install superdesign@superdesign` |
| **stitch-skills (Google)** | github.com/google-labs-code/stitch-skills | 8,239 / 2026-08-17 | Skills for Google's Stitch MCP design tool (incl. a shadcn-ui skill). Only useful with Stitch. | `npx skills add google-labs-code/stitch-skills@shadcn-ui -g -y` |
| **claude-design-skills (master5d)** | github.com/master5d/claude-design-skills | 21 / 2026-03-28 | Bundles Emil + ibelick baseline-ui + interface-design and recommends Pencil/Paper canvases. Small; install the sources directly instead. | plugin per README |
| **wshobson/agents → tailwind-design-system** | github.com/wshobson/agents | 39,345 / 2026-09-01 | Tailwind spacing/colour/breakpoint discipline inside a large multi-harness marketplace. | `npx skills add wshobson/agents@tailwind-design-system -g -y` |
| **figma/mcp-server-guide → implement-design** | github.com/figma/mcp-server-guide | 1,945 / 2026-09-01 | Figma Dev Mode to code via MCP. Only if Figma files exist. | `npx skills add figma/mcp-server-guide@implement-design -g -y` |

Installer facts (github.com/vercel-labs/skills, 30,218 stars): `npx skills add <owner/repo | URL | local path>`; flags `-g/--global`, `-a/--agent claude-code`, `-s/--skill <name>` (`'*'` for all), `-l/--list`, `--copy`, `-y`. The `owner/repo@skill` shorthand seen in blog posts also resolves. `npx skills use <source>@<skill> --agent claude-code` runs a skill once without installing.

### 1.5 Platform-specific skills (for the native builds later)

| Skill | Repo | Stars / last push | Notes |
|---|---|---|---|
| ios-liquid-glass (apple-skills) | github.com/Prisma-Labs-Dev/apple-skills | 323 / 2026-08-11 | iOS 26+ APIs, SwiftUI, Liquid Glass. Most maintained of the Liquid Glass skills. |
| liquid-glass-skill | github.com/haider-nawaz/liquid-glass-skill | 50 / 2026-02-14 | 5-phase migration workflow, glass-native patterns. |
| LiquidGlassReference | github.com/conorluddy/LiquidGlassReference | 333 / 2026-03-08 | A reference doc, not a skill: variants `.regular` / `.clear` / `.identity`, "exclusively for the navigation layer, never content". |
| material-3-skill | github.com/hamen/material-3-skill | 1,345 / 2026-07-15 | MD3 + M3 Expressive tokens, 30+ components, theming, compliance audit (Compose-first). |
| m3-expressive (albermonte/android-skills) | github.com/Albermonte/android-skills | 10 / 2026-09-01 | Small, active. |
| Emil `apple-design` + `animate-expo` | (see 1.4) | | Covers Apple motion principles and RN/Expo motion. |

### 1.6 Directories and curated lists

- skills.sh (Vercel): install counts and one-line install commands. www.skills.sh/anthropics/skills/frontend-design, www.skills.sh/pbakaus/impeccable/impeccable.
- VoltAgent/awesome-agent-skills: 33,606 stars, 1000+ skills, pushed 2026-09-01 (most current list).
- ComposioHQ/awesome-claude-skills: 74,261 stars, pushed 2026-08-10.
- BehiSecc/awesome-claude-skills: 10,085 stars, pushed 2026-08-02.
- travisvn/awesome-claude-skills: 14,934 stars, pushed 2026-04-28 (stale).
- ui-skills.com (ibelick), claudepluginhub.com, skillselion.com, claudemarketplaces.com: directory sites.
- Articles used: pasqualepillitteri.it "20 best Claude Code skills for UI/UX" (2026-03-05), Nick Babich on UX Planet, nervegna.substack, Snyk "Top 8 Claude skills for UI/UX engineers", firecrawl "Best Claude Code skills 2026".

### 1.7 Recommendation for this job

Install these three (nothing else is needed for the spec and prototype):

1. **Enable the official `frontend-design` plugin** (already installed, currently off).
   `/plugin` → installed → enable `frontend-design`, or set `"frontend-design@claude-plugins-official": true` in `~/.claude/settings.json`.
2. **Impeccable** (project scope so it does not touch the global harness):
   ```bash
   cd <new-app-repo> && npx impeccable install --providers=claude --scope=project
   ```
   then in Claude Code: `/impeccable init` → `/impeccable shape` (spec) → build → `/impeccable critique`, `/impeccable audit`, `/impeccable adapt` (native variant), `/impeccable harden`, `/impeccable polish`.
   Caution: it installs a project hook manifest and a detector CLI; review `.claude/` after install. It writes `PRODUCT.md` and `DESIGN.md` in the repo.
3. **Emil Kowalski's skills** (motion, prototype switcher, Apple principles, Expo motion):
   ```bash
   npx skills@latest add emilkowalski/skills -a claude-code -y
   ```
   Use `/prototype` to produce 3 variants of the Seal ring and the streaming treatment, `/animate` for the seal-close spring, `/apple-design` before the iOS chrome.

Optional, situational:
- `npx skills add vercel-labs/agent-skills --skill web-design-guidelines` as the final a11y/UX lint of the HTML prototype.
- `npx skills add Dammyjay93/interface-design` if many sessions will touch the UI and token drift becomes a problem (impeccable's DESIGN.md already covers most of this).
- `hamen/material-3-skill` and `Prisma-Labs-Dev/apple-skills` when the native builds start.
- `ui-ux-pro-max` only as a palette/font lookup; do not let it dictate the system (its output is a template).
- Skip `superdesign` (cloud login, duplicates the built-in canvas) and `stitch-skills` (needs Google Stitch).

Suggested order of operations: `design` skill canvas (3 to 5 artboards: onboarding seal, empty chat, streaming chat, model vault, settings/proof) → founder edits → `frontend-design` + `artifact-design` + impeccable to build the interactive HTML prototype → Emil `prototype` for motion variants → `web-design-guidelines` lint → `skill-creator` to freeze tokens as a project skill.

---

## Part 2. Design direction research (2026)

### 2.1 What reads as "AI" in 2026, and what is now cliché

Reads as AI (still current):
- **Streaming text** token by token with a visible caret (2 px bar, ~500 to 600 ms blink). Claude.ai uses a small filled square, Cursor a thin bar, ChatGPT a pulsing dot. A stream without a caret looks finished when it is only paused.
- **Process-only signalling.** Apple Intelligence's shimmer (conic gradient, ~1.8 s per loop, 2 px, sampled colours `#0894FF` `#C959DD` `#FF2E54` `#FF9004`, fades within ~0.4 s of the result) is the reference: it exists only while computing and never persists as a badge. Third parties are told not to imitate it and to design a distinct signal (breathing animation, brand-coloured badge, tinted background).
- **Deference principle.** AI suggestions sit in quiet containers (thin pill rows, collapsed cards, collapsed "thinking" sections) and expand on request; user-initiated AI steps get primary hierarchy.
- **Glass 2.0 on the navigation layer only.** Dark base `#0A0A0A` to `#1A1A2E`, backdrop blur 12 to 20 px on toolbars, sheets and floating pills; never on content or full-screen backgrounds.
- **Confidence and source indicators**, skeletons instead of spinners, a persistent mic with waveform, model name on every assistant message, reasoning collapsed by default.
- **Calm interfaces.** 2026 trend pieces converge on "motion explains, it does not perform" and "interfaces that hide their logic feel evasive, not advanced". Judgement and restraint beat novelty.

Cliché (the "we used AI" tells, 2026):
- Purple-to-blue gradient ("the official colour scheme of we used AI"), sparkles on every AI control, orbs, aurora, mist and glow everywhere, glassmorphism on everything.
- Inter for everything, cards nested in cards, grey text on coloured backgrounds, the rounded-square icon tile above every heading, bounce and elastic easing, animations that run constantly.
- The three default AI looks named in Anthropic's own skill (cream+serif+terracotta; near-black + acid-green accent; broadsheet hairlines). A dark security app that leans on a single bright green accent lands on default #2. Our system keeps green semantic and rations the accent.
- Impeccable's slop page and several 2026 essays document the feedback loop: a look that was fresh in early 2025 was a cliché by mid-2026 because it was fed back into training data.

### 2.2 What reads as "security, privacy, power" (brand by brand)

| Brand | What they do visually | Tokens worth borrowing |
|---|---|---|
| **Linear** | Warm near-black tonal layering, indigo used as punctuation not as CTA fill, inverted white-on-black primary button, hairlines, Berkeley Mono in shortcut chips "as a credibility signal to engineers". | bg `#08090a`, surface `#0f1011`, text `#f7f8f8`, brand `#5e6ad2`, CTA fill `#e5e5e6`, border `#23252a`; Inter Variable 400/510/590; radius 8 input, 12 card, 24 hero, pill 9999; hover translateY(-1px) 120 ms, standard 180 ms; focus ring 3 px rgba(94,106,210,.32). |
| **Raycast** | Near-black canvas, one coral accent reserved for logo/AI badge/hero, no chromatic CTAs (mist `#e6e6e6` fill), inset "key light" instead of drop shadows, glass nav with blur(48px) and a 1 px `#363739` border. | canvas `#040506`, card `#07080a`, well `#111214`, badge `#1b1c1e`, accent `#ff6363`, body `#9c9c9d`, muted `#6a6b6c`; Inter + Geist Mono 10 to 14 px for technical labels; radius 8 controls, 16 to 20 cards. |
| **Vercel / Geist** | "The ink IS the brand": `#171717` with no accent colour; Geist capped at weight 600; hairlines `#ebebeb`/`#a1a1a1`; layered soft shadows; mesh gradients only at hero scale. | radius 8, tracking -2.4 px at 48 px display. |
| **Ledger** | "Light is the personality of security." Grid as foundation, iconography as language, retrofuturism, "emotional technology" via entropy and organic forms. Fonts: Brut Grotesque (apps), HM ALPHA MONO (tags and highlights). Redesigned Ledger Wallet centres on what you own, not charts. | A warm light source on dark hardware = security with life. Mono for tags only. |
| **Mullvad** | Clear binary state: green locked padlock = secured, red unlocked = unsecured, one big connect button; optional monochrome tray icon for colour-blind users. Reviewers call the UI plain and dated, but the state clarity is the lesson. | State colour carries meaning, nothing else does. |
| **Signal** | Documented brand blue (`#3A76F0`, "ultramarine"), "Say hello to privacy", "Speak freely". Functional, no theatre. | Do not use blue as the accent; it is Signal's and every bank's. |
| **Proton / Lumo** | Proton purple `#6D4AFF` ("bold, works on light and dark"); Lumo is a purple cat with a keyhole collar, "Lumojis", hourglass/thoughtful/ruffled loading states; privacy framed as "stepping into Lumo's world". Deliberately warm, anti-Big-Tech. | The companion route works, but purple + mascot is now the most-copied private-AI look. |
| **Brave, Tor** | Brave orange `#FB542B`; Tor purple `#7D4698` + green `#68B030`, onion motif. | Avoid purple entirely. |
| **1Password (Knox design system)** | Evolving corporate system for XAM and AI; public docs withhold tokens. | Nothing distinctive to borrow. |
| **Apple Private Cloud Compute** | Sells verifiability, not vibes: custom silicon, hardened OS, "inaccessible even to Apple", ephemeral processing. Marketing shows the chip and the sealed enclave, not shields. | Proof over promise; the chip as the trust object. |
| **Airplane AI (indie, macOS)** | "The on-device AI that even works in airplane mode." Proof: open Activity Monitor, filter the app, "watch bytes-sent stay at zero"; entitlements in plain XML with no network key; "Policy is easy to change. This is not a policy." | The strongest 2026 trust pattern for our exact category. |
| **Locally AI, Private LLM, PocketPal, OnDevice LLM, Flightmode AI** | "Offline. Private. No login." Provider logo badges (Llama, Gemma, Qwen, DeepSeek, Granite). "Airplane mode works" listed as a feature. Mostly plain native UI. | Model cards with provider identity and size; the airplane test as onboarding ritual. |
| **Venice AI** | Tiered privacy language (Anonymized, Private, TEE, E2EE), "Start creating. Privately." | Tiered, legible protection levels. |
| **Industrial / tactical HUD trend** | Dark-only, monospace as architecture, ASCII brackets, crosshairs, scanlines, phosphor green `#33ff66`, 2 px hard borders, offset shadows. Berkeley Mono and Departure Mono "went from niche to default on engineering sites". Works for creator/indie tools; fails for banking, health, broad productivity ("zero novelty" contexts). Accessibility warning on contrast and pixel fonts. | Use as a costume on the proof layer only, never on the reading layer. |

Synthesis: security in 2026 is monochrome authority (tinted near-black, hairlines, one rationed accent, inverted white CTA), monospace where numbers matter, and a single unmistakable state colour. Power is visible compute (tokens/s, memory, chip) and a warm light source. Cheese is shields, padlocks on everything, purple, sparkles, glow.

### 2.3 Typography candidates

| Face | Licence | Why | Risk |
|---|---|---|---|
| **IBM Plex Sans + Plex Mono** | OFL (free) | One engineered family for UI and telemetry; Plex Sans Hebrew and Arabic exist, so RTL locales stay on-brand. Reads "instrument", not "startup". | Slightly bookish at large display sizes; tighten tracking. |
| **Geist + Geist Mono** | OFL | The 2026 dev-tool voice; excellent mono. | Strongly Vercel-coded. |
| **JetBrains Mono** | OFL | Most legible mono at 11 to 12 px. | Fine as the mono if Plex Mono feels too wide. |
| **Berkeley Mono** | Paid (U.S. Graphics) | Linear-grade credibility for chips and readouts. | Licence cost; only if the brand budget exists. |
| **Departure Mono** | Free | Pixel-mono for the HUD costume. | Readability below 14 px; costume only. |
| **Space Grotesk** | OFL | Characterful. | Crypto-2022 association. |
| **Inter** | OFL | Linear and Raycast still use it well. | Named as a "tell" by two of the top skills; only with cv11/ss03 features and a strong mono partner. |

Choice for FARADAY: IBM Plex Sans (UI, body, display) + IBM Plex Mono (telemetry, labels, model IDs). Alternative pair: Geist + JetBrains Mono.

### 2.4 Iconography and micro-interactions that convey trust without cheese

- **One state object.** Copy Mullvad's logic, not its look: a single Seal ring whose colour and closure encode "sealed / on-device" vs "unsealed". Padlock glyph appears only inside that ring, nowhere else.
- **Chip glyph instead of shield.** A small SoC/NPU square with pins is the trust icon ("runs on this chip"). Shields are what every VPN ad uses.
- **Numbers as proof.** Monospace readouts: `OUT 0 B  IN 0 B`, `MODEL qwen3-4b Q4_K_M  3.1 GB`, `41 tok/s`, `CTX 3.2k / 32k`. Numbers users can verify beat adjectives.
- **The airplane test as a ritual.** Onboarding step: "Turn on Airplane Mode. Ask me anything." The app keeps answering; the Seal stays green. On Android, ship without the `INTERNET` permission if the model is bundled or imported by file; the OS then cannot open a socket at all, and the manifest is public (Exodus-style reports show it). On iOS there is no network permission, so the airplane test is the proof. If the app downloads model weights, say exactly that: "Downloads weights once. Never uploads." (see open decisions).
- **Lock animation with a haptic.** Seal closes with a rigid impact haptic when the model finishes loading; that moment is the peak of onboarding (Peak-End rule).
- **Trade-off microcopy** per the privacy-pattern guides: "Location: OFF. Nothing is stored." Never "improve your experience". Default to collect nothing; there is no telemetry toggle because there is no telemetry.
- **No sparkles.** The "AI is working" signal is the ring breathing in amber, not a shimmer border or sparkles.
- **Model cards as cartridges.** Physical-feeling modules with size, quantisation, expected speed on this device, and a small LED-like state dot. Loading fills a hairline progress bar inside the card.

### 2.5 iOS 26 Liquid Glass and Android 16 Material 3 Expressive: cross-platform rules

- **Liquid Glass** (iOS 26, since WWDC25): a lensing, refracting material for the navigation layer only (tab bars, toolbars, floating pills and FABs, sheets, popovers, menus). Never on content, lists, media or full-screen backgrounds. Variants `.regular` (default), `.clear` (over media, needs a dimming layer), `.identity`. Reads far more strongly in dark mode than in light. App icons are layered (Icon Composer) and must work in light, dark, clear and tinted modes. Apple's own guidance: show hierarchy between content and controls.
- **Material 3 Expressive** (Android 16, Pixel from Sept 2025, broad rollout by Dec 2025): 35 new shapes with shape morphing, spring-physics motion (Expressive scheme with visible overshoot, Standard scheme without), emphasised type styles, new components (button groups, FAB menu, floating toolbar, split button, a new loading indicator for waits under 5 s), dynamic colour from wallpaper. Backed by 46 studies with 18,000+ participants.
- **Implication for one app on both:** keep the brand in the content layer (message list, seal, cards, composer) and let the chrome be platform-native: glass tab bar and sheets on iOS; floating toolbar, shape-morphing FAB and springs on Android. Motion: use Standard/critically damped springs for security-critical states (seal, breach), Expressive overshoot only for delight moments (first seal, new-chat FAB).
- **Dynamic colour:** opt out on semantic surfaces. A security brand cannot let the wallpaper recolour the Sealed state. Allow tint only on non-semantic neutral surfaces if at all.
- **Dark-first.** Glass reads better dark, the reference brands are dark, the category (Mullvad, Ledger, Raycast, Linear) is dark. Ship a light theme (tokens below) but default to dark and design there first.
- **Radii:** iOS 26 concentric rule (inner radius = outer radius minus padding); M3E fully-rounded buttons. Our scale (4/10/14/20/pill) maps to both.

### 2.6 Reference designs (links)

Real products (strongest references):
- Proton Lumo design story: https://proton.me/blog/lumo-design (mascot route, feedback animations).
- Airplane AI: https://airplane-ai.franzai.com/ (proof-over-promise copy, airplane motif).
- Locally AI: https://locallyai.app/ (model provider badges, "Offline. Private. No login.").
- Venice AI: https://venice.ai/ (tiered privacy levels).
- PocketPal AI: https://github.com/a-ghorbani/pocketpal-ai (open source, React Native Paper UI).

Concept shots and libraries:
- Dribbble, "AI Assistant, Dark Mobile App" (Masum Parvej / Halal Lab): https://dribbble.com/shots/25304018-AI-Assistant-Dark-Mobile-App
- Dribbble, "SmartLens, AI Chat App" (encryption-framed chat): https://dribbble.com/shots/25337249-SmartLens-AI-Chat-App
- Dribbble, "AI Chat Room Mobile App Redesign Concept": https://dribbble.com/shots/27088062-AI-Chat-Room-Mobile-App-Redesign-Concept
- Dribbble, "AI Assistant App Concept" (Ronas IT): https://dribbble.com/shots/21098156-AI-Assistant-App-Concept
- Behance, "Redesigning Mullvad VPN": https://www.behance.net/gallery/74594901/Redesign-of-Mullvad-VPN-apps
- Behance, "Kotoba, Secret Messaging App, UI/UX Case Study 2026" (via search): https://www.behance.net/search/projects/messaging%20app%20case%20study
- Mobbin, Signal iOS screen: https://mobbin.com/screens/4405bfb8-08c0-4257-a40e-1abce9a164e9 and Signal iOS flow: https://mobbin.com/flows/9eeb3c0d-3fc8-4532-928c-5d75b9d47fc4
- Mobbin, 1Password Android screen: https://mobbin.com/explore/screens/55c647cd-3312-4fbf-bcd7-be37498a5ac6
- Design-token extracts: Linear https://www.webdesignhot.com/design.md/linear/ ; Raycast https://styles.refero.design/style/3b6a17f0-3bdf-418c-a95e-0b89e5a8b2f8 ; Vercel https://www.shadcn.io/design/vercel

### 2.7 Proposed design system: FARADAY

**Thesis.** The phone is a Faraday cage for your thoughts: nothing gets in, nothing gets out, and that is physics, not policy. The app looks like a sealed instrument with a powerful light inside. Two layers: a calm **reading layer** (the chat) and a precise **proof layer** (seal, telemetry, model vault). The AI signal is the seal breathing, never a shimmer.

**Palette (dark, default)**

| Token | Hex | Use |
|---|---|---|
| `bg` | `#0A0D11` | App background (cold graphite, never pure black) |
| `surface-1` | `#12161B` | Cards, user message container |
| `surface-2` | `#181D23` | Elevated cards, chips |
| `surface-3` | `#1E242B` | Sheets, menus (under platform glass on iOS) |
| `well` | `#0E1115` | Composer field, code blocks, inputs |
| `border` | `#1F262E` | Default 1 px hairline |
| `border-strong` | `#2E3842` | Focused or interactive hairline |
| `text` | `#EEF2F5` | Primary text (18:1 on bg) |
| `text-2` | `#9AA6B2` | Secondary (about 8.5:1) |
| `text-3` | `#667380` | Captions, timestamps (about 4.6:1) |
| `accent` "Filament" | `#F0B35B` | Power: seal glow while generating, key numbers, links, focus ring, the one warm light. Never a button fill. |
| `sealed` | `#3ECF8E` | Semantic only: seal ring closed, "ON-DEVICE" label, state dot. Never decorative, never a button. |
| `danger` "Breach" | `#F25555` | Unsealed state, destructive actions, errors |
| `warning` | `#F0B35B` with triangle glyph | Shares the accent; always paired with the icon and a label |
| `cta-fill` | `#E6EAEE` | Primary button fill (inverted, like Linear/Raycast), text `#0A0D11` |
| `glow-filament` | `rgba(240,179,91,0.35)` blur 24 px | Only behind the seal while generating |
| `bloom-sealed` | `rgba(62,207,142,0.25)` blur 16 px | 600 ms after sealing, then off |
| `mesh` | `#FFFFFF` at 3 % , 1 px dots, 8 px pitch | Faraday mesh texture on vault surfaces only, never behind chat text |

**Palette (light)**

| Token | Hex |
|---|---|
| `bg` `#F3F5F7`, `surface-1` `#FFFFFF`, `surface-2` `#EEF1F4`, `well` `#E9EDF1`, `border` `#DDE3E9`, `text` `#12161B`, `text-2` `#4A5560`, `text-3` `#6B7682` |
| `accent` text/icon `#8F5309` (fills and glow keep `#F0B35B`), `sealed` text `#0B7A4C` (fill `#3ECF8E`), `danger` `#C93A3A`, `cta-fill` `#12161B` with text `#F3F5F7` |

**Type (IBM Plex Sans + IBM Plex Mono, 4 px base)**

| Role | Size / line | Weight | Tracking |
|---|---|---|---|
| Display (onboarding) | 32 / 38 | 600 | -0.02 em |
| Title | 22 / 28 | 600 | -0.01 em |
| Heading | 17 / 24 | 600 | 0 |
| Body (chat) | 16 / 25 | 400 | 0 |
| Body small | 14 / 20 | 400 | 0 |
| Caption | 12 / 16 | 500 | 0 |
| Mono readout | 12 / 16 Plex Mono | 400 | 0 |
| Mono label | 11 / 14 Plex Mono, uppercase | 500 | +0.08 em ("SEALED", "ON-DEVICE", "41 TOK/S") |

Chat line length 65 to 72 characters; message column max 680 px on tablet and desktop. Never use the mono face for paragraphs.

**Radius:** 4 (chips, state dots), 10 (buttons, inputs), 14 (cards, user message), 20 (sheets, model cartridges), 9999 (seal, pills). Nested elements follow the concentric rule.

**Spacing:** 4-pt scale 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Phone gutter 16 (20 on large phones). Composer min height 44, send target 44.

**Key motifs**

1. **The Seal** (signature element). A 28 px ring in the header (72 px on the empty state and onboarding). States:
   - *Loading model:* ring drawn as a dashed arc filling clockwise (progress), label "LOADING 3.1 GB".
   - *Sealing:* the last gap closes with a 420 ms near-critically-damped spring, one rigid haptic, a 600 ms `bloom-sealed`, label "SEALED · ON-DEVICE" in `sealed`.
   - *Generating:* the ring breathes (opacity 0.6 to 1.0, 1.6 s ease-in-out) with `glow-filament`; tokens/s counts in mono beside it. This is the app's entire "AI is thinking" language.
   - *Idle sealed:* static green ring, no glow.
   - *Breach / unsealed:* ring cracked open, `danger`, label "UNSEALED", with the reason (only possible if a future cloud option is ever enabled; designing it makes green mean something).
   - Reduced motion: static ring plus a text label; no breathing, no bloom.
2. **Chip glyph.** 12 px rounded square with 4 pins per side and an inner square. Used in the model chip in the header ("QWEN3 4B" + chip), model cartridges, and the "runs on this chip" line in onboarding.
3. **Zero-egress readout.** In the session drawer and in Settings → Proof: `OUT 0 B · IN 0 B · CONNECTIONS 0`, plus the "Airplane test" button that walks the user through it.
4. **Ledger strip.** A collapsed hairline "receipt" under each assistant message (long-press or chevron): model, quantisation, context used, ms per token, generation time. Deference: collapsed by default.
5. **Model vault.** Model cartridges on a mesh-textured surface: name, provider, size, quant, expected tok/s on this device, state dot, "Loaded" filament bar.
6. **Faraday mesh.** The 3 % dot grid on vault and onboarding surfaces, used sparingly.

**Animation principles**

- Motion explains; it never performs. Durations 120 ms (hover/press), 180 ms (state), 280 ms (sheet), 420 ms (seal). Ease-out on enter, ease-in on exit. No bounce except the seal-close and the Android FAB morph.
- The AI indicator is the seal breathing; no shimmer borders, no sparkles, no persistent badge after the result (Apple's rule applied to our own signal).
- Streaming: tokens render as they arrive, no artificial typing throttle; 2 px `text` caret blinking at 600 ms; a pulsing dot in the queued window (200 ms to 2 s before the first token); Stop button visible during the stream and gone the instant it ends; history messages get a 180 ms fade only after the stream ends.
- Markdown: buffer incomplete syntax; code blocks render as plain text until the closing fence, then highlight in one pass; container grows without shifting siblings; auto-scroll only within 100 px of the bottom.
- Haptics: rigid on seal, warning on breach, none during streaming. No sounds by default.
- Respect `prefers-reduced-motion` (transforms become opacity), keyboard focus ring 2 px `accent` at 60 % with 2 px offset, `aria-live="polite"` on the stream.

**Chat anatomy**

- Header: left "Chats", centre Seal + "Sealed" label, right model chip (tap opens the vault sheet).
- Assistant message: no bubble. Full-width flat text on `bg`, left-aligned, preceded by a mono label line `QWEN3 4B · ON-DEVICE · 41 TOK/S` in `text-3`. Actions (copy, regenerate, ledger) appear on long-press.
- User message: right-aligned, `surface-1`, radius 14 with a 4 px bottom-right corner, no tail, max 85 % width.
- Composer: docked, `well` field with 1 px `border`, focus border `accent` at 60 %, grows to 6 lines, mic and attach buttons in `text-2`, send is a 36 px circle in `cta-fill` with an up arrow (no chromatic CTA). Above it a 2 px context meter hairline (used vs. window) in `text-3` that turns `accent` past 80 %.
- Empty state: 72 px Seal, model name, "Nothing leaves this phone." and three quiet suggestion chips in `surface-2`.
- Thinking or tool steps: collapsed row "Reasoning · 1.2 s" in `text-3`.

```
┌──────────────────────────────────────┐
│ Chats        ◯ SEALED       [▣ QWEN3]│  header (platform chrome)
├──────────────────────────────────────┤
│ QWEN3 4B · ON-DEVICE · 41 TOK/S      │  mono label, text-3
│ Here is the summary you asked for... │  assistant, flat, body 16/25
│ ▸ Ledger                              │  collapsed receipt
│                                       │
│                 ┌────────────────────┐│
│                 │ Summarize this pdf ││  user, surface-1, r14
│                 └────────────────────┘│
│ QWEN3 4B · ON-DEVICE                  │
│ Working on it ▍                       │  streaming + caret, seal breathing
├──────────────────────────────────────┤
│ ▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂ │  context meter hairline
│ [+] [🎤]  Message…               (↑) │  composer, well, r10
└──────────────────────────────────────┘
```

**App icon.** A closed ring on graphite with a single filament highlight at 2 o'clock; layered for Liquid Glass (ring, glow, base) and as an Android adaptive icon; must survive the tinted and clear iOS modes and a 48 px silhouette.

**Do / don't**

- Do: one accent, one semantic green, inverted white CTAs, hairlines over shadows, mono only for numbers and labels, platform chrome, proofs users can verify.
- Don't: purple anywhere, sparkles, shimmer borders, gradient text, orbs, shields, padlocks outside the seal, cards inside cards, grey text on colour, pure black, bounce on security states, constant animation.

### 2.8 Three alternative directions

- **TITANIUM LEDGER.** No accent at all: ink and mist only (Vercel/Raycast school), authority through heavy grotesk type, machined textures and photo-real hardware. Security by austerity, power by typographic weight. Risk: reads as a developer tool and can feel cold to consumers.
- **KEEPER (companion vault).** The Lumo route with a different animal and no purple: a creature that lives inside the phone and keeps secrets, warm dark palette, rounded shapes, expressive loading faces, M3E springs. Strongest for mainstream consumers and app-store screenshots. Risk: weaker on "power", and mascots are the most copied private-AI pattern of 2025 to 2026.
- **TACTICAL HUD.** Full industrial telemetry: mono everywhere, bracket framing, crosshairs, scanlines, phosphor amber on black, Departure Mono display. Maximum "classified" energy and highly distinctive. Risk: the trend guides say it fails for broad audiences and ages fast; accessibility needs constant policing; it is a costume, so keep functional infrastructure underneath.

### 2.9 Open decisions for the founder

1. **Model delivery.** Bundled model (true zero-network app, Android can ship without `INTERNET` permission), in-app download ("downloads once, never uploads": honest but weakens the absolute claim), or user file import. This decides how strong the proof layer can be.
2. **Light theme scope.** Full parity, or dark-only with a light "reading" variant for the chat only.
3. **Berkeley Mono licence** for the readouts, or stay with Plex Mono.
4. **Breach state.** Keep it as a designed-but-unreachable state, or drop it if the app will never have any network path.

---

## Sources

Claude skills and tooling
- https://github.com/anthropics/skills
- https://github.com/anthropics/skills/tree/main/skills/frontend-design
- https://www.skills.sh/anthropics/skills/frontend-design
- https://www.anthropic.com/news/claude-design-anthropic-labs
- https://techcrunch.com/2026/04/17/anthropic-launches-claude-design-a-new-product-for-creating-quick-visuals/
- https://github.com/pbakaus/impeccable and https://www.skills.sh/pbakaus/impeccable/impeccable and https://impeccable.style/slop/
- https://github.com/emilkowalski/skills
- https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- https://github.com/vercel-labs/skills and https://github.com/vercel-labs/agent-skills
- https://github.com/Dammyjay93/interface-design
- https://github.com/ibelick/ui-skills
- https://github.com/mblode/agent-skills
- https://github.com/ceorkm/mobile-app-ui-design
- https://github.com/awesome-skills/mobile-app-design
- https://github.com/superdesigndev/superdesign-skill
- https://github.com/google-labs-code/stitch-skills
- https://github.com/master5d/claude-design-skills
- https://github.com/wshobson/agents
- https://github.com/figma/mcp-server-guide
- https://github.com/Prisma-Labs-Dev/apple-skills , https://github.com/haider-nawaz/liquid-glass-skill , https://github.com/conorluddy/LiquidGlassReference
- https://github.com/hamen/material-3-skill , https://github.com/Albermonte/android-skills
- https://github.com/VoltAgent/awesome-agent-skills , https://github.com/ComposioHQ/awesome-claude-skills , https://github.com/BehiSecc/awesome-claude-skills , https://github.com/travisvn/awesome-claude-skills
- https://pasqualepillitteri.it/en/news/576/claude-code-skills-design-uiux-guide
- https://uxplanet.org/must-have-ux-ui-design-skills-for-claude-code-364e93e3a614
- https://snyk.io/articles/top-claude-skills-ui-ux-engineers/
- https://www.firecrawl.dev/blog/best-claude-code-skills

AI visual language 2026
- https://www.groovyweb.co/blog/ui-ux-design-trends-ai-apps-2026
- https://elements.envato.com/learn/ux-ui-design-trends
- https://tubikstudio.com/blog/ui-design-trends-2026/
- https://www.intuitia.tech/blog/app-design-trends
- https://artofstyleframe.com/blog/designing-for-apple-intelligence-ui-2026/
- https://www.aiuxdesign.guide/patterns/privacy-first-design
- https://www.setproduct.com/blog/ai-chat-interface-ui-design
- https://thepromptbench.com/ai-product-ux/streaming-ui-patterns-that-dont-break/
- https://thefrontkit.com/blogs/ai-chat-ui-best-practices
- https://www.indiehackers.com/post/the-ai-purple-problem-why-every-ai-brand-looks-the-same-6cb0aa2a02
- https://www.925studios.co/blog/ai-slop-design-tells
- https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website
- https://mohitphogat.medium.com/ai-design-slop-why-every-ai-built-interface-looks-the-same-and-how-to-fix-it-bf874e0b470c

Security, privacy and power brands
- https://www.webdesignhot.com/design.md/linear/
- https://styles.refero.design/style/3b6a17f0-3bdf-418c-a95e-0b89e5a8b2f8 (Raycast)
- https://www.shadcn.io/design/vercel
- https://brand.ledger.com/brand-design/overview and https://brand.ledger.com/brand-design/typography and https://github.com/LedgerHQ/lumen
- https://mullvad.net/en/help/using-mullvad-vpn-app and https://www.behance.net/gallery/74594901/Redesign-of-Mullvad-VPN-apps
- https://signal.org/brand/
- https://proton.me/blog/lumo-design and https://proton.me/blog/new-visual-universe
- https://security.apple.com/blog/private-cloud-compute/
- https://airplane-ai.franzai.com/ , https://locallyai.app/ , https://venice.ai/ , https://github.com/a-ghorbani/pocketpal-ai
- https://apps.apple.com/us/app/ondevice-llm-offline-ai-chat/id6761696880 , https://apps.apple.com/us/app/flightmode-ai-offline-ai-chat/id6739451450
- https://www.setproduct.com/blog/retro-brutalist-ui-design-2026
- https://fireart.studio/blog/the-best-web-design-trends/
- https://madegooddesigns.com/best-monospace-fonts-2026/

Platforms
- https://developer.apple.com/videos/play/wwdc2025/219/ (Meet Liquid Glass)
- https://developer.apple.com/design/human-interface-guidelines
- https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/
- https://letsdev.de/en/blog/ios-26-in-detail-liquid-glass-ui-between-usability-and-accessibility.php
- https://blog.google/products-and-platforms/platforms/android/material-3-expressive-android-wearos-launch/
- https://supercharge.design/blog/material-3-expressive
- https://www.androidauthority.com/google-material-3-expressive-features-changes-availability-supported-devices-3556392/
- https://9to5google.com/2025/06/09/ios-26-android/
- https://www.androidcentral.com/apps-software/android-os/android-16-material-3-expressive-vs-ios-26-liquid-glass

Reference designs
- https://dribbble.com/shots/25304018-AI-Assistant-Dark-Mobile-App
- https://dribbble.com/shots/25337249-SmartLens-AI-Chat-App
- https://dribbble.com/shots/27088062-AI-Chat-Room-Mobile-App-Redesign-Concept
- https://dribbble.com/shots/21098156-AI-Assistant-App-Concept
- https://mobbin.com/screens/4405bfb8-08c0-4257-a40e-1abce9a164e9 , https://mobbin.com/flows/9eeb3c0d-3fc8-4532-928c-5d75b9d47fc4
- https://mobbin.com/explore/screens/55c647cd-3312-4fbf-bcd7-be37498a5ac6
