#!/usr/bin/env python3
"""Writes pass 34's bridge scripts into this folder. Run from docs/qa/ios-device-pass-34/scripts.
Round 129 on the phone, on the real free tier of a fresh twin (no setTier anywhere). J1 the founder's route: a PDF with a
Hebrew name attached on Instant with no index model, the hold card, its Download, the answer. J5 regressions of build 33:
a library picture on Instant, text typed while a model loads, one text turn on Fast. J4 Erase everything with the models
toggle OFF: Fast stays and loads. J2 Erase everything with the toggle ON: the model step offers Fast as a download, Instant
answers, the PDF gets a Download card. J3 the founder's stale vault.json pushed with the app stopped: the launch heals it.
The library rows are `attach-<document id>`; the chain reads the id from Documents/documents.json after the filing
script and writes the `*-tap` script with `tap <id>`, so the id is never guessed."""
import json, sys

BANNED = ["The request specifies", "I will focus", "as an AI", "NOT_FOUND", "<<<"]
BLIND = ["cannot see", "can't see", "text-based", "Your documents don't mention", "unable to see", "not able to see"]
NONE_MATCHED = "Nothing in your documents matched this question"
COULD_NOT = "Could not load"
CAFE = "בית קפה הגינה תפריט.jpg"
PDF = "דוח טורבינה.pdf"
SEE = "What do you see in the photo?"
SERIAL = "What is the serial number of the Rakovsky turbine?"


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


def onboard(shot, start):
    """Welcome → model step (shot + dump) → `start` (start-now-with or start-chatting) → sealed → lock → chat."""
    return [
        {"op": "waitFor", "testID": "onboarding-continue", "timeoutMs": 120000},
        {"op": "sleep", "ms": 1200},
        {"op": "press", "testID": "onboarding-continue"},
        {"op": "waitFor", "testID": "onboarding-model", "timeoutMs": 30000},
        {"op": "sleep", "ms": 2500},
        {"op": "value", "testID": "onboarding-model"},
        {"op": "screenshot", "name": f"{shot}-model-step"},
        {"op": "dump", "name": f"{shot}-model-step"},
        {"op": "value", "testID": start},
        {"op": "press", "testID": start},
        {"op": "waitFor", "testID": "sealed-start", "timeoutMs": 30000},
        {"op": "sleep", "ms": 5000},
        {"op": "press", "testID": "sealed-start"},
        {"op": "waitFor", "testID": "lock-start", "timeoutMs": 20000},
        {"op": "press", "testID": "lock-start"},
        {"op": "waitFor", "testID": "composer-input", "timeoutMs": 60000},
        {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 180000},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "model-chip"},
    ]


def wipe(shot, models):
    steps = [
        {"op": "deeplink", "url": "/settings"},
        {"op": "waitFor", "testID": "row-wipe", "timeoutMs": 15000},
        {"op": "scrollTo", "testID": "row-wipe"},
        {"op": "press", "testID": "row-wipe"},
        {"op": "waitFor", "testID": "wipe-models", "timeoutMs": 10000},
        {"op": "sleep", "ms": 800},
    ]
    if models:
        steps += [{"op": "press", "testID": "wipe-models"}, {"op": "sleep", "ms": 800}]
    return steps + [
        {"op": "value", "testID": "wipe-models"},
        {"op": "screenshot", "name": f"{shot}-wipe-models-{'on' if models else 'off'}"},
        {"op": "dump", "name": f"{shot}-wipe"},
        {"op": "press", "testID": "wipe-step1"},
        {"op": "waitFor", "testID": "wipe-step2", "timeoutMs": 10000},
        {"op": "sleep", "ms": 800},
        {"op": "press", "testID": "wipe-step2"},
        {"op": "sleep", "ms": 6000},
    ]


def vault(shot):
    return [
        {"op": "deeplink", "url": "/vault"},
        {"op": "sleep", "ms": 5000},
        {"op": "screenshot", "name": f"{shot}-vault"},
        {"op": "dump", "name": f"{shot}-vault"},
    ]


