#!/usr/bin/env python3
"""Writes pass 33's bridge scripts into this folder. Run from docs/qa/ios-device-pass-33/scripts.
Round 128 on the phone, on the real free tier of a fresh twin (no setTier anywhere: pass 32 showed setTier("free")
does not restore the real tier). J0 the brand ring on Welcome, Sealed, lock, chat header and empty state; J1 the
composer while the model loads; J2 the founder's route: a café photo filed in the library under a Hebrew name, tapped
from the [+] sheet's library list, asked about on Instant; J3 the same on Fast without its photo pack; J4 the receipt
through the same route on Fast; J5 Spanish, code and the office-hours document on Fast.
The library rows are `attach-<document id>`; the chain reads the id from Documents/documents.json after the filing
script and writes the `*-tap` scripts with `tap <id>`, so the id is never guessed."""
import json, sys

BANNED = ["The request specifies", "I will focus", "as an AI", "NOT_FOUND", "<<<"]
BLIND = ["cannot see", "can't see", "text-based", "Your documents don't mention", "unable to see", "not able to see"]
NONE_MATCHED = "Nothing in your documents matched this question"
CAFE = "בית קפה הגינה תפריט.jpg"
RECEIPT = "קבלה מהסופר.png"
SEE = "What do you see in the photo?"
TOTAL = "What is the total on this receipt?"
LABEL = "office-hours.txt · part"


def new_chat(loaded=True):
    steps = [
        {"op": "deeplink", "url": "/chats"},
        {"op": "waitFor", "testID": "new-chat", "timeoutMs": 15000},
        {"op": "press", "testID": "new-chat"},
        {"op": "waitFor", "testID": "start-chat", "timeoutMs": 10000},
        {"op": "press", "testID": "start-chat"},
        {"op": "waitFor", "testID": "composer-input", "timeoutMs": 30000},
    ]
    if loaded:
        steps += [{"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 180000}, {"op": "sleep", "ms": 1500}, {"op": "value", "testID": "model-chip"}]
    return steps


def answer(first_ms=240000, done_ms=400000):
    return [
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": first_ms},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": done_ms},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "assistant-text"},
    ]


def ask(text):
    return [{"op": "type", "testID": "composer-input", "text": text}, {"op": "send"}, *answer()]


def absent(words, testID="assistant-text"):
    return [{"op": "assertText", "text": w, "testID": testID, "absent": True} for w in words]


def file_picture(name, shot):
    """Files a picture into the library through the dev `attach:` door (library.importFile, as a picked or shared file),
    in a throwaway chat; round 128 turns that attachment into a composer photo there, and the document stays in the library."""
    return [
        *new_chat(),
        {"op": "devPrompt", "lines": [f"attach: {name}"]},
        {"op": "waitFor", "testID": "pending-images", "timeoutMs": 60000},
        {"op": "sleep", "ms": 2000},
        {"op": "screenshot", "name": f"{shot}-filing-chat"},
        {"op": "dump", "name": f"{shot}-filing-chat"},
    ]


def open_sheet(shot):
    return [
        {"op": "press", "testID": "attach"},
        {"op": "waitFor", "testID": "attach-sheet", "timeoutMs": 10000},
        {"op": "sleep", "ms": 1200},
        {"op": "screenshot", "name": f"{shot}-library-list"},
        {"op": "dump", "name": f"{shot}-sheet"},
    ]


def tap_row(doc_id, shot):
    return [
        {"op": "value", "testID": f"attach-{doc_id}"},
        {"op": "press", "testID": f"attach-{doc_id}"},
        {"op": "waitFor", "testID": "attach-sheet", "gone": True, "timeoutMs": 10000},
        {"op": "waitFor", "testID": "pending-images", "timeoutMs": 30000},
        {"op": "sleep", "ms": 1500},
        {"op": "waitFor", "testID": "attached-docs", "gone": True, "timeoutMs": 1000},
        {"op": "value", "testID": "pending-images"},
        {"op": "screenshot", "name": f"{shot}-a-thumbnail-chip"},
    ]


