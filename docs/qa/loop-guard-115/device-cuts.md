# F431 · round 115: the build 25 answers and where the round 115 guard cuts them

Each answer is shown as the model wrote it on the phone (the last snapshot in `raw/result-*.json`). The line marked
`✂ cut here` and everything after it never reaches the screen; the guard keeps the text above the mark. Round 114
(main 6312e769) cut neither. Source: the read-only device pass at
`/Users/moshecohen/dev/inborn-wt/ios-build-25/docs/qa/ios-device-pass-25/`.

## math-long-div 0.7 #2 (Instant)

Source: `raw/result-l07-math-long-div-2.json`. Asked: *"Divide 987654321 by 123 step by step, showing every step of long division."*

The unit is the pair "- 123000000" / "--------"; a new (wrong) number stands between the copies, 16 times, and the answer
ran to the token budget inside the unclosed block. The third copy waits off screen; the fourth confirms the loop. The
answer ends after "  634654321" with the fence closed on its own line and the loop notice. No retry writes into the
block.

````text
Performing long division of 987654321 by 123 yields a quotient of 8013043 and a remainder of 14:

```
    8013043 . 14
  ----------
123 | 987654321.000
  - 123000000
  --------
   757654321
- 123000000
  --------
  634654321
----- ✂ cut here -----
  - 123000000
  --------
  511654321
  - 123000000
  --------
  388654321
  - 123000000
  --------
  265654321
  - 123000000
  --------
  142654321
  - 123000000
  --------
  196543211
  - 123000000
  --------
  735432111
  - 123000000
  --------
  612432111
  - 123000000
  --------
  489432111
  - 123000000
  --------
  366432111
  - 123000000
  --------
  243432111
  - 123000000
  --------
  120432111
  - 123000000
  --------
  84321111
  - 123000000
  --------
  720211111
  - 123000000
  --------
````

On screen after the cut:

````text
Performing long division of 987654321 by 123 yields a quotient of 8013043 and a remainder of 14:

```
    8013043 . 14
  ----------
123 | 987654321.000
  - 123000000
  --------
   757654321
- 123000000
  --------
  634654321
```
````

## he-list 0.2 (Instant, persona)

Source: `raw/result-l02-he-list.json`. Asked: *"תן לי רשימה של 30 ערים בישראל."*

Items 23–28 are items 14 and 18–22 again with the shared word "קיבוץ" misspelt by one letter: "קיבוט", "קיבוק", "קיבוע"
(one letter swapped), "קיבץ" (one dropped). "קיבוצת מנזיל" and "קיבוצה אריאל" are two edits away and would not count
alone, but they come after the cut. The list holds 22 distinct heads, so item 23 is cut as soon as its line ends; its
line waits off screen while it streams, so no misspelt copy is ever shown.

```text
הנה רשימה של 30 ערים בישראל:
1. אשדוד
2. ארצוה
3. בן-גוריון
4. בר-אילון
5. בריית המלך
6. כנרת
7. קיבוץ חיים
8. קיבוץ עמק יזרעאל
9. קיבוץ מלכיה
10. קיבוץ נפגועים
11. קיבוץ רבן-דוד
12. קיבוץ שבת
13. קיבוץ תל אביב
14. קיבוץ ירושלים
15. קיבוץ עירובן
16. קיבוץ נגבית
17. קיבוץ חרסון
18. קיבוץ מנזילתה
19. קיבוץ אריאל
20. קיבוץ רפ"א
21. קיבוץ סלען
22. קיבוץ גבולות
----- ✂ cut here -----
23. קיבוט ירושלים
24. קיבוצת מנזיל
25. קיבוצה אריאל
26. קיבוק רפ"א
27. קיבוע סלען
28. קיבץ גבולות
29. לקוויט ירושלים
```

## Continue, try 1

Source: `raw/result-d-continue.json` (first snapshot: stopped; last: continued).

Before (build 25, round 114):

> …The Portuguese and Spanish expeditions to India created an insurmountable barrier between East Asia and West, but their conquests brought massive quantities of precious metals and exotic items into the continent's capitals,. These ventures marked a turning point where European powers realized that controlling trade routes was more important …

After (round 115): the continuation opens with a full stop, so the comma the stopped text left dangling goes. The guard
sends the chat the new text on screen (`prefix`), and the join reads:

> …The Portuguese and Spanish expeditions to India created an insurmountable barrier between East Asia and West, but their conquests brought massive quantities of precious metals and exotic items into the continent's capitals. These ventures marked a turning point where European powers realized that controlling trade routes was more important …