def pdf_card(shot):
    """A new chat, the PDF attached through the attach sheet's file door, the question sent: the index-model card."""
    return [
        *new_chat(),
        {"op": "devPrompt", "lines": [f"attach: {PDF}"]},
        {"op": "waitFor", "testID": "attached-docs", "timeoutMs": 30000},
        {"op": "sleep", "ms": 3000},
        {"op": "value", "testID": "attached-docs"},
        {"op": "type", "testID": "composer-input", "text": SERIAL},
        {"op": "send"},
        {"op": "waitFor", "testID": "docs-hold", "timeoutMs": 15000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "docs-hold"},
        {"op": "value", "testID": "docs-hold-body"},
        {"op": "value", "testID": "docs-hold-download"},
        {"op": "assertText", "text": "468 MB", "testID": "docs-hold"},
        {"op": "assertText", "text": "100%", "testID": "docs-hold", "absent": True},
        {"op": "assertText", "text": "Downloading", "testID": "docs-hold", "absent": True},
        {"op": "screenshot", "name": f"{shot}-card-before"},
        {"op": "dump", "name": f"{shot}-card"},
        {"op": "sleep", "ms": 10000},
        {"op": "value", "testID": "docs-hold-body"},
        {"op": "assertText", "text": "100%", "testID": "docs-hold", "absent": True},
        {"op": "screenshot", "name": f"{shot}-card-10s-later"},
    ]