def write(name, note, steps):
    with open(f"{name}.json", "w") as f:
        json.dump({"_": note, "steps": steps}, f, indent=1, ensure_ascii=False)
        f.write("\n")


def base():
    write("j0-ring", "J0 (round 128): the brand ring. Welcome's open ring; Sealed caught while it closes (two shots 300 ms apart) and the final sealed mark; lock; the chat's empty state and header mark. Onboarding goes through 'Start now with Instant'.", [
        {"op": "waitFor", "testID": "onboarding-welcome", "timeoutMs": 120000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "onboarding-welcome"},
        {"op": "screenshot", "name": "J0-01-welcome-open-ring"},
        {"op": "press", "testID": "onboarding-continue"},
        {"op": "waitFor", "testID": "onboarding-model", "timeoutMs": 30000},
        {"op": "sleep", "ms": 2500},
        {"op": "value", "testID": "start-now-with"},
        {"op": "press", "testID": "start-now-with"},
        {"op": "waitFor", "testID": "onboarding-sealed", "timeoutMs": 30000},
        {"op": "screenshot", "name": "J0-02-sealed-closing-a"},
        {"op": "sleep", "ms": 300},
        {"op": "screenshot", "name": "J0-03-sealed-closing-b"},
        {"op": "sleep", "ms": 4000},
        {"op": "value", "testID": "onboarding-sealed"},
        {"op": "screenshot", "name": "J0-04-sealed-final"},
        {"op": "press", "testID": "sealed-start"},
        {"op": "waitFor", "testID": "onboarding-lock", "timeoutMs": 30000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "onboarding-lock"},
        {"op": "screenshot", "name": "J0-05-lock-step"},
        {"op": "dump", "name": "lock-step"},
        {"op": "press", "testID": "lock-start"},
        {"op": "waitFor", "testID": "composer-input", "timeoutMs": 60000},
        {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 120000},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "model-chip"},
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        {"op": "screenshot", "name": "J0-06-chat-empty-state-and-header"},
        {"op": "dump", "name": "chat-empty"},
    ])

    write("j1b-switch-loading", "J1 (round 128): the model loads at launch, so the loading window is made by a switch: Instant chosen, then Fast chosen from the model sheet; while 'Loading' is on screen the field takes 'hello while loading' and Send waits; once ready, Send answers. The bridge types through onChangeText: it cannot raise the system keyboard.", [
        *new_chat(),
        {"op": "press", "testID": "model-chip"},
        {"op": "waitFor", "testID": "model-sheet-use-instant", "timeoutMs": 10000},
        {"op": "press", "testID": "model-sheet-use-instant"},
        {"op": "sleep", "ms": 2000},
        {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 120000},
        {"op": "sleep", "ms": 1500},
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        {"op": "press", "testID": "model-chip"},
        {"op": "waitFor", "testID": "model-sheet-use-fast", "timeoutMs": 10000},
        {"op": "press", "testID": "model-sheet-use-fast"},
        {"op": "waitFor", "text": "Loading", "timeoutMs": 5000},
        {"op": "type", "testID": "composer-input", "text": "hello while loading"},
        {"op": "assertText", "text": "Loading"},
        {"op": "value", "testID": "model-chip"},
        {"op": "screenshot", "name": "J1b-01-typed-while-loading"},
        {"op": "dump", "name": "composer-while-loading"},
        {"op": "assertText", "text": "Loading"},
        {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 180000},
        {"op": "sleep", "ms": 1000},
        {"op": "value", "testID": "model-chip"},
        {"op": "screenshot", "name": "J1b-02-ready-text-kept"},
        {"op": "send"},
        *answer(),
        {"op": "screenshot", "name": "J1b-03-after-send-answer"},
    ])

    write("j2-file-cafe", f"J2 part 1: the café's chalk menu filed in the library as '{CAFE}', then a NEW chat on Instant and the [+] sheet's library list.", [
        *file_picture(CAFE, "J2-00"),
        *new_chat(),
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        {"op": "waitFor", "testID": "pending-images", "gone": True, "timeoutMs": 1000},
        *open_sheet("J2-01"),
    ])

    write("j3-file-open", "J3 part 1: on Fast (its photo pack NOT installed), a new chat and the [+] sheet's library list holding the café picture.", [
        *new_chat(),
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        *open_sheet("J3-01"),
    ])

    write("j4-file-receipt", f"J4 part 1: the clean receipt filed in the library as '{RECEIPT}' on Fast, then a new chat and the library list.", [
        *file_picture(RECEIPT, "J4-00"),
        *new_chat(),
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        {"op": "waitFor", "testID": "pending-images", "gone": True, "timeoutMs": 1000},
        *open_sheet("J4-01"),
    ])

    write("j5a-fast-spanish", "J5a: on Fast, yesterday's Real Madrid match: an honest 'cannot know' in Spanish.", [
        *new_chat(),
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        *ask("¿Quién ganó el partido del Real Madrid ayer?"),
        {"op": "screenshot", "name": "J5a-real-madrid"},
        *absent(BANNED),
    ])

    write("j5b-fast-code", "J5b: on Fast, a Python palindrome function.", [
        *new_chat(),
        *ask("Write a Python function that checks if a word is a palindrome"),
        {"op": "assertText", "text": "def ", "testID": "assistant-text"},
        {"op": "screenshot", "name": "J5b-palindrome"},
        {"op": "dump", "name": "chat-palindrome"},
    ])

    write("j5c2-fast-documents", "J5c on Fast (pass 32's J5): office-hours.txt attached; the index card's Download pressed (no index model on this twin yet); 555-0134 with SOURCES and no label line.", [
        *new_chat(),
        {"op": "devPrompt", "lines": ["attach: office-hours.txt"]},
        {"op": "waitFor", "testID": "attached-docs", "timeoutMs": 30000},
        {"op": "sleep", "ms": 3000},
        {"op": "value", "testID": "attached-docs"},
        {"op": "type", "testID": "composer-input", "text": "What is the office phone number?"},
        {"op": "send"},
        {"op": "waitFor", "testID": "docs-hold", "timeoutMs": 15000},
        {"op": "sleep", "ms": 800},
        {"op": "value", "testID": "docs-hold"},
        {"op": "screenshot", "name": "J5c-01-index-card"},
        {"op": "press", "testID": "docs-hold-download"},
        {"op": "sleep", "ms": 6000},
        {"op": "value", "testID": "docs-hold-body"},
        {"op": "idleTimer"},
        {"op": "waitFor", "testID": "docs-hold", "gone": True, "timeoutMs": 2400000},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 400000},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 600000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "assistant-text"},
        {"op": "waitFor", "testID": "citations", "timeoutMs": 30000},
        {"op": "value", "testID": "citations"},
        {"op": "screenshot", "name": "J5c-02-matching-answer"},
        {"op": "assertText", "text": "555-0134", "testID": "assistant-text"},
        {"op": "assertText", "text": LABEL, "testID": "assistant-text", "absent": True},
    ])

    write("j6-1-fast-probe", "Fast from the model sheet (pass 32's J6); progress when it appears and 60 s later.", [
        *new_chat(),
        {"op": "press", "testID": "model-chip"},
        {"op": "waitFor", "testID": "model-sheet", "timeoutMs": 10000},
        {"op": "sleep", "ms": 1000},
        {"op": "press", "testID": "model-sheet-download-fast"},
        {"op": "waitFor", "testID": "model-sheet-confirm-fast", "timeoutMs": 5000},
        {"op": "sleep", "ms": 500},
        {"op": "press", "testID": "model-sheet-go-fast"},
        {"op": "waitFor", "testID": "model-sheet-progress-fast", "timeoutMs": 60000},
        {"op": "value", "testID": "model-sheet-progress-fast"},
        {"op": "sleep", "ms": 60000},
        {"op": "value", "testID": "model-sheet-progress-fast"},
        {"op": "screenshot", "name": "F-01-fast-60s"},
    ])

    write("j6-2-fast-use", "Wait for Use on the sheet, press it, Fast loads.", [
        {"op": "idleTimer"},
        {"op": "waitFor", "testID": "model-sheet-use-fast", "timeoutMs": 1500000},
        {"op": "value", "testID": "model-sheet-use-fast"},
        {"op": "press", "testID": "model-sheet-use-fast"},
        {"op": "sleep", "ms": 3000},
        {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 240000},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "model-chip"},
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        {"op": "screenshot", "name": "F-02-fast-selected"},
    ])


