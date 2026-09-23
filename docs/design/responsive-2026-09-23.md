# Responsive rules — 23.9.2026

One threshold, the one the shell already had: `WIDE_MIN = 760` (`apps/mobile/src/lib/layout.ts`). Below it nothing changes.

| Width | Content column | Stacked page actions | Onboarding |
|---|---|---|---|
| < 760 (phone) | full bleed, 16 px gutters | full bleed | full-height screen, footer pinned |
| 760–1039 (wide) | 680 px, centred | 420 px, centred | 480 px card, centred in the window |
| >= 1040 (desktop) | 680 px, centred, beside the 280 px sidebar and the 340 px panel | 420 px, centred | 480 px card, centred |

1. **680 for reading** is the message column §8.9 already specifies; reusing it means Settings, Legal, Proof, Vault, Documents and the chat all measure the same. At the shipped body size that is 75–85 characters, inside Bringhurst's 45–75 to 66-ideal band that current guidance still cites.
2. **420 for actions**, because a button's job is to be hit, not to span the window. The card is the exception: inside the 480 px onboarding card the action fills the card (448 px), since a 420 px button in a 480 px card reads as a mistake.
3. **The caps only ever shrink**, so they are decided from the window width even inside the sidebar shell, whose content area is always narrower. `contentMaxWidth`, `actionMaxWidth` and `cardMaxWidth` return `undefined` below 760.
4. **One place per rule.** `Screen` carries the column, the action cap and the card, so twelve screens inherit them; `Actions` carries the cap for CTAs that live in a screen body; Documents and Vault build their own root and wrap it in the same capped column.
5. **The composer is a baseline, not a box.** The field starts one line tall so the `[+]`, the mic and send share its bottom edge, and it grows with the text to six lines with those buttons still bottom-aligned.
6. **Nothing here re-skins anything.** No token, font or colour moved; only widths, centring and one field height.

RTL is not covered: Inborn ships en, de, es, fr, ja, ko, pt-BR and zh-Hant, none of them right-to-left. The rules are direction-agnostic (centred columns, no side-specific padding), so an RTL locale would inherit them.
