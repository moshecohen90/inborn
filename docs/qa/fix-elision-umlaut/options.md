# German ae/oe/ue: the two options, measured (F368)

Both options run on the German rows of the round-81/84 fixtures (`de-report`, 9 on-topic and 9 off-topic questions,
and `mc-de`, 5 and 7) with the committed shipped-embedder cosines and the shipped door (rule 70 OR cosine > 0.82),
plus a probe of 37 common German words whose ae/oe/ue is not an umlaut: each word in a one-line passage, the same
word as the question. Option (b) is round 84's index with the question folded (ae→a, oe→o, ue→u) unless the word is
on the exception list {poesie, aerosol, museum, feuer}.



**Picked: (a).** A passage word with ä/ö/ü is also indexed under its ae/oe/ue spelling, and a question word with ä/ö/ü
is also looked up under it, counted once. Both options move the same fixture row ("Wo liegen die Hauptbueros?") and
neither cites anything off-topic, but (b) loses 33 of the 37 real words: "au"+"e" ("Frauen", "bauen", "Dauer") and
"Quelle", "neue", "aktuell" are everyday German, so no exception list can hold them. (b) would also need the query
language, which the index does not have. (a) never folds a digraph to a bare vowel, so it cannot lose a word.

Probe source: `options-probe.test.ts.txt` (ran from `packages/core/test/` beside a copy of round 84's `bm25.ts`).
