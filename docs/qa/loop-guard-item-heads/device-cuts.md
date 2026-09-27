# F428 · round 114: the verbs-de answers and where the round 114 guard cuts them

Each answer is shown as the model wrote it. The line marked `✂ cut here` and everything after it never reaches the screen.
The guard keeps the text above the mark. In the app the silent retry then continues the list, and a retry that repeats
too ends with the notice. Round 113 (main 22541224) cut none of these four. Request: "Nenne 25 deutsche Verben mit ihrer Bedeutung auf Englisch."

## iPhone build 24, list25-verbs-de try 1 (Instant 0.7)

Source: `ios-device-pass-24/raw/result-l07-list25-verbs-de-1.json`.

"sein" is item 1's head. Item 5 is "sein" again with a new gloss. The list then holds 4 distinct heads, so item 5 waits off screen; item 6 ("bringen") makes 5 and item 5 is cut. Items 11 "sein" and 12 "haben" never show.

```text
Hier sind 25 deutsche Verben mit ihrer Bedeutung auf Englisch:

1. sein: zu begehren, zu verlangen
2. haben: zu besitzen, zu erheben
3. tun: zu machen, zu erledigen
4. finden: zu suchen, zu entdecken
----- ✂ cut here -----
5. sein: zu führen, zu begleiten
6. bringen: zu befördern, zu bringen
7. nehmen: zu tragen, zu übernehmen
8. geben: zu übergeben, zu verschenken
9. lassen: zu lassen, zu überlassen
10. machen: zu tun, zu erledigen (oft mit Verben wie tun)
11. sein: zu werden, zu bestehen
12. haben: zu haben (objektive Bedeutung)
```

## iPhone build 24, list25-verbs-de try 2 (Instant 0.7)

Source: `ios-device-pass-24/raw/result-l07-list25-verbs-de-2.json`.

Item 4 is "sein (to be)", item 5 "sein (to exist/remain)". With 4 distinct heads item 5 waits off screen; item 6 ("werden") makes 5 and item 5 is cut. Item 8 "werden (to happen)" never shows.

```text
25 deutsche Verben auf Englisch:
1. kommen (to come)
2. gehen (to go)
3. tun (to do)
4. sein (to be)
----- ✂ cut here -----
5. sein (to exist/remain)
6. werden (to become)
7. sind (to be)
8. werden (to happen)
```

## Web, Fast, the stored answer (markdown the guard reads)

Source: `docs/qa/web-fast-loops/result.json trials[6].raw`.

"gehen" is item 3's head, and the list holds 19 distinct heads when item 20 repeats it, so item 20 is cut as soon as item 21 starts (the wait for a sub-list). Item 21 "kommen – to arrive" never shows.

```text
Here are 25 German verbs with their English meanings:

1. **sein** – to be
2. **haben** – to have
3. **gehen** – to go
4. **kommen** – to come
5. **sehen** – to see
6. **sprechen** – to speak
7. **lernen** – to learn
8. **arbeiten** – to work
9. **essen** – to eat
10. **trinken** – to drink
11. **schlafen** – to sleep
12. **lesen** – to read
13. **schreiben** – to write
14. **laufen** – to run
15. **sitzen** – to sit
16. **stecken** – to put (in)
17. **stehen** – to stand
18. **liegen** – to lie
19. **bleiben** – to stay / remain
----- ✂ cut here -----
20. **gehen** – to go on a trip
21. **kommen** – to arrive
22. **wissen** – to know
23. **wollen** – to want
24. **hassen** – to hate
25. **lieben** – to love
```

## Web, Fast, the same answer as the screen text reads (number on its own line)

Source: `docs/qa/web-fast-loops/result.json trials[6].answer`.

The same cut. A marker alone on its line ("20.") now takes the next line as its words, so the items stay one list (round 113 split every item into its own list here).

```text
Here are 25 German verbs with their English meanings:
1.
sein – to be
2.
haben – to have
3.
gehen – to go
4.
kommen – to come
5.
sehen – to see
6.
sprechen – to speak
7.
lernen – to learn
8.
arbeiten – to work
9.
essen – to eat
10.
trinken – to drink
11.
schlafen – to sleep
12.
lesen – to read
13.
schreiben – to write
14.
laufen – to run
15.
sitzen – to sit
16.
stecken – to put (in)
17.
stehen – to stand
18.
liegen – to lie
19.
bleiben – to stay / remain
----- ✂ cut here -----
20.
gehen – to go on a trip
21.
kommen – to arrive
22.
wissen – to know
23.
wollen – to want
24.
hassen – to hate
25.
lieben – to love
```
