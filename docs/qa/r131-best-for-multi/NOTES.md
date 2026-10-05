# Round 131A: "Best for" takes several uses (simulator proof, 5.10.2026)

The founder: "many times I will want several things, say chat AND documents… if I choose everything it reduces the
number of models that fit." The vault's use picker is now multi-select; the language picker stays single.

## Rule

- A model is as good as its weakest picked use (`weakestUse`, `packages/core/src/catalog/recommend.ts`).
- With two or more uses, "good at all of them" (no picked use rated `weak`) is the first ranking key, above room and
  language, so the vault can draw one divider per section ("Not good at all of these"). Below it, today's keys in
  today's order, with the use key reading the weakest tier.
- With one use nothing changes: `rankModels` with `uses: [u]` is deep-equal to today's call for every use, every
  language (11 + unknown) and six test devices (`packages/core/test/fixes-r131.test.ts`). `deviceRecommendation` and
  every caller that passes no `uses` (onboarding, chat advice, chat Model sheet, web door) are untouched.
- No model good at all of them: the line "No model here is good at all of these. The closest come first." under the
  pickers, no divider, and no RECOMMENDED tag (it would contradict the line).
- Each card prints its tier for each picked use when two or more are picked, colored like the fit map (`tierColor`).
- The chip: "Chat", "Chat + Documents", past two "Chat +2". The last checked use cannot be unticked.
- Persistence: the single use was never persisted (`useState("chat")` since 4c89effb), so there is nothing to migrate;
  the vault still opens on Chat. The web vault has no Best for filter, left as is.

## Simulator

Simulator `r131-best-for-multi`, iPhone 17 Pro, iOS 26.2, created for this run and deleted afterwards. The founder's
iPhone was not touched and devicectl was not used. App: QA variant `com.inbornapp.mobile.qa`, Release for the
simulator, built from this worktree with the r129 recipe (`EXPO_PUBLIC_*` exported for `xcodebuild` too). No model
was downloaded (closed localhost base URL); Instant is the bundled one. Scripts in `scripts/`, run with
`node scripts/ios-qa.mjs <script> --out docs/qa/r131-best-for-multi/sim --simulator --device <udid> --bundle com.inbornapp.mobile.qa`.
The simulator reports 64 GB, so every chat model ranks; `s6` ran on a second JS bundle of the same native build with
`EXPO_PUBLIC_DEV_RAM_GB=4`, where only Instant ranks.

| Shot | What it shows |
|---|---|
| `00-chat` | Fresh install, onboarding with Instant, the chat |
| `01-vault-one-use` | Default: chip "Chat", no divider, no per-use line, Fast RECOMMENDED · CHAT IN ENGLISH: today's vault |
| `02-sheet-chat` | "What do you want to do?" / "Pick one or more.", eight rows, Chat checked |
| `03-sheet-chat-documents` | Documents ticked, the sheet stays open; behind it the vault already reorders |
| `04-vault-chat-documents` | Chip "Chat + Documents". On this device: "NOT GOOD AT ALL OF THESE" above Instant, whose card reads "Chat · Good   Documents · Weak". Fits: Sharp first, "RECOMMENDED ON THIS PHONE · CHAT + DOCUMENTS IN ENGLISH", "Chat · Best   Documents · Best" |
| `05-vault-chat-documents-fits` | Further down the Fits section: Fast and Phi, both good at both, no divider |
| `06-sheet-all` | All eight checked |
| `07-vault-all`, `08-vault-all-fits` | Chip "Chat +7". Sharp alone is good at all eight (eight tiers on its card); the divider sits above Fast (Code · Weak, Math & reasoning · Weak) |
| `09-sheet-last-stays` | Every row tapped once: only Math & reasoning stays checked |
| `10-vault-math` | Chip "Math & reasoning", single-use look |
| `11-4gb-vault-one-use` | 4 GB bundle, Chat: Instant RECOMMENDED · CHAT IN ENGLISH, as today |
| `12-4gb-chat-documents-none` | 4 GB bundle, Chat + Documents: "No model here is good at all of these. The closest come first.", Instant first with "Chat · Good   Documents · Weak", no tag |

## Unproven

- The non-breaking "Use · Tier" pairs (follow-up commit): shots 07/08 predate it and still show a pair split across lines; unit-tested only, the Build 36 device pass covers it.
- Android and the physical iPhone (only the iOS Simulator).
- Right-to-left layout and the seven translated locales on screen (strings checked by test for presence and placeholders only).
- A section whose first card is below the divider shows the divider right under the section header (`04`, On this device); judged acceptable, not reviewed by the founder.
