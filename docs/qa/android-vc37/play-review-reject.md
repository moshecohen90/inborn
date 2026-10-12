# Google Play rejected 1.0.0 (36): the model screen could go dead (12.10.2026)

Policy centre: "Broken Functionality policy: Unresponsive UI elements, such as buttons or icons", version code 36, enforced
12 Oct; the email adds one screenshot, `IN_APP_EXPERIENCE-7629.png`. Resubmission needs no appeal.

## What the reviewer saw

Left frame: Welcome, "RUNS ON: SM-A336E · 8 GB" (Samsung Galaxy A33 5G). Right frame: "Choose your model" with both cards,
Instant and Fast, at the disabled opacity (title luminance ~105 against 233 for the Continue label; the check mark on Fast
grey, not green), no red "Free up …" line, and the footer "Start chatting" disabled. No error text anywhere.

That is the onboarding step after Google Play failed to deliver a pack on that device: the vault puts the model into
`failed`, the step rendered a failed option as `disabled`, the footer offered no Try again, and the only error line was
component state that a remount forgets. The reviewer could tap nothing that answered. The Play error code itself was
never shown, so the screenshot cannot say which one it was.

## Fix (1.0.0 (37) to (39))

- A failed option stays selectable and prints the reason on the card, with Play's numeric code when there is one
  (`onboarding.model.failedLine`, `failureReason`). It stays on the screen even after Play has refused altogether.
- The footer offers "Try again · size" for a failed option.
- A Play fetch that rejects with the code in its message (a sideload gets `-15: Asset Pack Download Error(-15)`) now reads
  like the FAILED state would (`playFetchError`), so the card says "Google Play cannot deliver it on this phone" instead of
  raw Java.
- 1.0.0 (39), the decision that removes the failure itself: **Instant ships inside the Android install**, as it always has on
  iOS. `inborn_model` is an install-time asset pack (`app.config.ts`, catalog `mode: "install-time"`), so it arrives with
  the APK splits and no Play delivery call is ever made for it. The vault sees the pack as `bundled`, unpacks the model from
  the APK into its own directory on first boot without a tap (`PlayDelivery.unpackApk`, progress on the card: "inside the
  app · getting it ready"), hashes it, and the first chat never waits on Play. The install grows by the model's size and the
  model costs its size twice on disk (the APK keeps its copy); that is the price of a first run that cannot go dead. Fast,
  Sharp and the projectors stay on-demand through Play, with Try again.
- (37)/(38) also carried a route around the store for the onboarding step: a browser download of the catalog URL, opened with
  Inborn as the `.gguf` handler. It worked (proof below) but it is a developer's route, not a flow a normal user follows,
  so (39) takes it out of the model step. What it fixed underneath stays, for the vault's "import a model file": the router's
  native-intent hook hands every file open to the vault's handler (`offerOpenedFile`; a file with no importing screen up opens
  the vault), and Android content items are read through the ContentResolver in `vault-native` (magic check, size, streamed
  copy into a `.part`, then header and hash from the copy; one import per source at a time; no raw exception text on screen).

`modelStep.test.ts` covers the failed option and the bundled card; `playInstallTime.test.ts` the install-time pack (plan,
held, unpack once, left alone by the sweep); `store.test.ts` the boot unpack and the content:// import branch;
`bundleVision.test.ts` that Instant's pack is install-time and nothing is fast-follow; `test/native-intent.test.ts` the router
hand-off.

## Proof of (38): the browser route, walked (OnePlus 6T, Android 11, pt-BR, QA package beside the store build)

