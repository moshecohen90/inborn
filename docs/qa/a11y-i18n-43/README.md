# a11y-i18n-43: translated accessibility labels, the Proof network line on iOS, one voice in the capabilities card

Branch `a11y-i18n-43` from main 8a9b90cd, code commit ea308cd6.

## The three defects

| defect | root cause | fix |
|---|---|---|
| **F467** "Back" / "Close" in English inside the pt-BR UI | `components/shell/Screen.tsx:37` fell back to the literal `"Back"`; `components/shell/Sheet.tsx:33` and `components/chat/Sheet.tsx:53` had `accessibilityLabel="Close"`. A full scan also found `screens/chat/PersonasSheet.tsx:82` reading the icon id (`spark`, `scale`…) as the label | keys `a11y.back`, `a11y.close`, `personas.icon.*` in all 8 locales (+ pseudo). Guard `apps/mobile/test/fixes-a11y-i18n-43.test.ts` scans `apps/mobile/src` for literal English in `accessibilityLabel` / `accessibilityHint` / a component's `label="…"` (only the brand "Inborn" on the splash is allowed) |
| Proof says **"none (not in the manifest)"** on iOS | `proof/permissions.ts:19` gave the iOS (and web) Network row the Android state `none`, whose string is about the Android manifest's missing INTERNET permission. iOS has no manifest. The iOS delivery line named only Instant, and a later download hid it (`Proof.tsx:67-71`) | states `ios` and `web` with their own lines in all 8 locales. The manifest wording stays only on Android release builds. The iOS line now says Instant **and its photo pack** ship inside the app (`app.config.ts` `BUNDLED_IOS_MODELS` puts both in the IPA). It stays visible after a download |
| Capabilities card mixes grammatical person | `identity.answer.capabilities` opened "Inborn can…" (third person) and went on "I'll read it" (first person), in all 8 locales and Hebrew | the card speaks in the first person ("I'm Inborn, and I can…"), like the identity and offline cards. Inborn stays in the first sentence (round 134P). Test `packages/i18n/test/identity-card-person.test.ts` checks first-person markers and no third-person "Inborn" in every locale, plus a snapshot of every locale's texts |

## Simulator walk (8.10, 18:29–18:32)

- Release QA build of ea308cd6 (`com.inbornapp.mobile.qa`, the build-45 sim recipe).
- Run on a new simulator `a11y43-walk` (iPhone 17 Pro, iOS 26.2), created for this walk and deleted after it. Instant was bundled and no model server ran.
- `scripts/a11y-en.json` ran the onboarding and then the surfaces. `scripts/a11y-pt.json` switched the UI to pt-BR in Settings → Language and walked the same surfaces.
- `scripts/make-scripts.py` generates both.

| surface | en (tree label / text) | pt-BR | evidence |
|---|---|---|---|
| Back (Settings, Proof, About) | `back` → "Back" | "Voltar" | `screens/*-05-settings`, `*-06-proof`, `*-08-about` |
| Close, model sheet | "Close" | "Fechar" | `*-02-model-sheet` |
| Close, New chat sheet | "Close" | "Fechar" | `*-03-new-chat-sheet` |
| Persona icons | "Spark", "Scales", "Compass" | "Faísca", "Balança", "Bússola" | `*-04-persona-icons` |
| Proof, last delivery | "Instant and its photo pack ship inside the app · nothing downloaded" | "O Instant e o pacote de fotos dele vêm dentro do app · nada baixado" | `*-06-proof` |
| Proof, Network | "iOS has no such permission · used only for a download you ask for" | "o iOS não tem essa permissão · usada só para um download que você pede" | `*-06-proof` |
| Capabilities card | "What can you do?" → "I'm Inborn, and I can answer questions… Attach a PDF or a photo and I'll read it…" (`[chat] identity kind=capabilities lang=en`) | "O que você pode fazer?" → "Sou o Inborn e posso responder perguntas… Anexe um PDF ou uma foto e eu leio…" (`lang=pt-BR`) | `*-01-capabilities` |

`raw/result-a11y-en.json` and `raw/result-a11y-pt.json` hold every step and the accessibility tree dumps (`label` = accessibilityLabel).
en: 77/78 steps passed. pt: 62/63 passed. The one failure in each run is a `scrollTo perm-network` that has no scroll target on Proof. The row is in the dump and on the screenshot.
The pt card dump lists only the first card of the chat (the English one). The Portuguese card is on `pt-01-capabilities.png`.

## Not covered

- Android: no emulator run, by instruction. The Android Proof line is unchanged, and the unit test pins `none` for the release build.
- The six other locales were checked by the tests only, not on the simulator.
