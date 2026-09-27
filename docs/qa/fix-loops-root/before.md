# F413 · loops before round 107 (r97 sampler and guard)

**Engine.** llama-server from llama.cpp build 10809 (Homebrew, Metal) on this Mac, one slot, 8192 context, `--jinja`
(the GGUF's own chat template). It is the same llama.cpp server code wllama 3.6.1 compiles to wasm, so the request
is the web adapter's request field for field: temperature 0.7, top_p 0.9, `repeat_penalty` 1.1 over 64 tokens,
thinking off. System prompt, answer-length line and token cap come from core (`composeSystemPrompt`,
`planAnswerLength`), exactly as the chat builds them. Models: Instant `Qwen3.5-0.8B-Q4_K_M.gguf`, Fast
`Qwen3.5-2B-Q4_K_M.gguf` (catalog id `fast`, 1.28 GB).

**Corpus.** `stress-prompts.json`: 44 prompts. The 40 stress prompts cover long enumerations, CJK, Hebrew, very
short prompts, Continue after Stop, translation of repetitive text, JSON, and math steps. Two are controls that ask
for repetition (F389), and two quote a document (to watch the sampler's effect on facts). Every prompt ran with seeds
1, 2 and 3 (132 runs per model), at the app's 0.7. It also ran at 0.2, the temperature a custom persona may set,
which is where small models loop most.

**Harness.** `stress.test.ts.txt` (run from `packages/core/test/` with `LS_PHASE`, `LS_MODEL`, `LS_PORT`, `LS_TEMP`).
Each answer is generated to its end, never stopped. Its stream is then replayed chunk by chunk through the r97 guard,
and every state of the screen is measured.

**Yardstick** (independent of both guards). It counts a phrase of 12+ code points (6+ CJK, kana or Hangul) twice back
to back, a unit of 4 to 11 code points three times, and a sentence or line of 24+ code points said twice anywhere in
the answer, bullet marker and closing full stop aside. Data lines (JSON fields, table rows, code) are excluded; a line
of prose that ends in a comma is not data. Repetition the user asked for, or that the
source text itself contains (`requestRepeats`), is allowed up to that count.

| Model | Temp | Runs | Loops at the source | Runs with a repeat on screen | Most copies on screen | Cut by the guard | Silent retries | Notices | tok/s (median) |
|---|---|---|---|---|---|---|---|---|---|
| instant | 0.7 | 132 | 7 | 7 | 8 | 3 | – | 3 | 128 |
| instant | 0.2 | 132 | 16 | 15 | 7 | 7 | – | 7 | 124 |
| fast | 0.7 | 132 | 2 | 2 | 2 | 3 | – | 3 | 113 |
| fast | 0.2 | 132 | 8 | 8 | 5 | 3 | – | 3 | 104 |

| Model | Temp | Prompt #seed | Repetition in the raw answer | What reached the screen |
|---|---|---|---|---|
| instant | 0.7 | list25-verbs-de #3 | segment x2 `zu verstehen (verstehen)` | segment x2 `zu verstehen (verstehen)` |
| instant | 0.7 | ja-nenji #1 | segment x2 `**事業概況**: 当社の主要な事業部門や活動の範囲を示すもの` | segment x2 `**事業概況**: 当社の主要な事業部門や活動の範囲を示すもの` |
| instant | 0.7 | ja-nenji #2 | segment x8 `**「次期計画」は「次年度」で写す**：年次報告書として書くべきことは、` | segment x8 `**「次期計画」は「次年度」で写す**：年次報告書として書くべきことは、` |
| instant | 0.7 | he-explain #3 | segment x2 `**היסטורי של המוצאים:** תופעות כזו פ` | segment x2 `**היסטורי של המוצאים:** תופעות כזו פ` |
| instant | 0.7 | poem-refrainless #2 | segment x4 `And where the salt water meets the a` | segment x4 `And where the salt water meets the a` |
| instant | 0.7 | es-list #2 | segment x2 `No esperes a que las circunstancias ` | segment x2 `No esperes a que las circunstancias ` |
| instant | 0.7 | es-list #3 | segment x3 `La fuerza te hace más fuerte, no te ` | segment x3 `La fuerza te hace más fuerte, no te ` |
| instant | 0.2 | ja-list-cities #3 | long x5 `県、鳥取県、山口県、福井県、宮城県、長野県、岐阜県、三重` | long x3 `県、鳥取県、山口県、福井県、宮城県、長野県、岐阜県、三重` (then cut) |
| instant | 0.2 | ko-list #1 | segment x2 `떡볶이 (Tteokbeori) - 전라남도 지역 특유의 고기, 채` | segment x2 `떡볶이 (Tteokbeori) - 전라남도 지역 특유의 고기, 채` |
| instant | 0.2 | ko-list #3 | short x50 `, 국면` | short x7 `, 국면` (then cut) |
| instant | 0.2 | he-list #2 | short x20 `ה, קרואטי` | – (then cut) |
| instant | 0.2 | he-list #3 | short x25 `, דפנס` | short x5 `, דפנס` (then cut) |
| instant | 0.2 | cont-story #2 | segment x3 `But tonight, the water was too rough` | segment x3 `But tonight, the water was too rough` |
| instant | 0.2 | cont-ja #1 | long x3 `」という名前の市街地が形成され、現在もその地域全体として「東京」と呼ばれ` | long x3 `」という名前の市街地が形成され、現在もその地域全体として「東京」と呼ばれ` |
| instant | 0.2 | cont-ja #3 | segment x3 `この移行過程で、多くの人が「東京＝江戸」のイメージを強く持っていたため、` | segment x3 `この移行過程で、多くの人が「東京＝江戸」のイメージを強く持っていたため、` |
| instant | 0.2 | math-long-div #1 | segment x3 `Since 123 > 98 and 123 > 97, we cann` | segment x3 `Since 123 > 98 and 123 > 97, we cann` |
| instant | 0.2 | math-long-div #2 | segment x2 `Since 12 is still greater than 21, w` | segment x2 `Since 12 is still greater than 21, w` |
| instant | 0.2 | es-list #1 | segment x4 `La mejor forma de aprender es enseña` | segment x4 `La mejor forma de aprender es enseña` |
| instant | 0.2 | es-list #2 | segment x2 `No te detengas si el camino te lleva` | segment x2 `No te detengas si el camino te lleva` |
| instant | 0.2 | es-list #3 | segment x3 `El camino que no se ve bien a veces ` | segment x3 `El camino que no se ve bien a veces ` |
| instant | 0.2 | fr-list #1 | segment x7 `Une paire de baskets à chaussures` | segment x7 `Une paire de baskets à chaussures` |
| instant | 0.2 | fr-list #2 | segment x2 `Des objets de décoration en pierre n` | segment x2 `Des objets de décoration en pierre n` |
| instant | 0.2 | fr-list #3 | segment x2 `Une collection de livres jeunesse ou` | segment x2 `Une collection de livres jeunesse ou` |
| fast | 0.7 | list25-verbs-de #2 | segment x2 `**bleiben** – to stay/stay behind` | segment x2 `**bleiben** – to stay/stay behind` |
| fast | 0.7 | ja-nenji #1 | segment x2 `**誌価**：同前項と同じ額とする（金額が不明瞭な場合は明記）` | segment x2 `**誌価**：同前項と同じ額とする（金額が不明瞭な場合は明記）` |
| fast | 0.2 | list30-animals #1 | segment x2 `Sea cucumber (various species)` | segment x2 `Sea cucumber (various species)` |
| fast | 0.2 | ko-list #1 | long x2 `, 불고기, 된장찌개, 떡볶이, 감자튀김, 소시지, 짬뽕, 찌개,` | long x2 `, 불고기, 된장찌개, 떡볶이, 감자튀김, 소시지, 짬뽕, 찌개,` |
| fast | 0.2 | he-explain #1 | segment x5 `בפוטוסינתזה, החורש מייצר קרינה באמצע` | segment x5 `בפוטוסינתזה, החורש מייצר קרינה באמצע` |
| fast | 0.2 | he-list #3 | short x27 `, תל אביב` | short x3 `, תל אביב` (then cut) |
| fast | 0.2 | cont-list #2 | segment x5 `Xigua (Watermelon) - *Note: Often gr` | segment x5 `Xigua (Watermelon) - *Note: Often gr` |
| fast | 0.2 | math-long-div #3 | segment x2 `$987 \div 123 = 8$ with a remainder ` | segment x2 `$987 \div 123 = 8$ with a remainder ` |
| fast | 0.2 | fr-list #2 | long x2 `e, des voyages, des massages, des co` | long x2 `e, des voyages, des massages, des co` |
| fast | 0.2 | fr-list #3 | long x2 `, des voyages, des courses alimentai` | long x2 `, des voyages, des courses alimentai` |

"Cut by the guard" counts every r97 cut, and 11 of its 16 cuts were wrong. They all hit the French translation of
"Row, row, row your boat … Merrily, merrily, merrily, merrily": every seed on both models at 0.7, and 5 of 6 at 0.2.
The answer's four "Enchantement" or "Joyeux" mirror the source's four "Merrily". At 0.7 the r97 guard cut none of the
9 real loops, because they were sentences and bullets repeated with text between them, which it never looks for. At
0.2 it cut 5 real loops, after up to 7 copies had been on screen (`ko-list` #3: ", 국면" 7 times; `ja-list-cities`
#3: a run of prefectures 3 times). The other 19 real loops at 0.2 stayed on screen whole.
