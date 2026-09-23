# Round 52 — design review fixes (F240–F254), 24.9.2026

The design review of 24.9 walked `origin/main` (af40796) headlessly and filed 3 blockers, 14 should-fix and 8 later
items. This folder is the before-and-after for each of them, shot the same way the review shot it: the web build
served on one port, driven with `chrome-headless-shell` through `playwright-core`, viewport 390 / 768 / 1024 / 1440
in dark and light, English, one persistent profile so the model stays in OPFS.

Screens need a device for the native shells, so the numbers below come from the browser tier, which is a shipping
tier and the one every measurement in the review was taken on.

| Folder | What |
|---|---|
| `before/` | `origin/main`, 114 images: eight routes × four widths × both themes (`<width>-<scheme>--<route>.png`), the interactive states (`i-…`: model sheet, attach sheet, typed, streaming, answered, ledger) and the four onboarding steps (`ob-…`) |
| `after/` | the same set on this branch |
| `site/` | `apps/site` home / terms / licenses / blog at the same four widths, before and after, plus the models band scrolled into view |
| `*.txt` | the measurements quoted below: `measure-*` (touch targets, contrast, horizontal scroll per route), `dim-*` (effective contrast of every dimmed line), `center-*` (nav-title centre vs viewport centre per locale), `strip-*`, `sweep-*`, `interact-*`, `onboard-*` |

## What the measurements say

**Touch targets, 390, dark** (`measure-before-390-dark.txt` → `measure-after-390-dark.txt`). Before: 19 segmented
chips at 36, six toggles at 32, the chat suggestion chips at 36, the header model chip 92×28, `Dismiss` 43×28, the
paywall close 40×40 and its `Terms` / `Privacy` at 16, `Get the app` 91×32. After: **nothing under 44 on any of the
twelve routes, in either theme.** The toggle keeps the spec's 52×32 track: it is drawn inside a 44 pt pressable,
because `hitSlop` is dropped by react-native-web and the browser is a shipping tier.

Merging `origin/main` brought one new offender with the browser strip (F239, stream fix-mosheai): its `Details`
button measured 56×28 on every route (`measure-merged-*.txt` was taken before that one line changed). It now
presses through 44, which costs no height because `Get the app` already makes the strip that tall. The merged
build measures clean: `measure-merged-390-dark.txt`, `measure-merged-390-light.txt`, zero targets under 44, zero
text under its contrast floor, no horizontal scroll, on all twelve routes in both themes.

**Dimmed rows** (`dim-before-*.txt` → `dim-after-*.txt`). Before: three failures in dark (2.76:1) and six in light,
worst 2.28:1, all of them the sentence that explains why a row is off. After: **zero failures in both themes.** The
row now dims its control and drops its label to `text2`; the explanation keeps full opacity, because no opacity
clears 4.5:1 for `text2` on `well` (0.5 → 2.22, 0.7 → 3.27, 0.85 → 4.55 — `apps/mobile/test/fixes-r52.test.ts`
pins the arithmetic).

**Documents nav title** (`center-before.txt` → `center-after.txt`), title centre vs the 195 px viewport centre at 390:

| Locale | Before | After |
|---|---|---|
| de | 171 | 195 |
| ja | 171 | 195 |
| fr | 165 | 195 |
| en | 195 | 195 |

**The empty chat** (`strip-after.txt`): the headline was 605 px down an 844 px viewport (72 %); it is now 501 and the
whole block (seal, model name, headline, chips) is centred in the list area. `before/390-dark--root.png` vs
`after/390-dark--root.png`.

**The site** (`site/`): home `scrollWidth` 778 at a 390 viewport and 793 at 768; both are now exactly the viewport,
and so is every page at both widths (twelve when the fix was written, thirteen after the merge added
`/accessibility`). `apps/site/check.mjs` measures it on every run and fails with the file and the offending
elements; reverting the one CSS line turns it red at both widths.

## Per item

| F | Item | Before | After |
|---|---|---|---|
| F240 | site scrolls sideways | `site/before-390-dark--home-models-band.png`, `site/before-768-dark--home.png` | `site/after-390-dark--home-models-band.png`, `apps/site/check.mjs` output |
| F241 | empty chat pinned to the composer, and onboarding S04 over 60 % empty with no back control | `before/390-dark--root.png`, `before/1440-dark--root.png`, `before/ob-390-dark-04-onboarding-lock.png` | `after/390-dark--root.png`, `after/1440-dark--root.png`, `after/ob-390-dark-04-onboarding-lock.png` |
| F242 | disabled rows fail contrast | `before/390-light--settings.png`, `dim-before-light.txt` | `after/390-light--settings.png`, `dim-after-light.txt` |
| F243 | touch targets under 44 | `measure-before-390-dark.txt` | `measure-after-390-dark.txt`, `measure-merged-390-dark.txt`, `after/390-dark--settings.png` |
| F244 | "Choose your model" offers no choice | `before/ob-390-dark-02-onboarding-model.png` | `after/ob-390-dark-02-onboarding-model.png` |
| F245 | Documents title off-centre | `center-before.txt` | `center-after.txt`, `after/390-dark--documents.png` |
| F246 | stop button in the breach red | `before/i-390-dark-05-streaming.png` | `after/i-390-dark-05-streaming.png` |
| F247 | sealed green on nine meanings | `before/i-390-dark-02-model-sheet.png` | `after/i-390-dark-02-model-sheet.png` |
| F248 | models you cannot pick at full weight | `before/i-390-dark-02-model-sheet.png` | `after/i-390-dark-02-model-sheet.png` |
| F249 | three competing empty messages | `before/390-dark--documents.png` | `after/390-dark--documents.png` |
| F250 | orphan section header on Work → Audit | `before/390-dark--work-audit.png` | `after/390-dark--work-audit.png` |
| F251 | the seal's filament fills its interior | `before/seal-generating.png` | `after/seal-generating.png` |
| F252 | the vault's dismissive action gets the button | `before/390-dark--vault.png` | `after/390-dark--vault.png` |
| F253 | web paywall drops the check bullets | `before/390-dark--paywall.png` | `after/390-dark--paywall.png` |
| F254 | the integrity mark renders as a square root | `before/proof-delivery-tick.png` | `after/proof-delivery.png` |

`before/proof-delivery-tick.png` is the review's own 2× crop of `390-dark--proof.png`; every other image in this
folder was shot by this stream.

## Not in this folder

The attach sheet's title and row hints, the legal preamble, the CJK section labels and the site's 44 px controls are
source and locale changes proven by `apps/mobile/test/fixes-r52.test.ts` and by the site gate; they show up inside
the same route screenshots above. Animation (the 420 ms seal close, the bloom, streaming motion) cannot be judged
from stills, and no native shell was exercised: this stream had no phone.
