# android-vc25 — evidence for Play internal release versionCode 25

Built from `main` **b046b12b** (vc24 + 134N identity card, 134N2 Instant offline line, 134O live-data card, 134O2), uploaded
to the Play internal track as "1.0.0 (25)" and delivered to the **OnePlus 6T** by Google Play as an **update in place over
vc24**. The whole release walk ran on the phone. All seven packs (`INBORN_PACKS` unset).

The 6T (Android 11, 8 GB, pt-BR UI) is Moshe's own phone on his licence (owns Pro). Nothing was uninstalled or cleared, no
phone setting was changed. In the app, the chat model was switched to Fast for items a–c and back to Instant (Moshe's
setting) for d onwards. Left in the app: the test chats and the constitution in Documents. Removed at the end: the two
accessibility-driver packages, `/sdcard/Download/inborn-qa-constitution-9pages.pdf`, `/sdcard/Pictures/inborn-qa-door.jpg`.

## Verdicts

| row | verdict |
|---|---|
| build gates | **green**: `bundletool validate`, permissions (no INTERNET, 9 declared), `check-android-bundle.sh` (seven packs, both traineddata, no iOS assets), `check-qa-bridge.sh`, `INBORN_REQUIRE_BUNDLE=1 check-shipping-bundles.mjs`; upload-key signer `E7:02:C9:A9:…:ED:CD`; versionCode 25 / 1.0.0 / minSdk 26 / targetSdk 36; build info `b046b12bb24d`; the identity-card log line is in the bundle |
| upload | **committed** edit `16394351636904904989`, release "1.0.0 (25)"; fresh-edit read-back sha256 `be5e1555…26a7f5` equals the local file |
| Play update | **PASS**: Update offered at once; the accessibility driver's `click:Atualizar` started the download on the 6th reopen (19:47:41, about 7 min after the commit); versionCode 25 at 20:02:01, `firstInstallTime=2026-09-21 22:59:16` unchanged, installer `com.android.vending` |
| packs after the update | Play re-delivered the installed packs: for about 8 minutes the vault held 468 MB, the New chat sheet said "NENHUM MODELO NESTE CELULAR" and the banner "Entregando INSTANT/FAST"; then 5.23 → 5.38 GB, everything back. Same mechanism as F374 (vc23) |
| cold launch, About, Proof | **PASS**: no onboarding again, chats intact; About "1.0.0 (25)" `b046b12bb24d`; Proof "SAI 0 B · ENTRA 0 B", Internet "nenhuma · o app não tem permissão de internet" |
| (a) 17 × 23 on Fast | **PASS**: "The product of 17 multiplied by 23 is 391." No rule sentence (F460 not seen, 1 run) |
| (a) Hebrew on Fast | **RTL PASS**: "מה בירת צרפת?" → "הבירת צרפת היא פריז." right-aligned, header and chevron mirrored, strip "FAST é fraco em hebraico". "Answer in Hebrew: …" in English got an English answer; the vault lists Fast's Hebrew as "Nenhum" |
| (b) identity card | **PASS 6/6, all from the app**: "hey! what is this app?", "tell me about yourself", "who made you?", "what model are you?" → `[chat] identity kind=identity lang=en model=fast`; "what can you do?" → `kind=capabilities`; "מי אתה?" → `kind=identity lang=he`, a Hebrew card. About 6 s each, including the driver. **F461 (OpenAI) is gone** |
| (b) live-data card | **PASS 3/3**: weather today, last night's game, weather tomorrow → `[chat] offline kind=weather|scores lang=en`, no numbers |
| (b) "tips to sleep better" | **FAIL in the card chat, PASS fresh**: after the six cards and three offline cards in the same chat Fast refused ("I can't offer specific sleep advice…"), and the follow-up repeated the refusal before three tips (one of them "drink a glass of water right before lying down"). In a fresh chat: three good tips. **F464** |
| (c) attaching the PDF | the SAF picker by keys + driver: its search works only after a second submit; picked `inborn-qa-constitution-9pages.pdf`. No picker screenshots (the folder lists Moshe's own files) |
| (c) 134L pancake | **chip PASS, answer FAIL**: no SOURCES chip, strip "Nada nos seus documentos corresponde a esta pergunta. A resposta foi dada sem eles.", but the answer is only "Seus documentos não mencionam isso." with no recipe (`hits=6 used=0`). **F466**. The first answer waited more than 10 min behind a library rebuild (**F465**) |
| (c) 134I summary → shorter → 3 bullets | **PASS on chips**: summary "Resumo de todas as 9 páginas" with FONTES p. 1–2 … 7–9; "shorter" and "make it 3 bullet points" keep all four FONTES (`plain=follow-up`). Content: "only taxes go directly to the Treasury" and "treaties involving coinage" are not in the text. The summary took about 52 min (reading 2 pages per ~8 min at thermal status 3) |
| (c) 134K Ask sheet | **PASS**: "Who won the 1998 World Cup?" → "Seus documentos não mencionam isso." and "busca 7711 ms · 0 trechos", no generation |
| (d) photo, first message on Instant | **PASS**: house-exif.jpg (QA album) as the first message of a new chat → "A stylized cartoon house with a red roof and brown door against a light blue sky with a yellow sun." |
| (d) photo pack on Fast | **F463 confirmed on the phone**: the attach sheet offers "Baixar o pacote de fotos · 668 MB"; pressing it opens the vault card "Não é oferecido pelo Google Play. Baixe o arquivo no seu navegador e depois importe aqui." [Importar GGUF] |
| (e) purchases | **PASS**: paywall "VOCÊ TEM O PRO"; as an owner it lists only the Work upgrade (₪ 149,90, one-time); Restore → "Compra restaurada". No purchase |
| (f) vault / model sheet | **PASS**: model sheet and vault recommend Fast for this phone; Instant "Incluído no app" / in use; Fast, Sharp, document index "Instalado"; Instant photo pack "Incluído no app"; Fast/Sharp photo packs and Sharp-Phi "Não é oferecido pelo Google Play…" |
| (g) Stop | **PASS**: stopped a 600-word essay → partial kept with "Parado · Continuar"; Continue resumed (stop button back) but added two words in 20 s at thermal status 3 |
| (g) thermal | skin 40–47 °C, `mStatus=3` (severe) from the library rebuild onwards; no thermal or memory banner appeared in the app |
| (h) exploratory | Incognito: badge "ANÔNIMO · NÃO SALVO", answer trimmed by the echo net (`[chat] rule-echo kept 27/75 chars`). Accessibility labels in English inside the pt-BR UI (**F467**) |
| FGS dataSync video | **not recorded**: every Play-delivered pack (Instant, Fast, document index, voice, Sharp, Instant photo pack) is already installed on the 6T and nothing may be uninstalled. Play re-delivers all of them on the next app update (seen at 20:02–20:10), which is the moment to record |

## Defects

| id | severity | what |
|---|---|---|
| **F463** | High | Confirmed on the 6T: with Fast (the recommended model) the attach sheet offers "Baixar o pacote de fotos · 668 MB", which leads to a vault card saying it is not offered by Google Play and must be downloaded in a browser and imported as GGUF. `vision-qwen35-2b` has only an `https` delivery and there is no Play pack for it. `6t-c-01-attach-sheet-668mb.png`, `6t-d-02-fast-photo-pack-not-on-play.png` |
| **F464** | Medium | In a chat holding identity and offline card replies, Fast refused a harmless question ("tips to sleep better" → "I can't offer specific sleep advice…") and kept the refusal on the follow-up. The same question in a fresh chat is answered. One sighting. `6t-b-10-sleep-tips-refused.png`, `6t-b-11-sleep-followup.png`, `6t-b-12-sleep-fresh.png` |
| **F465** | Medium | After the update a 40-page library document (`vc21-northgate.pdf`) was rebuilt for 31 min (46.5 s/page, `[documents] … 1860840 ms`), and a question about a freshly attached 9-page file sat behind it for more than 10 minutes showing only "Estou lendo seu documento antes de responder…", with the phone at thermal status 3. `6t-c-03-pancake.png` |
| **F466** | Medium | Outside strict mode, with a file attached and nothing matched, the answer is only "Seus documentos não mencionam isso." while the strip above says it was answered without the documents; the user gets no recipe. vc24 on the emulator gave the recipe and then the line. `6t-c-03-pancake.png` |
| **F467** | Low | Accessibility labels are not localized: "Back" (Settings, Proof, About), "Close" (New chat sheet, model sheet) in the pt-BR UI |
| F460 / F461 | — | F460 not reproduced on the 6T (1 run); F461 fixed by the identity card |

## Files

| file | what it shows |
|---|---|
| `check-vc25.txt`, `perms.txt`, `shipping-bundles-gate.txt` | gates on the real AAB |
| `upload.txt`, `readback.txt`, `update25.txt` | upload, read-back, the Update presses and the package state before, after and at the end |
| `answers-6t.txt` | every question, wait, answer and `[chat]`/`[rag]` line of a–d |
| `6t-a-01` … `6t-a-08` | cold launch, About, Proof, the no-model sheet during re-delivery, 17 × 23, Hebrew |
| `6t-b-01` … `6t-b-12` | identity and live-data cards, the sleep refusal and its fresh retry |
| `6t-c-01` … `6t-c-07` | attach sheet (668 MB), PDF attached, pancake, summary, shorter, three bullets, Ask sheet 0 passages |
| `6t-d-01` … `6t-d-04` | the Fast photo-pack link and its vault card, the photo in the composer, the answer |
| `6t-e-01`, `6t-e-02` | paywall and Restore |
| `6t-f-00` … `6t-f-03` | vault before the switch, vault during re-delivery, model sheet, vault top |
| `6t-g-01` … `6t-g-05` | Stop, Continue, incognito |

Screenshots are 500 px tall; originals stay in the session scratch dir.
