# F414, F415 · loops after round 107

Same engine, corpus, harness and yardstick as `before.md`: llama-server b10809, the llama.cpp server code wllama
compiles to wasm, with the app's system prompt, length line and token cap, thinking off, seeds 1 to 3.

## What ships

- **The answer samples exactly as in round 97**: repeat penalty 1.1 over 64 tokens, no DRY, no presence or frequency
  penalty. The request now carries those fields as zeros, and 24 of 24 answers (both models, four prompts, three
  seeds) were byte-identical to the round-97 request (`fidelity/zeros-same.py`). An answer that does not loop is
  unchanged.
- **The guard (F415) decides what reaches the screen.** Four rules, each checked at every point of the stream, with
  whatever may be the start of a copy held off screen until it diverges:
  - a phrase of 12+ code points (6+ CJK, kana or Hangul) twice back to back;
  - a sentence or line of 24+ code points said again anywhere, bullet and closing full stop aside;
  - ten words said again in the same order, with punctuation, markdown and line breaks ignored and a CJK character
    counting half (the echo rule: a poem line run into the next one, a list item said again with one word changed);
  - a short word or unit listed a fourth time.

  Repetition the user asked for (F389), a translation that keeps the source's repetition, a song's chorus line twice,
  data lines and code are allowed. On a loop the guard keeps one copy, takes back anything past it that was shown, and
  continues once, silently, with `LOOP_RETRY`: repeat penalty 1.15, DRY 1.0 / 1.75 / 2 / 4096, presence 0.15,
  frequency 0.05. Only a continuation that loops again ends with the round-86 notice.
- **DRY and presence/frequency reach all three engines**: wllama under llama-server's names, llama.rn as `dry_*`,
  `penalty_present` and `penalty_freq`, and the desktop's Rust sampler after the penalties (`cargo-engine-tests.txt`).
  Only the retry turns them on.

## F415 · the shipped configuration

The full stress corpus ran live with the guard of commit 8df329f0 and the shipped retry (`runs/guard-*.json`,
14:07 to 14:40). Each looping answer was stopped, cut to one copy and continued once; no continuation looped again.

| Model | Temp | Runs | Loops at the source | Runs with a repeat on screen | Most copies on screen | Cut by the guard | Silent retries | Notices | tok/s (median) |
|---|---|---|---|---|---|---|---|---|---|
| instant | 0.7 | 132 | 7 | 0 | 0 | 7 | 7 | 0 | 127 |
| instant | 0.2 | 132 | 16 | 0 | 0 | 16 | 16 | 0 | 124 |
| fast | 0.7 | 132 | 2 | 0 | 0 | 2 | 2 | 0 | 94 |
| fast | 0.2 | 132 | 8 | 1 | 2 | 7 | 7 | 0 | 110 |

