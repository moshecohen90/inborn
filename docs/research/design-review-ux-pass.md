# Autark — ביקורת מעצב: פישוט, אונבורדינג, תהליכים, ויזואל

מעצב המוצר. גדר: פישוט קל בלבד. בלי לשנות מבנה, ניווט, פיצ'רים או שפה חזותית (FARADAY).
מה שכן: ניסוח פשוט, הסתרת פרטים טכניים מאחורי Details, הורדת כפתורים כפולים, בהירות הכפתור הראשי.

## איך נבדק

הדמו הבנוי הורץ בדפדפן בדיקה (Chromium דרך playwright, ללא ראש) ונלחץ בפועל בכל תהליך,
בערכה כהה ובהירה ובדסקטופ. לא רק צילומי מסך ולא רק מקור.

```
Demo:        file:///Users/moshecohen/dev/autark/docs/autark-demo.html
Live shots:  /private/tmp/claude-501/-Users-moshecohen-dev-bibleapps/e1fec2dd-3831-49ec-a78e-d650b5c0d26b/scratchpad/qa/live/
Method:      playwright-core + Chromium (chromium-1208), real clicks per flow, headless, closed after each run
```

---

## A. סטטוס סבב 1 (מה כבר יושם בדמו)

הדמו עודכן מאז צילומי המסך הראשונים. ארבעת התיקונים החשובים כבר בפנים.

```
Applied already:
  header chip "FAST 2B" -> "FAST"; per-message resting label dropped tok/s (now inside the Ledger)
  "Copy · expires 60 s" removed  (actions row now: Copy · Regenerate · Read aloud · Report)
  paywall bullets rewritten to plain language
  vault cards dropped "Q4_K_M"  (quant now only in Details / Ledger)

Still open from round 1 (small copy) -> folded into item 6 below:
  quick-actions footer "share extension...app group"
  voice picker "Ava · system" / "Kokoro · neural"
  vault buttons "Import GGUF" / "Search Hugging Face"
  personas footer "A persona is a system prompt..."
  "encrypted database" wording (Documents, Memory)
```

---

## B. אונבורדינג (S01–S05): ברור ומהיר, עם שלושה חיכוכים קטנים

נלחץ חי דרך כל חמשת המסכים. משתמש רגיל מבין בכל שלב מה קורה ולמה.
התזה במסך הראשון חד-משמעית, וטקס מצב הטיסה מצוין. אין מסך מיותר: מסך החותם (S04) הוא רגע
רגשי קצר (Peak-End), לא בזבוז. שלושת החיכוכים, כולם בתוך הגדר:

### 1. S02 — שני כפתורים כמעט זהים בהחלטה הראשונה, ועומס בחירת מודל

חומרה: חשוב. מאמץ: קטן עד בינוני.
זו ההחלטה הראשונה של המשתמש, ומייד מוצגים שלושה כרטיסי מודל ושני כפתורים ראשיים שנשמעים
אותו דבר. שניהם פותחים צ'אט; ההבדל (אם Fast יורד ברקע) לא מעניין את הרוב. תשאיר את שלושת
המודלים ואת הבחירה, רק תעשה כפתור ראשי אחד ברור ותנמיך את השני לקישור.

```
screen:  S02 — Your model is ready
before:  [Chat now, get Fast in the background]   [Just chat with Instant]
after:   [Start chatting]   (does the smart thing: Instant now, Fast over Wi-Fi)
         small link below: "Stay on Instant only"
also:    lighten card metadata (0.8B / 2B / ~52 tok/s) the way the vault card was lightened
```

### 2. S03 — הכפתור הראשי "I saw it" אפור עד שלוחצים "Ask", והוא הכי בולט במסך

חומרה: חשוב. מאמץ: קטן.
אימות חי: הכפתור הגדול והמלא הוא דווקא זה שאי אפשר ללחוץ עדיין, והפעולה שצריך לעשות ("Ask")
היא כפתור קטן ושקוף בתוך הכרטיס. המשתמש רואה כפתור ראשי אפור בלי לדעת למה. "Skip" קיים,
אז זו לא חסימה קשה, אבל ההיררכיה נלחמת בזרימה. תהפוך אותה.

```
screen:  S03 — Airplane test
before:  big filled [I saw it] (disabled)  ·  small ghost [Ask] inside the card  ·  [Skip]
after:   make [Ask] the prominent action; reveal/enable [I saw it] only after the answer streams
```