| Step | Seen |
|---|---|
| Sideloaded install, Continue, "Baixar Instant · 738 MB" | Card: "O download falhou: Erro do Google Play -100."; footer "Tentar de novo · 738 MB" + "Baixar pelo navegador · 533 MB"; the well names models.inbornapp.com and offers "Importar um arquivo de modelo" |
| "Baixar pelo navegador" | Chrome downloads `Qwen3.5-0.8B-Q4_K_M.gguf`, 532,517,120 B in about a minute on Wi-Fi; notification "Download concluído" |
| Open the download, "Abrir com" → Inborn (dev) | Model step stays up: "Importando o arquivo do modelo…", 533 MB copied in ~30 s, then a third card "Qwen3.5-0.8B · PRONTO AGORA · 533 MB · JÁ ESTÁ NESTE CELULAR" and "Começar a conversar" |
| Começar a conversar → Selado → Começar → (lock step) Começar | Chat with QWEN3.5-0.8B · SELADO; a suggestion sent; answer "Olá! Que tal um abraço simples de manhã? 😊" |
| Cold start from the file (app killed first), Continue | The held file is imported on the model step the moment it mounts |
| The same file opened again while the vault screen is up | Stays on the vault; no not-found |

Screenshots are in the private evidence folder for 12.10 (`6t-qa38d-*.png`).

## Proof of (39): Instant inside the install (OnePlus 6T, Android 11, pt-BR)

QA package (`com.inbornapp.mobile.qa`, `INBORN_PACKS=instant`) built as a bundle and installed with bundletool `--local-testing`,
the way Play installs it: splits `base, config.arm64_v8a, config.en, config.pt, config.xxhdpi, inborn_model`. Fresh install,
no Play delivery possible for this package.

| Step | Seen |
|---|---|
| Launch, welcome, "Continuar" | "Escolha seu modelo": Instant card "PRONTO AGORA · VEM DENTRO DO APP · NADA PARA BAIXAR" (unpacked during the welcome screen, no tap; its size line read 738 MB, Instant plus the projector it no longer brings, so a ready card now carries the model's own 533 MB, checked on the store build below); Fast card "RECOMENDADO · 1.28 GB · ENTREGUE PELO GOOGLE PLAY"; footer "Baixar Fast · 1.28 GB" with "Começar agora com o Instant" under it |
| "Começar agora com o Instant" → Selado → Começar → (lock step) Começar | Chat with SELADO · INSTANT, no download anywhere |
| Suggestion "Rascunhar uma mensagem", send | Answer generated on the device: "Como assistente virtual, posso escrever mensagens curtas e simpáticas para você: …" (three suggestions) |
| Fresh install again, "Baixar Fast · 1.28 GB" (Play cannot serve this package) | Fast card: "O download falhou: Algo deu errado. Tente de novo"; under the cards "O download não começou. O chat continua funcionando e você pode tentar de novo no cofre."; footer "Tentar de novo · 1.28 GB" with "Começar agora com o Instant" under it (`6t-qa39-s06-fast-failed.png`). No dead end: Instant is one tap away either way |

Screenshots: `6t-qa39-s01-welcome.png`, `6t-qa39-s02-model-included.png`, `6t-qa39-s03-sealed.png`, `6t-qa39-s04-chat.png`,
`6t-qa39-s05-answer.png` in the private evidence folder for 12.10.

### The store build, updated through Google Play (OnePlus 6T, internal track, 1.0.0 (35) to (39))

The real Play install, no bundletool: the Play Store page offered "Atualizar", and after the update `dumpsys package` reads
`versionCode=39`, `installerPackageName=com.android.vending`, `splits=[base, config.arm64_v8a, config.en, config.pt, config.xxhdpi,
inborn_model]`. This device had Fast installed through Play on (35), so it is also the upgrade path an existing user takes.

| Step | Seen |
|---|---|
| Cold start after the update | Opens straight into the chat, "SELADO · FAST": the model Play delivered on (35) is still in use (`6t-store39-s01-chat-fast.png`) |
| Model vault | Fast "Carregado · Em uso"; Instant "533 MB · Instalado · Usar este modelo", unpacked from the APK during boot with no tap and no download (`6t-store39-s02-vault.png`, `6t-store39-s03-vault-instant.png`) |
| Suggestion "Rascunhar uma mensagem", send | Answer generated on the device: "Como você parou a frase, eu não posso finalizar o pedido. Você gostaria de uma mensagem curta e simpática para: Um amigo? …" (`6t-store39-s05-answer.png`) |