def file_picture(name, shot):
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
    write("j0-onboard", "Fresh twin: Welcome, the model step, 'Start now with Instant', the chat on Instant.", [
        *onboard("J0-01", "start-now-with"),
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        {"op": "screenshot", "name": "J0-02-chat-instant"},
    ])

    write("j1-pdf-download", f"J1 (the founder's route): Instant, no index model. '{PDF}' attached, a question sent: the card names the 468 MB index model with Download and never says 100%. Download pressed: progress, then the message goes out by itself and the answer uses the PDF with sources.", [
        *pdf_card("J1-01"),
        {"op": "press", "testID": "docs-hold-download"},
        {"op": "sleep", "ms": 2500},
        {"op": "value", "testID": "docs-hold-body"},
        {"op": "screenshot", "name": "J1-02-progress-a"},
        {"op": "sleep", "ms": 6000},
        {"op": "value", "testID": "docs-hold-body"},
        {"op": "screenshot", "name": "J1-03-progress-b"},
        {"op": "idleTimer"},
        {"op": "waitFor", "testID": "docs-hold", "gone": True, "timeoutMs": 2400000},
        *answer(first_ms=400000, done_ms=600000),
        {"op": "waitFor", "testID": "citations", "timeoutMs": 30000},
        {"op": "value", "testID": "citations"},
        {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": "J1-04-answer-with-source"},
        {"op": "dump", "name": "J1-04-answer"},
        {"op": "assertText", "text": "RK-4417", "testID": "assistant-text"},
        {"op": "assertText", "text": NONE_MATCHED, "absent": True},
        {"op": "assertText", "text": COULD_NOT, "absent": True},
        *absent(BANNED),
    ])

    write("j5-file-cafe", f"J5 part 1: the café's chalk menu filed in the library as '{CAFE}', then a NEW chat on Instant and the [+] sheet's library list.", [
        *file_picture(CAFE, "J5-00"),
        *new_chat(),
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        {"op": "waitFor", "testID": "pending-images", "gone": True, "timeoutMs": 1000},
        *open_sheet("J5-01"),
    ])

    write("f1-fast-download", "Fast from the model sheet; progress when it appears and 60 s later.", [
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

    write("f2-fast-use", "Wait for Use on the sheet, press it, Fast loads.", [
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

    write("j5-loading", "J5 (build 33's J1b): Instant chosen, then Fast chosen from the model sheet; while 'Loading' is on screen the field takes 'hello while loading'; once ready, Send answers on Fast. The bridge types through onChangeText: it cannot raise the system keyboard.", [
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
        {"op": "value", "testID": "composer-input"},
        {"op": "value", "testID": "model-chip"},
        {"op": "screenshot", "name": "J5-04-typed-while-loading"},
        {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 180000},
        {"op": "sleep", "ms": 1000},
        {"op": "value", "testID": "composer-input"},
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        {"op": "send"},
        *answer(),
        {"op": "screenshot", "name": "J5-05-loading-text-answered"},
    ])

    write("j5-fast-text", "J5: one plain text turn on Fast (this is also 'Fast used in a chat' for J4 and J2).", [
        *new_chat(),
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        *ask("Give me two short tips for sleeping better."),
        {"op": "screenshot", "name": "J5-06-fast-text-turn"},
        {"op": "assertText", "text": COULD_NOT, "absent": True},
        *absent(BANNED),
    ])

    write("j4-wipe-off", "J4: Settings > Erase everything with 'also delete models' left OFF.", wipe("J4-01", False))

    write("j4-onboard", "J4 after the wipe: Welcome, the model step (Fast should still be on the phone), Start chatting, the chat.", [
        *onboard("J4-02", "start-chatting"),
        {"op": "screenshot", "name": "J4-03-chat-after-wipe"},
        {"op": "assertText", "text": COULD_NOT, "absent": True},
    ])

    write("j4-fast-turn", "J4: Fast answers after the models-off wipe (a new chat, a text turn).", [
        *new_chat(),
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        *ask("Name three colours of the rainbow."),
        {"op": "screenshot", "name": "J4-04-fast-answers"},
        {"op": "assertText", "text": COULD_NOT, "absent": True},
        *vault("J4-05"),
    ])

    write("j4-relaunch-fast", "J4: after a relaunch (weights no longer in memory) Fast loads from disk and answers.", [
        *new_chat(),
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        *ask("What is two plus two?"),
        {"op": "screenshot", "name": "J4-06-fast-after-relaunch"},
        {"op": "assertText", "text": COULD_NOT, "absent": True},
    ])

    write("j2-wipe-on", "J2: Settings > Erase everything with 'also delete models' ON (Fast installed and used in a chat).", wipe("J2-01", True))

    write("j2-onboard", "J2 after the wipe: the model step must offer 'Download Fast · 1.28 GB', not ready; 'Start now with Instant'; the chat on Instant answers with no 'Could not load' line.", [
        {"op": "waitFor", "testID": "onboarding-continue", "timeoutMs": 120000},
        {"op": "sleep", "ms": 1200},
        {"op": "press", "testID": "onboarding-continue"},
        {"op": "waitFor", "testID": "onboarding-model", "timeoutMs": 30000},
        {"op": "sleep", "ms": 2500},
        {"op": "value", "testID": "onboarding-model"},
        {"op": "value", "testID": "download-model"},
        {"op": "assertText", "text": "Download Fast", "testID": "download-model"},
        {"op": "assertText", "text": "1.28 GB", "testID": "download-model"},
        {"op": "value", "testID": "start-now-with"},
        {"op": "screenshot", "name": "J2-02-model-step"},
        {"op": "dump", "name": "J2-02-model-step"},
        {"op": "press", "testID": "start-now-with"},
        {"op": "waitFor", "testID": "sealed-start", "timeoutMs": 30000},
        {"op": "sleep", "ms": 5000},
        {"op": "press", "testID": "sealed-start"},
        {"op": "waitFor", "testID": "lock-start", "timeoutMs": 20000},
        {"op": "press", "testID": "lock-start"},
        {"op": "waitFor", "testID": "composer-input", "timeoutMs": 60000},
        {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 180000},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "model-chip"},
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        *ask("What is the capital of France?"),
        {"op": "screenshot", "name": "J2-03-chat-instant-answers"},
        {"op": "assertText", "text": COULD_NOT, "absent": True},
        *vault("J2-04"),
    ])

    write("j2-pdf-card", f"J2: '{PDF}' attached again after the wipe: the Download card, never 100%.", [
        *pdf_card("J2-05"),
        {"op": "assertText", "text": COULD_NOT, "absent": True},
    ])

    write("j3-launch", "J3: the founder's stale vault.json (fast, embed-e5, vision-qwen35-2b installed, default fast; their files absent) pushed while the twin was stopped; this launch must heal it.", [
        {"op": "waitFor", "testID": "composer-input", "timeoutMs": 60000},
        {"op": "sleep", "ms": 8000},
        {"op": "value", "testID": "model-chip"},
        {"op": "value", "testID": "model-missing"},
        {"op": "screenshot", "name": "J3-01-first-screen-after-launch"},
        {"op": "dump", "name": "J3-01-first-screen"},
        *new_chat(),
        {"op": "value", "testID": "model-missing"},
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        *ask("Say hello in one short sentence."),
        {"op": "screenshot", "name": "J3-02-chat-instant"},
        {"op": "assertText", "text": COULD_NOT, "absent": True},
        *vault("J3-03"),
    ])


def taps(cafe_id):
    write("j5-tap-cafe", "J5 part 2 (build 33's J2): tap the café picture in the library list on Instant. Expect a thumbnail chip, no paperclip; 'What do you see in the photo?' answered with a description, no blind words, no 'Nothing in your documents matched' banner.", [
        *tap_row(cafe_id, "J5-02"),
        {"op": "type", "testID": "composer-input", "text": SEE},
        {"op": "send"},
        {"op": "sleep", "ms": 3000},
        {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1000},
        {"op": "waitFor", "testID": "user-images", "timeoutMs": 30000},
        *answer(),
        {"op": "sleep", "ms": 2000},
        {"op": "screenshot", "name": "J5-03-photo-answer"},
        {"op": "dump", "name": "J5-03-chat-cafe-instant"},
        {"op": "waitFor", "testID": "none-matched", "gone": True, "timeoutMs": 1000},
        {"op": "assertText", "text": NONE_MATCHED, "absent": True},
        *absent(BLIND + BANNED),
    ])


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "tap":
        taps(sys.argv[2])
    else:
        base()
