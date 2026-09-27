# F428 · round 114: the build 24 and web answers and where the round 114 guard cuts them

Each answer is shown as the model wrote it. The line marked `✂ cut here` and everything after it never reaches the screen.
The guard keeps the text above the mark. In the app the silent retry then continues the list, and a retry that repeats
too ends with the notice. Round 113 (main 22541224) cut none of these. The four verbs-de answers answer "Nenne 25
deutsche Verben mit ihrer Bedeutung auf Englisch."

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

## iPhone build 24, ko-list at 0.2 (a numbered list on one line)

Source: `ios-device-pass-24/raw/result-l02-ko-list.json`. Request: "한국 음식 30가지를 알려주세요."

The whole list is one line. Each "N. item" after a comma is now an item. "17. 돼지국" repeats item 7, and the list holds 16 distinct heads by then, so the cut is right before ", 17.". Items 24 to 28 repeat 14 to 18 and never show.

```text
한국 음식 30 가지를 소개합니다.

1. 간장, 2. 김치, 3. 고기, 4. 국물, 5. 양념국, 6. 소고기, 7. 돼지국, 8. 닭고기, 9. 생선, 10. 해산물, 11. 야채, 12. 채소, 13. 두부, 14. 김치찌개, 15. 간장찌개, 16. 고기국
----- ✂ cut here -----
, 17. 돼지국, 18. 닭고기국, 19. 생선국, 20. 해산물국, 21. 야채국, 22. 채소국, 23. 두부국, 24. 김치찌개, 25. 간장찌개, 26. 고기국, 27. 돼지국, 28. 닭고기국, 29. 생선
```

## iPhone build 24, he-list at 0.2 (an item that goes on from an earlier one)

Source: `ios-device-pass-24/raw/result-l02-he-list.json`. Request: "תן לי רשימה של 30 ערים בישראל."

Items 11 to 20 are items 1 to 10 with "-המערב" glued on. An item whose words go on from an earlier item's whole words past a mark is that item again, so item 11 is cut. The bare "21" the budget left is gone with it.

```text
הנה רשימה של 30 ערים בישראל:
1. תל אביב
2. ירושלים
3. חיפה
4. ניו יורק
5. בריאן
6. פתחזיה
7. מרכז העירייה
8. דובדינה
9. קרפון
10. אשדוד
----- ✂ cut here -----
11. תל אביב-המערב
12. ירושלים-המערב
13. חיפה-המערב
14. ניו יורק-המערב
15. בריאן-המערב
16. פתחזיה-המערב
17. מרכז העירייה-המערב
18. דובדינה-המערב
19. קרפון-המערב
20. אשדוד-המערב
21
```

## iPhone build 24, fr-list at 0.2 (items that go on past a space)

Source: `ios-device-pass-24/raw/result-l02-fr-list.json`. Request: "Donne-moi 30 idées de cadeaux d'anniversaire."

Item 11 is item 4 with "et les événements importants" added, and item 12 is item 7 with "pour créer des moments uniques avec vous" added. Past a space, an earlier item of 3 or more words counts, so "Whale shark" after "Whale" stays a new item. The cut is before item 11.

```text
Voici 30 idées de cadeaux d'anniversaire, sélectionnés pour être divertissants et adaptés à différents budgets :

1. Un jeu vidéo interactif avec des fonctionnalités personnalisables.
2. Une collection de livres jeunesse ou un magazine éducatif.
3. Des objets décoratifs en forme de fruits ou de fleurs.
4. Un gadget portable (smartwatch, bracelet) pour suivre vos passions.
5. Un livre d'histoire ou une carte postale unique.
6. Une musique musicale avec des effets sonores personnalisables.
7. Des pièces de théâtre ou un costume de scène.
8. Une collection de livres d'art ou des objets à l'artisanat.
9. Un jeu vidéo en 3D avec des fonctionnalités interactives.
10. Une collection de livres d'histoire ou une carte postale unique pour un souvenir inoubliable.
----- ✂ cut here -----
11. Un gadget portable (smartwatch, bracelet) pour suivre vos passions et les événements importants.
12. Des pièces de théâtre ou un costume de scène pour créer des moments uniques avec vous.
13. Une collection de livres d'édition limitée ou une carte postale personnalisée.
```
