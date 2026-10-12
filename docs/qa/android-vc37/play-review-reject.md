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

## Fix (1.0.0 (37))

- A failed option stays selectable and prints the reason on the card, with Play's numeric code when there is one
  (`onboarding.model.failedLine`, `failureReason`). It stays on the screen even after Play has refused altogether.
- The footer offers "Try again · size" for a failed option.
- Android gets the route around the store, which the app has carried since spec §7.2 but never offered here: "Download with
  your browser · size" opens the catalog's HTTPS URL on models.inbornapp.com in the browser; Inborn is the registered
  `.gguf` handler, so opening the finished download lands the file in the vault, which verifies it before use. "Import a
  model file" picks a file by hand. The app still opens no socket: the browser downloads, Inborn reads a file.
- The model step now listens for an opened `.gguf` like the vault screen does, so a file arriving during onboarding is
  taken.
- A Play fetch that rejects with the code in its message (a sideload gets `-15: Asset Pack Download Error(-15)`) now reads
  like the FAILED state would (`playFetchError`), so the card says "Google Play cannot deliver it on this phone" instead of
  raw Java.
- 1.0.0 (38): the first walk on a OnePlus 6T (Android 11) found two more holes behind the browser route. The finished
  download, opened with Inborn, reached the router as `content://media/external/downloads/<id>` and landed on the not-found
  screen; and expo-file-system cannot read a provider's `content://` item (the picker's either), so even a file that did
  reach the import answered "Not a valid GGUF file". The router's native-intent hook now hands every file open to the vault's
  handler (`offerOpenedFile`, held until the model step or the vault is up), and Android content items are read through the
  ContentResolver in `vault-native` (magic check, size, streamed copy, then header and hash from the copy). The import says
  "Importing the model file…" at once, the imported model becomes the selected card, and the footer reads "Start chatting".

`modelStep.test.ts` covers the failed option (kept with its reason, with and without a delivery plan); `playFetchError.test.ts`
the code mapping; `test/native-intent.test.ts` the router hand-off and the held file.

## Proof: the reviewer's path, walked (OnePlus 6T, Android 11, pt-BR, QA package beside the store build)

| Step | Seen |
|---|---|
| Sideloaded install, Continue, "Baixar Instant · 738 MB" | Card: "O download falhou: Erro do Google Play -100."; footer "Tentar de novo · 738 MB" + "Baixar pelo navegador · 533 MB"; the well names models.inbornapp.com and offers "Importar um arquivo de modelo" |
| "Baixar pelo navegador" | Chrome downloads `Qwen3.5-0.8B-Q4_K_M.gguf`, 532,517,120 B in about a minute on Wi-Fi; notification "Download concluído" |
| Open the download, "Abrir com" → Inborn (dev) | Model step stays up: "Importando o arquivo do modelo…", 533 MB copied in ~30 s, then a third card "Qwen3.5-0.8B · PRONTO AGORA · 533 MB · JÁ ESTÁ NESTE CELULAR" and "Começar a conversar" |
| Começar a conversar → Selado → Começar → (lock step) Começar | Chat with QWEN3.5-0.8B · SELADO; a suggestion sent; answer "Olá! Que tal um abraço simples de manhã? 😊" |
| Cold start from the file (app killed first), Continue | The held file is imported on the model step the moment it mounts |
| The same file opened again while the vault screen is up | Stays on the vault; no not-found |

Screenshots are in the private evidence folder for 12.10 (`6t-qa38d-*.png`). The Play path (install from the listing,
Download Instant, chat) is walked on the store build once 1.0.0 (38) is on the internal track.