| Model | Temp | Prompt #seed | Repetition in the raw answer | What reached the screen |
|---|---|---|---|---|
| instant | 0.7 | list25-verbs-de #3 | segment x2 `zu verstehen (verstehen)` | – · retries 1 |
| instant | 0.7 | ja-nenji #1 | segment x2 `**事業概況**: 当社の主要な事業部門や活動の範囲を示すもの` | – · retries 1 |
| instant | 0.7 | ja-nenji #2 | segment x8 `**「次期計画」は「次年度」で写す**：年次報告書として書くべきことは、` | – · retries 1 |
| instant | 0.7 | he-explain #3 | segment x2 `**תכונות עיצוביות:** פוטוסינתזה זו מ` | – · retries 1 |
| instant | 0.7 | poem-refrainless #2 | segment x4 `From storms that rage with fury to c` | – · retries 1 |
| instant | 0.7 | es-list #2 | segment x2 `No esperes a que las circunstancias ` | – · retries 1 |
| instant | 0.7 | es-list #3 | segment x3 `Tu potencial y valor son inmensos` | – · retries 1 |
| instant | 0.2 | ja-list-cities #3 | long x5 `県、鳥取県、山口県、福井県、宮城県、長野県、岐阜県、三重` | – · retries 1 |
| instant | 0.2 | ko-list #1 | segment x2 `떡볶이 (Tteokbeori) - 전라남도 지역 특유의 고기, 채` | – · retries 1 |
| instant | 0.2 | ko-list #3 | short x50 `, 국면` | – · retries 1 |
| instant | 0.2 | he-list #2 | short x20 `ה, קרואטי` | – · retries 1 |
| instant | 0.2 | he-list #3 | short x25 `, דפנס` | – · retries 1 |
| instant | 0.2 | cont-story #2 | segment x3 `But tonight, the water was too rough` | – · retries 1 |
| instant | 0.2 | cont-ja #1 | long x3 `」という名前の市街地が形成され、現在もその地域全体として「東京」と呼ばれ` | – · retries 1 |
| instant | 0.2 | cont-ja #3 | segment x3 `この移行過程で、多くの人が「東京＝江戸」のイメージを強く持っていたため、` | – · retries 1 |
| instant | 0.2 | math-long-div #1 | segment x3 `Since 123 > 98 and 123 > 97, we cann` | – · retries 1 |
| instant | 0.2 | math-long-div #2 | segment x2 `Since 12 is still greater than 21, w` | – · retries 1 |
| instant | 0.2 | es-list #1 | segment x4 `La mejor forma de aprender es enseña` | – · retries 1 |
| instant | 0.2 | es-list #2 | segment x2 `Tu potencial es infinito; la limitac` | – · retries 1 |
| instant | 0.2 | es-list #3 | segment x3 `El camino que no se ve bien a veces ` | – · retries 1 |
| instant | 0.2 | fr-list #1 | segment x7 `Une paire de baskets à chaussures` | – · retries 1 |
| instant | 0.2 | fr-list #2 | segment x2 `Un jouet en cuir ou en plastique dur` | – · retries 1 |
| instant | 0.2 | fr-list #3 | segment x2 `Une collection de livres jeunesse ou` | – · retries 1 |
| fast | 0.7 | list25-verbs-de #2 | segment x2 `**bleiben** – to stay/stay behind` | – · retries 1 |
| fast | 0.7 | ja-nenji #1 | segment x2 `この結果、当社の成長率は前年次より 5% 増加した` | – · retries 1 |
| fast | 0.2 | list30-animals #1 | segment x2 `Sea cucumber (various species)` | segment x2 `Sea cucumber (various species)` · retries 0 |
| fast | 0.2 | ko-list #1 | long x2 `, 불고기, 된장찌개, 떡볶이, 감자튀김, 소시지, 짬뽕, 찌개,` | – · retries 1 |
| fast | 0.2 | he-explain #1 | segment x5 `התהליך מתרחש בתוך המוחות של החורשים,` | – · retries 1 |
| fast | 0.2 | he-list #3 | short x27 `, תל אביב` | – · retries 1 |
| fast | 0.2 | cont-list #2 | segment x5 `Xigua (Watermelon) - *Note: Often gr` | – · retries 1 |
| fast | 0.2 | math-long-div #3 | segment x2 `$987 \div 123 = 8$ with a remainder ` | – · retries 1 |
| fast | 0.2 | fr-list #2 | long x2 `e, des voyages, des massages, des co` | – · retries 1 |
| fast | 0.2 | fr-list #3 | long x2 `, des voyages, des courses alimentai` | – · retries 1 |

One Fast answer at 0.2 still showed a repeat: `list30-animals` #1 numbered "Sea cucumber (various species)" as items 23
and 28. The final guard (bullet and item numbers stripped, the echo rule) cuts it; that was checked offline on the
same answer, and the full live phase was not rerun on the final code.

## F414 · DRY on the answer was measured, then rejected

With DRY 0.8 / 1.75 / 2 / 4096 and presence 0.15 / frequency 0.05 on every answer (off for asks that repeat on
purpose), no answer looped at the source (`runs/after-*.json`):

| Model | Temp | Runs | Loops at the source | Runs with a repeat on screen | Most copies on screen | Cut by the guard | Silent retries | Notices | tok/s (median) |
|---|---|---|---|---|---|---|---|---|---|
| instant | 0.7 | 132 | 0 | 0 | 0 | 0 | 0 | 0 | 127 |
| instant | 0.2 | 132 | 0 | 0 | 0 | 0 | 0 | 0 | 125 |
| fast | 0.7 | 132 | 0 | 0 | 0 | 0 | 0 | 0 | 105 |
| fast | 0.2 | 132 | 0 | 0 | 0 | 0 | 0 | 0 | 106 |

DRY cannot tell a loop from a repeat the answer needs. llama-server also counts the prompt (the question, the chat
history, the document passages), while llama.rn and the desktop count only the answer. Copy fidelity over 6 seeds at
0.7, where 1.0 means every required string came out exact (`fidelity/copy-ab.py`, `fidelity/self-ab.py`):

| Task | Instant r97 | Instant DRY + pres/freq | Instant pres/freq only | Fast r97 | Fast DRY + pres/freq | Fast pres/freq only |
|---|---|---|---|---|---|---|
| invoice number, issuer, signer from a document | 1.00 | 0.33 | 1.00 | 1.00 | 0.33 | 1.00 |
| fix a one-character JS bug, return the function | 0.89 | 0.52 | 0.91 | 0.78 | 0.37 | 0.71 |
| fix three typos, return the paragraph | 0.99 | 0.85 | 0.99 | 1.00 | 0.72 | 1.00 |
| quote a Japanese document | 0.94 | 0.67 | 0.83 | 0.83 | 0.72 | 0.83 |
| quote a Hebrew document | 0.88 | 0.50 | 0.71 | 1.00 | 0.71 | 1.00 |
| 5 order IDs in the format ORD-2024-000123 | 1.00 | 0.00 | 1.00 | 0.83 | 0.07 | 0.83 |
| a given Hebrew address in 3 messages | 0.28 | 0.00 | 0.44 | 0.44 | 0.00 | 0.17 |

