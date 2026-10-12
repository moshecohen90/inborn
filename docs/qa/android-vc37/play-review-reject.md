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

`modelStep.test.ts` covers the failed option (kept with its reason, with and without a delivery plan).

## Proof

See the device walk recorded below this section once 1.0.0 (37) is on the phone: the sideload path (no Play, browser
download, open in Inborn, chat) and the Play path (install from the listing, Download Instant, chat).
