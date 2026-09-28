# F437 · round 117: photo packs per model, one-step hold card

Moshe (28.9.2026), web at 127.0.0.1:8787 with Fast selected: a photo offered Instant's 205 MB photo pack, then said
"FAST can't see photos. INSTANT can. Switch to it", then asked for Instant's 533 MB. This folder is the web check of
the fix: the worktree's `web:build` served by `PORT=8797 pn web:serve` (models from `~/dev/inborn/.models`), driven by
playwright-core in the headless Chromium shell, 1180×820, a fresh browser profile per scenario. The photo is
`scripts/fixtures/photo/red-circle-cat.png`; the question is "What colour is the shape in this photo, what shape is
it, and what word is written under it?". Results: `web-check.json`.

Tapping "Photo" closes the Attach sheet before the picker opens. On this layout the sheet fades out: opacity 1 at
the tap, 0.48 at 210 ms, gone at 299 ms. The card shots wait for the sheet to be gone, and a first run that did not
wait caught the card behind the fading sheet.

| File | What it shows |
|---|---|
| `01-fast-fresh-card.png` | A: fresh browser, Fast downloaded, photo sent. One card: "FAST needs its photo pack to see photos", "One 668 MB download, then this photo sends by itself.", "Download 668 MB", "Remove the photo". No 205 MB, and no Instant way out (Instant and its pack, 738 MB, cost more than 668 MB). |
| `02-fast-card-with-instant-alternative.png` | A: Moshe's browser after the bug, Instant's pack installed from the vault and Instant not. The same card with "Switch to INSTANT · 533 MB" in the actions row between the download and "Remove the photo", and under it "Smaller, but less accurate with photos." |
| `03-fast-pack-downloading.png` | A: after "Download 668 MB". One card, "Downloading the photo pack: 57 of 668 MB." over a 4 px progress bar. |
| `04-fast-answer.png` | A: the pack landed, the card left, the held message sent by itself, and Fast answered about the photo. |
| `05-vault-packs-per-model.png` | A: the vault's Extensions, one pack per model with its size. Instant's pack reads "Installed · 205 MB · Instant not downloaded", and Fast's "Installed · 668 MB". Sharp's pack is not listed, since this browser never gets Sharp. |
| `06-instant-pack-present-no-card.png` | B: Instant with its pack installed. The photo sends with no card, and Instant answers. |
| `07-send-with-instant-downloading.png` | C: Moshe's state, "Switch to INSTANT · 533 MB" tapped once. "Switching to INSTANT", "Downloading INSTANT: 57 of 533 MB." over the progress bar. |
| `08-send-with-instant-answer.png` | C: Instant landed, the page switched to Instant, and the held message sent by itself. No second tap. |
| `15-pack-card-390.png` | E: the card of shot 02 at 390 px wide. The three actions fit on two lines and the caption sits under them. |
| `16-pack-card-dark.png` | E: the card of shot 02 with `prefers-color-scheme: dark`. The card, its accent border and the outline button follow the dark theme. |

Engine lines from the console:

```
A  [wllama] loaded fast + projector in 2942 ms · threads=2 isolated=true gpuLayers=0 nCtx=4096
A  [wllama] photo turn · photos=1 ttft=103926 ms total=107140 ms tokens=23
C  [inborn] wllama loaded model INSTANT (instant) from opfs://models/instant.gguf in 1204 ms
```

Answers:

| Scenario | Model | Answer |
|---|---|---|
| A | Fast | The image shows a red circle with the word "CAT" written underneath in black letters. The shape is circular. |
| B | Instant | The shape in the photo is a circle, and the word under it is "G1". |
| C | Instant | The red circle above the Japanese text on a white background represents the traditional Japanese flag. The black characters below spell out "Japan" (in kanji). |

Fast read the word. Instant misread it in both runs, which is its own 0.8B quality (section D has five more photos).
Fast's first token took 103.9 s on 2 WASM threads. The card's time line carries Fast's number for browsers without
WebGPU. The headless shell exposes WebGPU with no adapter, so its card shows no time line, as in round 105.

Shots 15 and 16 load the page at their width or theme before the photo is attached. Resizing the window across the
phone and desktop breakpoint remounts the chat screen and drops a held photo card; this predates round 117.

## D · six photos per model, family-safe line out of the prompt

MosheAI's review of shot 08 found Instant's answer narrating the family-safe clause ("The request specifies not
generating graphic violence content, so I will focus on…"). The clause is gone from every photo turn and from every
Instant turn (`turnSystemPrompt` in `packages/core/src/chat/context.ts`). Family-safe mode is on, as by default. Each
photo went into a fresh chat with its own pack installed: the CAT fixture and five canvas photos in `photos/`. Each
screenshot shows Fast's turn on the left and Instant's on the right. The answers and the exact system prompts are in
`web-check.json` under `D`.

| Shot | Photo | Fast | Instant |
|---|---|---|---|
| `09-photo-cat.png` | red circle over "CAT" | The red circle is a circle, and CAT is written underneath it. | The shape in the image is a circle, and the word under it is "T". |
| `10-photo-receipt.png` | shop receipt, 5 lines, total 17.59 | The total is 17.59 and five items were bought. | The total amount is 17.59, with five items purchased: Milk 1L, Bread, Apples 1kg, Coffee beans, and Eggs x12. |
| `11-photo-street-sign.png` | "Maple Street", arrow right | The sign indicates that Maple Street is located to the right of where it stands. | The sign displays "Maple Street" and the arrow points rightward to indicate that traffic should go in that direction. |
| `12-photo-text-screenshot.png` | a paragraph on library hours | The library opens at 10 a.m. on Saturdays but is closed on Sundays. | Saturdays the library opens 10 a.m., while it is closed on Sundays. |
| `13-photo-menu-board.png` | café menu, cappuccino 3.40 | The cappuccino is 3.40. | The cappuccino costs $3.40 according to the cafe menu. |
| `14-photo-parking-sign.png` | no parking 8 AM – 6 PM, Mon – Fri | Parking is not allowed from 8 AM to 6 PM on Monday through Friday. | No parking from 8 AM to 6 PM on Monday through Friday. |

None of the 12 answers contains "The request specifies", "I will focus", "as an AI", "family-safe", "violence" or
"self-harm". Fast read all six correctly. Instant read five. It still reads "CAT" as "T", which is the 0.8B model's
limit, and it adds a "$" the menu does not show. Fast's first token took 65 to 104 s per photo, and Instant's 22 to
34 s.

Fast's text turn is the one place the short line remains ("Keep it family-safe." as the last sentence). Asked "Write two
sentences about a cat playing in a garden.", it answered two sentences about a kitten and did not mention the line.
