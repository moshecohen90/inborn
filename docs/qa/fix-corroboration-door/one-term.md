# F365 · one shared term under e5

Every (question, chunk) pair that shares exactly one non-glue term, with the shipped embedder's quantized cosine and the real BM25 score.
Sets: round 70's one-passage and six-chunk documents (`packages/core/test/fixtures/rag/e5-cosines.json`) and this round's year/number set (`one-term-set.json`, cosines in `fixtures/rag/one-term-e5.json`).
Regenerate: see the header of `packages/core/test/rag-one-term-measure.test.ts`.

Doors for `embed-e5` (packages/core/src/rag/prompt.ts RELEVANCE_DOORS): alone > 0.82, one content word needs cosine >= 0.815 or BM25 >= 2. A weak term (number, year, unit, numeral bigram, lone CJK character) counts only beside a content word.

## Margins

- Off-topic pairs, any term count: 486, highest cosine 0.8177 (the alone door's margin is 0.0023).
- Off-topic pairs sharing one term: 17, highest cosine 0.8107 (一九); the corroboration door sits 0.0043 above it even before the weak-term rule.
- On-topic pairs sharing one content word, at or under the alone door: 6; the door keeps 0 and refuses 6: en-report#0 answering 0.8098; mc-zh#4 other chunk 0.7961; mc-zhHant#4 other chunk 0.7967; mc-ko#4 other chunk 0.7833; mc-en#0 answering 0.7664; mc-en#4 other chunk 0.7332.

## Every one-term pair

| set | chunk | kind | question | shared term | cosine | BM25 | e5 verdict |
|---|---|---|---|---|---|---|---|
| r70-six | mc-ja#1 | off | 一九九八年のワールドカップで優勝したのはどこですか？ | 一九 (weak) | 0.8107 | 1.72 | 0 terms: refused |
| r83-years | yr-ko#0 | off | 1998년 월드컵 우승국은 어디인가요? | 1998년 (weak) | 0.8042 | 0.29 | 0 terms: refused |
| r83-years | yr-he#0 | off | מי זכה במונדיאל 1998? | 1998 (weak) | 0.8009 | 0.29 | 0 terms: refused |
| r70-six | mc-zh#1 | off | 一九九八年世界杯足球赛是谁赢的？ | 一九 (weak) | 0.7945 | 1.73 | 0 terms: refused |
| r70-six | mc-zhHant#1 | off | 一九九八年世界盃足球賽是誰贏的？ | 一九 (weak) | 0.7905 | 1.72 | 0 terms: refused |
| r83-years | yr-he#0 | off | כמה קלוריות יש ב-1200 גרם אורז? | 1200 (weak) | 0.7878 | 0.29 | 0 terms: refused |
| r83-years | nenji-whole#0 | off | 一九九八年のワールドカップで優勝したのはどこですか？ | 一九 (weak) | 0.7863 | 0.29 | 0 terms: refused |
| r83-years | yr-pt#0 | off | Quantas calorias têm 1200 gramas de arroz? | 1200 (weak) | 0.7728 | 0.29 | 0 terms: refused |
| r83-years | yr-de#0 | off | Wer hat die Weltmeisterschaft 1998 gewonnen? | 1998 (weak) | 0.7723 | 0.29 | 0 terms: refused |
| r83-years | yr-de#0 | off | Wie viele Kalorien haben 1200 Gramm Reis? | 1200 (weak) | 0.7708 | 0.29 | 0 terms: refused |
| r83-years | yr-pt#0 | off | Quem ganhou a Copa do Mundo de 1998? | 1998 (weak) | 0.7704 | 0.29 | 0 terms: refused |
| r83-years | yr-fr#0 | off | Combien de calories dans 1200 grammes de riz ? | 1200 (weak) | 0.7643 | 0.29 | 0 terms: refused |
| r83-years | yr-es#0 | off | ¿Cuántas calorías tienen 1200 gramos de arroz? | 1200 (weak) | 0.7587 | 0.29 | 0 terms: refused |
| r83-years | yr-fr#0 | off | Qui a gagné la Coupe du monde 1998 ? | 1998 (weak) | 0.7567 | 0.29 | 0 terms: refused |
| r83-years | yr-es#0 | off | ¿Quién ganó el Mundial de 1998? | 1998 (weak) | 0.7529 | 0.29 | 0 terms: refused |
| r83-years | yr-en#0 | off | How many calories are in 1200 grams of rice? | 1200 (weak) | 0.7390 | 0.29 | 0 terms: refused |
| r83-years | yr-en#0 | off | Who won the 1998 World Cup? | 1998 (weak) | 0.7303 | 0.29 | 0 terms: refused |
| r70-one | zhHant-f278#0 | on | 去年的營業額比前年高了幾成？ | 的營 | 0.8934 | 0.29 | cosine alone |
| r70-one | ja-f278#0 | on | 収益が増えた理由は何ですか？ | 収益 | 0.8914 | 0.57 | cosine alone |
| r70-one | zhHant-f195#0 | on | 營業額跟前一年比起來如何？ | 一年 (weak) | 0.8897 | 0.29 | cosine alone |
| r70-one | zh-f195#0 | on | 营业额与前一年相比如何？ | 一年 (weak) | 0.8854 | 0.29 | cosine alone |
| r70-six | mc-zh#0 | on | 公司一共有多少人在工作？ | 公司 | 0.8852 | 0.58 | cosine alone |
| r70-one | zhHant-f278#0 | on | 獲利提高了幾個百分點？ | 百分 | 0.8817 | 0.29 | cosine alone |
| r70-one | ja-device#0 | on | 報告書によると従業員は何人いますか？ | 報告 | 0.8792 | 1.15 | cosine alone |
| r70-one | ja-f278#0 | on | 利益はどのくらい伸びましたか？ | 益は | 0.8771 | 0.86 | cosine alone |
| r70-one | zh-f278#0 | on | 利润提高了几个百分点？ | 百分 | 0.8730 | 0.29 | cosine alone |
| r70-six | mc-zhHant#0 | on | 公司總共有多少人在工作？ | 公司 | 0.8723 | 0.59 | cosine alone |
| r70-one | ko-report#0 | on | 보고서에 나온 종업원 규모가 어느 정도인가요? | 보고서에 | 0.8712 | 0.29 | cosine alone |
| r70-one | ja-f278#0 | on | 前年に対する成長率を教えてください。 | 前年 | 0.8707 | 0.29 | cosine alone |
| r70-one | es-report#0 | on | ¿Cuántas personas trabajan allí? | personas | 0.8678 | 0.29 | cosine alone |
| r70-one | pt-report#0 | on | Quantas pessoas trabalham lá? | pessoas | 0.8660 | 0.29 | cosine alone |
| r70-one | pt-report#0 | on | Quantas pessoas trabalham la? | pessoas | 0.8655 | 0.29 | cosine alone |
| r70-one | es-report#0 | on | ¿Cuantas personas trabajan alli? | personas | 0.8649 | 0.29 | cosine alone |
| r70-one | ja-device#0 | on | 働いている人の総数はどれくらいですか？ | 数は | 0.8603 | 0.29 | cosine alone |
| r83-years | yr-zh#0 | on | 仓库有多大？ | 仓库 | 0.8568 | 0.29 | cosine alone |
| r70-one | pt-report#0 | on | Em quais cidades a empresa está instalada? | empresa | 0.8565 | 0.29 | cosine alone |
| r83-years | yr-de#0 | on | Wie groß ist das Lager? | lager | 0.8486 | 0.29 | cosine alone |
| r83-years | yr-pt#0 | on | Qual é o tamanho do armazém? | armazém | 0.8437 | 0.29 | cosine alone |
| r83-years | yr-en#0 | on | How large is the warehouse? | warehouse | 0.8395 | 0.29 | cosine alone |
| r83-years | yr-es#0 | on | ¿Qué tamaño tiene el almacén? | almacén | 0.8381 | 0.29 | cosine alone |
| r70-one | en-report#0 | on | What is the size of the workforce in the report? | report | 0.8350 | 0.29 | cosine alone |
| r70-six | mc-zhHant#1 | on (other chunk) | 公司總共有多少人在工作？ | 公司 | 0.8329 | 0.77 | cosine alone |
| r70-six | mc-zh#1 | on (other chunk) | 公司一共有多少人在工作？ | 公司 | 0.8310 | 0.78 | cosine alone |
| r70-one | pt-report#0 | on | Em que cidades ficam as sedes? | ficam | 0.8216 | 0.29 | cosine alone |
| r83-years | yr-he#0 | on | מה קרה ב-1998? | 1998 (weak) | 0.8197 | 0.29 | 0 terms: refused |
| r70-one | en-report#0 | on | Which cities host the offices? | offices | 0.8098 | 0.29 | refused |
| r83-years | yr-pt#0 | on | O que aconteceu em 1998? | 1998 (weak) | 0.8045 | 0.29 | 0 terms: refused |
| r70-six | mc-zhHant#4 | on (other chunk) | 公司總共有多少人在工作？ | 公司 | 0.7967 | 0.63 | refused |
| r70-six | mc-zh#4 | on (other chunk) | 公司一共有多少人在工作？ | 公司 | 0.7961 | 0.62 | refused |
| r83-years | yr-de#0 | on | Was geschah 1998? | 1998 (weak) | 0.7919 | 0.29 | 0 terms: refused |
| r83-years | yr-es#0 | on | ¿Qué pasó en 1998? | 1998 (weak) | 0.7884 | 0.29 | 0 terms: refused |
| r83-years | yr-fr#0 | on | Que s'est-il passé en 1998 ? | 1998 (weak) | 0.7842 | 0.29 | 0 terms: refused |
| r70-six | mc-ko#4 | on (other chunk) | 종업원은 모두 몇 사람인가요? | 모두 | 0.7833 | 1.36 | refused |
| r70-six | mc-en#0 | on | Which cities host the main sites? | main | 0.7664 | 1.20 | refused |
| r83-years | yr-en#0 | on | What happened in 1998? | 1998 (weak) | 0.7569 | 0.29 | 0 terms: refused |
| r70-six | mc-en#4 | on (other chunk) | Which cities host the main sites? | sites | 0.7332 | 1.58 | refused |