### 3. S05 — כששומרים בלי Face ID, שני הכפתורים עושים בדיוק אותו דבר

חומרה: קטן. מאמץ: קטן.
כשהמתג כבוי, גם "Start without a lock" וגם "Not now" מובילים לצ'אט בלי נעילה. שתי מילים
נרדפות. הצג כפתור אחד כשהנעילה כבויה, ושנה אותו כשהיא נדלקת. גם שורת "Lock after" פעילה
בזמן ש-Face ID כבוי.

```
screen:  S05 — Lock it
lock OFF: single [Start]         (drop the redundant "Not now")
lock ON:  [Turn on and start]  +  small [Not now];  "Lock after" only visible when lock is ON
```

---

## C. תהליכים מקצה לקצה — ספירת לחיצות ונקודות היתקעות

כל שורה נלחצה בפועל בדמו (המסלול הקצר ביותר).

```
Flow                         Taps (fastest)                                Verified live   Note
First message                1  (suggestion chip)                          yes             clean
Attach a file + ask          3  (+  ->  File  -> type -> Send)             yes (5 cites)   or 1 tap via Documents "Ask"
Get another model + load     2  (Get -> Load, after 1-tap buy Pro)         yes -> LOADED   Sharp: pro-gated -> paywall if not Pro
New chat, plain              2  (Chats -> New chat)                        yes             good default
New chat with a persona      4  (Chats -> New chat -> persona -> Start)    yes             opt-in, sensible defaults
Airplane test from Proof     1  (Run the airplane test)                    yes             see item 4 (jumps to chat)
Buy Pro                      1  (Unlock Pro)  [+ StoreKit sheet in real]   yes             clean
Lock / unlock                Settings ReqFaceID(1) -> drawer Lock(1) ->    yes             lock screen clean & on-brand
                             Face ID unlock(1)
Delete everything            2  (Delete... -> Delete everything) + confirm yes             clear irreversibility warning
Onboarding -> first chat     5-6 (Continue, S02, [Skip | Ask+I saw it],    yes
                             Start, S05)
```

נקודות בהן משתמש עלול להיתקע או לא להבין:
- ההחלטה ב-S02 (איזה משני הכפתורים) — פריט 1.
- הכפתור האפור ב-S03 — פריט 2.
- שני הכפתורים הנרדפים ב-S05 — פריט 3.
- מבחן הטיסה ממסך ההוכחה קופץ לצ'אט (פריט 4).
- להגיע לכספת / מסמכים / פרסונות / הוכחה צריך קודם לפתוח את מגירת השיחות. זה ניווט, ולכן
  מחוץ לגדר, אבל שווה לדעת שהם לא ברמה העליונה.

### 4. מבחן הטיסה ממסך ההוכחה קופץ לצ'אט, וההוכחה היא רק toast חולף

חומרה: קטן. מאמץ: קטן.
אימות חי: לחיצה על "Run the airplane test" מ-S50 מעבירה לצ'אט עם שאלת חשבון אוטומטית,
וההוכחה ("OUT stays 0 B") מופיעה כהודעה חולפת שנעלמת. בניגוד ל-S03, שם המונה קבוע וברור.

```
screen:  S50 — Proof, "Run the airplane test"
fix:     keep the OUT 0 B / IN counter visible during and after the test, not just a disappearing toast
```

---

## D. בדיקה ויזואלית — יישור, היררכיה, ניגודיות, מגע

הכללי טוב: חותם יחיד כאינדיקטור, היררכיה נקייה, אין גלילה אופקית בדסקטופ, יעדי מגע נדיבים
(44px ומעלה). הליקויים קטנים.

### 5. ניגודיות ערכה בהירה — מספרי tok/s בענבר על לבן

חומרה: חשוב לניגודיות. מאמץ: קטן.
בכספת בערכה בהירה מספרי המהירות בענבר בהיר על רקע לבן נראים חלשים. האפיון עצמו אומר
שבבהיר המבטא-כטקסט צריך להיות הכהה, לא הבהיר.

```
light theme: amber telemetry text must use accent-as-text #8F5309, not the bright #F0B35B
             (fills and glow stay #F0B35B). Applies to tok/s in the vault and anywhere accent is used as text.
```

### 6. מחרוזות שנראות "מפותח" ולא "מעוצב" (ז'רגון בטקסט מוצר)

חומרה: קטן. מאמץ: קטן.
כולן נשארו פתוחות ומופיעות למשתמש רגיל.

