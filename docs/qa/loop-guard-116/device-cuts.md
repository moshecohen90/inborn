# Round 116 cuts on the iPhone build 26 answers

Build 26 ran round 115's guard (main 4f27a09f) at the 0.2 persona. The answers are the last snapshot of each
`raw/result-*.json` in device pass 26 (`docs/qa/ios-device-pass-26/`, commit 5de58f00),
streamed through round 116's guard 3 code points at a time with no retry. "✂ cut here" marks where the answer now ends.

## es-list 0.2: item 17 restates item 5

Request: *Escribe 30 frases motivadoras cortas.* Item 5 reads "haciendo" twice where item 17 reads "hacer". Their word stems
match 12 of 14, in the same order, and the two left over are forms of one word (first 3 letters "hac").

```text
14. Tu capacidad de hacer cosas extraordinarias depende de tu voluntad y paciencia.
15. No te sientes si no puedes hacerlo, pero sí puedes intentar.
16. El tiempo es un recurso que se agota rápido; haz lo posible con cada segundo.
✂ cut here
17. La única forma de ser feliz es hacer cosas buenas y hacer cosas malas.
```

The guard keeps 1,237 of 1,312 characters. No screen state shows "17.": the line waits off screen while it may still
turn into a copy.

## fr-list 0.2: item 11 is item 6 in the singular

Request: *Donne-moi 30 idées de cadeaux d'anniversaire.* "Des objets de décoration maison" and "Un objet de décoration maison" are one head
once the determiner is dropped and "objets" folds to "objet". No screen state shows "11.".

```text
9. Une collection d'objets en bois ou en métal décoratifs.
10. Des livres de fiction ou des magazines.
✂ cut here
11. Un objet de décoration maison (ex: une
```

## Seams at the silent retry

The device logs show a silent retry in each of these three answers (`raw/log-l02-*.txt`). The tests rebuild each first
generation from the kept text the log names (131, 65 and 113 characters) and feed the retry text the phone showed.

**ko-list: the inline list gets its ", " back.** Kept "…14. 마늘, 15. 파", retry "16. 오징어, …".

```text
before: …13. 우유, 14. 마늘, 15. 파 16. 오징어, 17. 양파
after:  …13. 우유, 14. 마늘, 15. 파, 16. 오징어, 17. 양파
```

**ja-list-cities: prose after an inline list gets "。".** Kept "…三重、鳥取", retry "これらはすべて日本の主要都市です。".

```text
before: …岐阜、三重、鳥取これらはすべて日本の主要都市です。
after:  …岐阜、三重、鳥取。これらはすべて日本の主要都市です。
```

**he-list: the tail cut ends before the copy's first word.** The period rule found ", בראגן, בראונד, בראינג, ברוז, ברוזל"
twice and kept the first copy, whose last word "ברוזל" is item 6 said again. The kept inline list now ends at the
separator before it.

```text
before: …בראגן, בראונד, בראינג, ברוז, ברוזל
after:  …בראגן, בראונד, בראינג, ברוז
```

The retry after this cut wrote only ".", so the answer ends at the cut with the notice, as in round 113.