What the DRY answers said: "ORD-2024-XXXXXX, ORD-2024-YYYYYY…" with a note that the IDs are placeholders;
"INV-2024–00871" with an en dash; "Oeyaran-Whitfield" and "Oyelara-whitfield"; "רחוב הנובאמ"י" for
"רחוב הנביאים"; the one-line loop fix rewritten with BigInt. The order-ID failure happens inside the answer, each ID
repeating the one above it, so llama.rn and the desktop would fail the same way. DRY also changed formatting at 0.7:
newlines per 1,000 characters fell from 13.6 to 11.7 on Instant and from 15.3 to 12.1 on Fast, and one list of 40
tips ran inline. Presence/frequency alone was mostly neutral but lost on Instant's Hebrew and Japanese quotes, so it
also stays in the retry.

## Retry tuning

Instant at 0.7, the five prompts that looped in the guard-only run, 15 runs and 7 retries each
(`retry-tuning/guard-instant-*.json`; the harsh row ran on all 132):

| Retry sampling | The continuation |
|---|---|
| repeat 1.2 / 256, DRY 1.5, presence 0.5, frequency 0.2 | meta-talk ("Okay confirmed: complete current block and finish there safely"), emoji, word salad ("enorme grande imposible nunca se puede imaginar…") |
| repeat 1.15 / 128, DRY 1.2 | on topic |
| DRY 0.8 | on topic; one list jumped from 29 to "130." |
| **repeat 1.15, DRY 1.0 (shipped)** | on topic, numbering kept |

Two continuations of the shipped row read "23. 24." and "29. 30.": the cut had left a bare item number and the
continuation numbered the next item. A cut no longer ends on a bare item number (two tests in `fixes-r107.test.ts`).

## Web

Instant in headless Chrome at 1440 on the web build (`e2e/trials.mjs`), a fresh chat per trial, every screen state
measured while it streams:

| Build | Trials | Trials with a repeat on screen | Silent retries | Notices |
|---|---|---|---|---|
| base (round 97 guard) | 28 | 4 | – | 0 |
| round 107 before the echo rule | 28 | 0 | 2 | 0 |

The two retries were es-list #3 and poem #1 (`shots/after-es-list-3-1440.png`, `shots/after-2-poem-1-1440.png`).
Poem #1's continuation ran a stanza on as one line with the line breaks dropped, which the yardstick does not count.
The echo rule was written for it and a test holds that exact text. The web trials were not rerun on the final build.

## The real-answers corpus: no false cut

`corpus-scan.test.ts.txt` replays 439 answers from every earlier round's evidence (60 of them with the user's message)
through the round-97 and round-107 guards, streamed 3 code points at a time (`corpus-scan.txt`).

- **8 cuts with the user's message, all visible repeats.** Examples: "アメリカの米ドルトムックンで、アメリカの米ドルトムックンで",
  "大阪・大阪・福岡・福岡・…", a list of 17 country names said twice in the same order, and a sentence that restates the
  question twice. The round-97 guard cut 3 of them.
- **2 more without the user's message** are asked repetitions (the fox sentence 3 times, a Chinese sentence 5 times).
  With the message they pass.
- **One false cut was found and fixed**: a name followed by its full form joined with "・"
  (ベネチア・コルポ・クラブ（ベネチア・コルポ・クラブ・ソープ・ラ・パルミサ）). A test holds it and the English equivalent.
- The slowest answer through the guard took 575 ms for its whole stream, on this Mac's Node.

## Replay: every stored answer through the final guard

`replay.test.ts.txt` streams every stored raw answer (the before and after runs and the web trials) through the final
guard and the yardstick (`replay.txt`): answers: 1064; yardstick and guard agree on a loop: 37; yardstick only (guard misses): 0; guard only: 23. The 23 answers only the guard cuts are
near-copies the yardstick cannot see: a list restarted from item 1, a sentence said again with one word changed,
"展望と目標（展望と目標）".

## Known limitation

A retried list sometimes goes on as prose: in web trial es-list #3 the numbering stopped after the cut. The answer
has no repeat, but the format drifts.

## Red first

`red-r107.txt`: this round's test file against the base commit, 55 of 57 failing. The base has no tail, segment or
echo rule, no retry, and no DRY fields. The two that pass are healthy texts the base also leaves alone.

## Files

- `stress.test.ts.txt`: the harness (in `packages/core/test/` as a `.test.ts`, with `loop-r97.ts.txt` as
  `zz-loop-old.ts`); `LS_PHASE` is `before`, `after` (the rejected DRY answer) or `guard` (the shipped configuration).
- `runs/`: every run; `table.py` builds the tables; `lists.py` counts list items.
- `fidelity/`: the copy-fidelity scripts and results (run against llama-server on ports 8957 and 8958).
- `retry-tuning/`: the retry sampling runs.
- `replay.test.ts.txt` and `replay.txt`: every stored answer through the final guard and the yardstick.
- `e2e/trials.mjs` with `e2e/*.json`, and `shots/*-1440.png`.