```
S52 Settings:   "SQLCIPHER" tag on Chats              -> drop it, or "Encrypted"
S52 Settings:   "Passphrase-encrypted .sealed file"   -> "Password-protected backup file"
S43 Quick acts: "...the share extension hands it to the app through the app group..."
                                                       -> "The text never leaves your phone."
S44 Voice:      "Ava · system" / "Kokoro · neural"    -> "Ava" / "Kokoro" (or "Natural")
S30 Vault:      "Import GGUF" / "Search Hugging Face"  -> "Import a model file" / "Find more models"
S41 Personas:   "A persona is a system prompt, a default model, allowed tools and a response style."
                                                       -> "A persona is a saved setup: how it talks, which model, what it can do."
S40 / S42:      "encrypted database"                  -> "encrypted storage"
```

### 7. צ'יפ הציטוט משאיר נקודה מיותמת אחריו

חומרה: זעיר. מאמץ: קטן.
אימות חי בצ'אט החוזה: אחרי כל צ'יפ ציטוט מופיעה נקודה בודדת מרחפת.

```
S11 / S12 chat:  "...option [Lease_2026.pdf · p.2] ."  ->  "...option [chip]."   (no floating period)
```

### 8. חוסר עקביות: "FAST 2B" עדיין בכמה מקומות אחרי שהצ'יפ הפך ל-"FAST"

חומרה: זעיר. מאמץ: קטן.
בשורת הסטטוס של המגירה ובתחתית סרגל הצד בדסקטופ עדיין כתוב "FAST 2B", בזמן שצ'יפ הכותרת
כבר "FAST".

```
drawer footer / desktop sidebar footer:  "FAST 2B · OUT 0 B"  ->  "FAST · OUT 0 B"
```

### 9. משטחי בחירת מודל עדיין מובילים ב-tok/s + גודל למשתמש רגיל

חומרה: קטן, אופציונלי. מאמץ: קטן.
בגיליון "New chat" ובכרטיסי הכספת רשימת המודלים פותחת ב-"~52 tok/s · 533 MB" וכו'. השם
הידידותי + FITS/SELECTED מספיק לרוב; אפשר להנמיך את שורת המספרים או לדחוף ל-Details.

---

## E. מעבר לגדר, לשיקול משה (מבנה או עיקרון עיצוב, לא ברשימה)

- שורת הפעולות מתחת לתשובה עדיין קבועה (ארבעה כפתורים), בזמן שהאפיון ומערכת העיצוב אומרים
  לחיצה ארוכה. בדמו זה קביל, אבל שים לב שהבנייה האמיתית תלך ללחיצה ארוכה ולא תעתיק שורה קבועה.
- להסיר את tok/s לגמרי מכל משטחי הבחירה (לא רק מהתווית) ולהמיר למילה. זה נוגע בעיקרון
  "מספרים לא שמות תואר", ולכן החלטה שלך.
- להעלות את הכספת / מסמכים / פרסונות לרמת ניווט עליונה במקום רק בתוך המגירה. זה מבנה ניווט.

---

## F. פסק דין

מספיק פשוט אחרי שלושת תיקוני האונבורדינג (1–3). שאר הפריטים (4–9) הם ליטוש ולא חוסמים.
אף אחד לא נוגע במבנה, בפיצ'רים, בניווט או בשפה החזותית.

מה טוב, ולא לגעת:
- האונבורדינג ברור ומהיר; טקס מצב הטיסה מצוין.
- השמות INSTANT / FAST / SHARP והחותם היחיד עובדים; ההודעה הראשונה בלחיצה אחת.
- מחיקת-הכל עם אזהרה נקייה ואופציית מודלים נפרדת — מופתי.
- כספת: הורדה עם Pause, מודל אחד טעון בכל רגע, החלפה נקייה. מסך נעילה רגוע ועל המותג.
- הערכה הבהירה והדסקטופ תקינים, בלי גלילה אופקית.

מה לא יכולתי לאמת:
- צ'יפי ציטוט בתוך תשובה בעברית (RTL): הדמו לא מריץ תשובת-מסמך בעברית, אז דחיפת dir="ltr"
  על הצ'יפים צריכה אימות בבנייה האמיתית. שאר ה-RTL שנבדק (בועת משתמש בעברית מול תשובה
  באנגלית) תקין.

ניקוי: הרצתי דפדפן ללא-ראש שנסגר לבד; לא נשאר תהליך פתוח שלי. יש Chrome for Testing שרץ
אבל הוא של סשן אחר (fbcloud), לא נגעתי בו.