def taps(cafe_id, receipt_id):
    if cafe_id:
        write("j2-tap-cafe", "J2 part 2 (the founder's route): tap the café picture in the library list. Expect a thumbnail chip, no paperclip; 'What do you see in the photo?' answered with a description, no blind words, no 'Nothing in your documents matched' banner.", [
            *tap_row(cafe_id, "J2-02"),
            {"op": "type", "testID": "composer-input", "text": SEE},
            {"op": "sleep", "ms": 800},
            {"op": "screenshot", "name": "J2-03-question-typed"},
            {"op": "send"},
            {"op": "sleep", "ms": 3000},
            {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1000},
            {"op": "waitFor", "testID": "user-images", "timeoutMs": 30000},
            *answer(),
            {"op": "sleep", "ms": 2000},
            {"op": "screenshot", "name": "J2-04-answer-and-banner-area"},
            {"op": "dump", "name": "chat-cafe-instant"},
            {"op": "waitFor", "testID": "none-matched", "gone": True, "timeoutMs": 1000},
            {"op": "assertText", "text": NONE_MATCHED, "absent": True},
            *absent(BLIND + BANNED),
        ])
        write("j3-tap-cafe-fast", "J3 part 2: on Fast without its pack, tap the café picture, ask; Send shows the photo-pack card and no blind answer. Download the pack from the card; the photo then sends by itself and is described.", [
            *tap_row(cafe_id, "J3-02"),
            {"op": "type", "testID": "composer-input", "text": SEE},
            {"op": "send"},
            {"op": "waitFor", "testID": "vision-hold", "timeoutMs": 15000},
            {"op": "sleep", "ms": 1200},
            {"op": "value", "testID": "vision-hold-title"},
            {"op": "value", "testID": "vision-hold-body"},
            {"op": "value", "testID": "vision-hold-download"},
            {"op": "waitFor", "testID": "assistant-text", "gone": True, "timeoutMs": 1000},
            {"op": "screenshot", "name": "J3-03-pack-card"},
            {"op": "dump", "name": "chat-cafe-fast-card"},
            {"op": "press", "testID": "vision-hold-download"},
            {"op": "waitFor", "testID": "vision-hold-progress", "timeoutMs": 30000},
            {"op": "sleep", "ms": 5000},
            {"op": "value", "testID": "vision-hold-body"},
            {"op": "idleTimer"},
            {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 2400000},
            {"op": "waitFor", "testID": "user-images", "timeoutMs": 60000},
            *answer(first_ms=600000, done_ms=600000),
            {"op": "sleep", "ms": 2000},
            {"op": "screenshot", "name": "J3-04-answer-on-fast"},
            {"op": "assertText", "text": NONE_MATCHED, "absent": True},
            *absent(BLIND + BANNED),
        ])
    if receipt_id:
        write("j4-tap-receipt", "J4 part 2: tap the receipt in the library list on Fast (pack installed); 'What is the total on this receipt?' expects 15.09, no 'not found' banner; source chip recorded either way.", [
            *tap_row(receipt_id, "J4-02"),
            {"op": "type", "testID": "composer-input", "text": TOTAL},
            {"op": "send"},
            {"op": "sleep", "ms": 3000},
            {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1000},
            {"op": "waitFor", "testID": "user-images", "timeoutMs": 30000},
            *answer(first_ms=600000, done_ms=600000),
            {"op": "sleep", "ms": 2500},
            {"op": "screenshot", "name": "J4-03-answer"},
            {"op": "dump", "name": "chat-receipt-fast"},
            {"op": "assertText", "text": "15.09", "testID": "assistant-text"},
            {"op": "assertText", "text": NONE_MATCHED, "absent": True},
            *absent(BLIND),
        ])


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "tap":
        taps(sys.argv[2] if len(sys.argv) > 2 else "", sys.argv[3] if len(sys.argv) > 3 else "")
    else:
        base()
