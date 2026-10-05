#!/usr/bin/env python3
"""Writes pass 35's bridge scripts into this folder. Run from docs/qa/ios-device-pass-35/scripts.
Round 130 on the phone, on the real free tier of a fresh twin (no setTier anywhere). J1 a new user on Instant asks about a
visual PDF page (the founder's file runs from `p1-founder`, whose output stays in the ignored private/ folder; the synthetic
visual-page.pdf is the committed proof), then a follow-up. J3 a text PDF held for the index model. J2 Fast without its
photo pack: the three exits of the pack card (Remove the photo, Switch to INSTANT, Download). J4 the offline doors with
the bridge's simulated-offline `network` step (the vault mid-download, onboarding after a wipe, the index card). J5
regressions of build 34. The library rows are `attach-<document id>`; the chain reads the id from the sheet dump and
writes the `*-tap` script with `tap <id>`, so the id is never guessed."""
import json, sys

BANNED = ["The request specifies", "I will focus", "as an AI", "NOT_FOUND", "<<<"]
BLIND = ["cannot see", "can't see", "cannot physically see", "see images", "text-based", "unable to see", "not able to see"]
NONE_MATCHED = "Nothing in your documents matched this question"
COULD_NOT = "Could not load"
DONT_MENTION = "Your documents don't mention this"
THIN = "I can read only the text of this page"
CAFE = "בית קפה הגינה תפריט.jpg"
FOUNDER = "קובץ פרטי.pdf"
VISUAL = "visual-page.pdf"
TURBINE = "turbine-report-3pages.pdf"
SEE = "What do you see?"
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


def done(done_ms=400000):
    return [
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": done_ms},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "assistant-text"},
    ]


def answer(first_ms=240000, done_ms=400000):
    return [{"op": "waitFor", "testID": "assistant-text", "timeoutMs": first_ms}, *done(done_ms)]


def ask(text):
    return [{"op": "type", "testID": "composer-input", "text": text}, {"op": "send"}, *answer()]


def absent(words, testID="assistant-text"):
    return [{"op": "assertText", "text": w, "testID": testID, "absent": True} for w in words]


def use_model(mid, chip):
    return [
        *new_chat(),
        {"op": "press", "testID": "model-chip"},
        {"op": "waitFor", "testID": f"model-sheet-use-{mid}", "timeoutMs": 10000},
        {"op": "press", "testID": f"model-sheet-use-{mid}"},
        {"op": "sleep", "ms": 3000},
        {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 240000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "model-chip"},
        {"op": "assertText", "text": chip, "testID": "model-chip"},
    ]


def attach(name, kind="attached-docs"):
    return [
        {"op": "devPrompt", "lines": [f"attach: {name}"]},
        {"op": "waitFor", "testID": kind, "timeoutMs": 60000},
        {"op": "sleep", "ms": 8000},
        {"op": "value", "testID": kind},
    ]


def page_turn(shot, question=SEE, words=False, typed=True):
    """Send, then the first token (the send/press step + this waitFor = Send to first token on screen), then the bubble.
    words: a fresh install has no index model, so Send shows its card first; 'Send, exact words only' is the press."""
    go = [{"op": "type", "testID": "composer-input", "text": question}, {"op": "send"}] if typed else []
    if words:
        go += [
            {"op": "waitFor", "testID": "docs-hold", "timeoutMs": 15000},
            {"op": "sleep", "ms": 1500},
            {"op": "value", "testID": "docs-hold-body"},
            {"op": "screenshot", "name": f"{shot}-index-card"},
            {"op": "press", "testID": "docs-hold-words"},
        ]
    return [
        *go,
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 240000},
        {"op": "value", "testID": "user-images"},
        {"op": "screenshot", "name": f"{shot}-sent-bubble"},
        {"op": "dump", "name": f"{shot}-sent-bubble"},
        *done(),
        {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": f"{shot}-answer"},
        {"op": "dump", "name": f"{shot}-answer"},
        {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1000},
        {"op": "waitFor", "testID": "docs-hold", "gone": True, "timeoutMs": 1000},
        *absent(BLIND + BANNED + [DONT_MENTION]),
    ]


def onboard(shot, start):
    return [
        {"op": "waitFor", "testID": "onboarding-continue", "timeoutMs": 120000},
        {"op": "sleep", "ms": 1200},
        {"op": "press", "testID": "onboarding-continue"},
        {"op": "waitFor", "testID": "onboarding-model", "timeoutMs": 30000},
        {"op": "sleep", "ms": 2500},
        {"op": "value", "testID": "onboarding-model"},
        {"op": "screenshot", "name": f"{shot}-model-step"},
        {"op": "dump", "name": f"{shot}-model-step"},
        *seal(start),
    ]


def seal(start):
    return [
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


def pack_card(shot):
    """A new chat on Fast (no photo pack), the visual PDF, 'What do you see?': the pack card, the message kept."""
    return [
        *new_chat(),
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        *attach(VISUAL),
        {"op": "type", "testID": "composer-input", "text": SEE},
        {"op": "send"},
        {"op": "waitFor", "testID": "vision-hold", "timeoutMs": 30000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "vision-hold"},
        {"op": "assertText", "text": "668 MB", "testID": "vision-hold"},
        {"op": "waitFor", "testID": "assistant-text", "gone": True, "timeoutMs": 1000},
        {"op": "screenshot", "name": f"{shot}-pack-card"},
        {"op": "dump", "name": f"{shot}-pack-card"},
    ]


def write(name, note, steps):
    with open(f"{name}.json", "w") as f:
        json.dump({"_": note, "steps": steps}, f, indent=1, ensure_ascii=False)
        f.write("\n")


def base():
    write("p0-onboard", "J1: a fresh twin, Welcome, the model step, 'Start now with Instant', the chat on Instant.", [
        *onboard("J1-01", "start-now-with"),
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        {"op": "screenshot", "name": "J1-02-chat-instant"},
    ])

    write("p1-founder", f"J1 PRIVATE: the founder's own PDF as '{FOUNDER}' on Instant, 'What do you see?'. Output stays in private/.", [
        *new_chat(),
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        *attach(FOUNDER),
        {"op": "screenshot", "name": "P-01-composer-chip"},
        *page_turn("P-02"),
    ])

    write("p1e-founder-words", f"J1 PRIVATE: a new chat on Instant, '{FOUNDER}', 'What do you see?'; the index card (no index model yet), 'Send, exact words only'.", [
        *new_chat(),
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        *attach(FOUNDER),
        *page_turn("P-03", words=True),
    ])

    write("p1c-founder-indexed", f"J1 PRIVATE, after J3 installed the index model: a new chat on Instant, '{FOUNDER}', 'What do you see?' with no card.", [
        *new_chat(),
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        *attach(FOUNDER),
        *page_turn("P-04"),
    ])

    write("p2c-visual-indexed", f"J1 after J3 installed the index model: a new chat on Instant, '{VISUAL}', 'What do you see?' with no card.", [
        *new_chat(),
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        *attach(VISUAL),
        *page_turn("J1-06"),
    ])

    write("p2a-visual", f"J1: the synthetic '{VISUAL}' on Instant, 'What do you see?': the page picture in the sent bubble, then a description.", [
        *new_chat(),
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        *attach(VISUAL),
        {"op": "screenshot", "name": "J1-03-composer-chip"},
        *page_turn("J1-04", words=True),
    ])

    write("p2b-follow-up", "J1: a follow-up about the picture in the same chat (the page is not sent again).", [
        *ask("What is next to the cup?"),
        {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": "J1-05-follow-up"},
        {"op": "dump", "name": "J1-05-follow-up"},
        *absent(BLIND + BANNED + [DONT_MENTION]),
    ])

    write("p3-index", f"J3: Instant, no index model, '{TURBINE}' attached, the serial question: the 468 MB card, Download, 'Reading your document before answering…', the grounded answer with its source; then 'What does the report say about the turbine?' must get the honest line, never 'The report states…'.", [
        *new_chat(),
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        *attach(TURBINE),
        {"op": "type", "testID": "composer-input", "text": SERIAL},
        {"op": "send"},
        {"op": "waitFor", "testID": "docs-hold", "timeoutMs": 15000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "docs-hold"},
        {"op": "assertText", "text": "468 MB", "testID": "docs-hold"},
        {"op": "screenshot", "name": "J3-01-index-card"},
        {"op": "press", "testID": "docs-hold-download"},
        {"op": "sleep", "ms": 3000},
        {"op": "value", "testID": "docs-hold-body"},
        {"op": "screenshot", "name": "J3-02-downloading"},
        {"op": "idleTimer"},
        {"op": "waitFor", "testID": "docs-hold", "gone": True, "timeoutMs": 1800000},
        {"op": "waitFor", "testID": "reading-docs", "timeoutMs": 15000},
        {"op": "value", "testID": "reading-docs"},
        {"op": "screenshot", "name": "J3-03-reading-your-document"},
        *answer(first_ms=300000),
        {"op": "waitFor", "testID": "citations", "timeoutMs": 30000},
        {"op": "value", "testID": "citations"},
        {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": "J3-04-grounded-answer"},
        {"op": "dump", "name": "J3-04-grounded-answer"},
        {"op": "assertText", "text": "RK-4417", "testID": "assistant-text"},
        {"op": "assertText", "text": NONE_MATCHED, "absent": True},
        *ask("What does the report say about the turbine?"),
        {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": "J3-05-turbine-question"},
        {"op": "dump", "name": "J3-05-turbine-question"},
        *absent(["The report states", "The report says", "The report indicates", "The report outlines"] + BANNED),
    ])

    write("j5-file-cafe", f"J5 part 1: the café's chalk menu filed in the library as '{CAFE}', then a NEW chat on Instant and the [+] sheet's library list.", [
        *new_chat(),
        {"op": "devPrompt", "lines": [f"attach: {CAFE}"]},
        {"op": "waitFor", "testID": "pending-images", "timeoutMs": 60000},
        {"op": "sleep", "ms": 2000},
        *new_chat(),
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        {"op": "waitFor", "testID": "pending-images", "gone": True, "timeoutMs": 1000},
        {"op": "press", "testID": "attach"},
        {"op": "waitFor", "testID": "attach-sheet", "timeoutMs": 10000},
        {"op": "sleep", "ms": 1200},
        {"op": "screenshot", "name": "J5-01-library-list"},
        {"op": "dump", "name": "J5-01-sheet"},
    ])

    write("f3-vault-drop", "J4 vault door on twin 2 (the first twin refused the network step): Install Fast from the vault, the connection drops mid-download (simulated), waits, comes back: it continues by itself.", [
        {"op": "deeplink", "url": "/vault"},
        {"op": "sleep", "ms": 4000},
        {"op": "scrollTo", "testID": "install-fast"},
        {"op": "press", "testID": "install-fast"},
        {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": "J4-11-vault-confirm"},
        {"op": "press", "testID": "confirm-download"},
        {"op": "sleep", "ms": 15000},
        {"op": "value", "testID": "model-status-fast"},
        {"op": "screenshot", "name": "J4-12-vault-fast-downloading"},
        {"op": "network", "offline": True},
        {"op": "sleep", "ms": 5000},
        {"op": "value", "testID": "model-offline-fast"},
        {"op": "value", "testID": "model-status-fast"},
        {"op": "screenshot", "name": "J4-13-vault-connection-lost"},
        {"op": "dump", "name": "J4-13-vault"},
        {"op": "sleep", "ms": 10000},
        {"op": "value", "testID": "model-status-fast"},
        {"op": "screenshot", "name": "J4-14-vault-offline-15s"},
        {"op": "network", "offline": False},
        {"op": "sleep", "ms": 12000},
        {"op": "value", "testID": "model-status-fast"},
        {"op": "screenshot", "name": "J4-15-vault-online-12s"},
        {"op": "dump", "name": "J4-15-vault"},
        {"op": "idleTimer"},
        {"op": "waitFor", "testID": "use-fast", "timeoutMs": 1500000},
        {"op": "value", "testID": "model-status-fast"},
        {"op": "screenshot", "name": "J4-16-vault-fast-installed"},
    ])

    write("j2-use-fast", "J2: a new chat, Fast from the model sheet.", use_model("fast", "FAST"))

    write("j2c-remove", "J2 exit (c): Fast without its pack, the visual PDF, the pack card, 'Remove the photo', Send: a text-only honest answer.", [
        *pack_card("J2-01"),
        {"op": "press", "testID": "vision-hold-remove"},
        {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": "J2-02-photo-removed"},
        {"op": "send"},
        *answer(),
        {"op": "sleep", "ms": 1500},
        {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1000},
        {"op": "waitFor", "testID": "user-images", "gone": True, "timeoutMs": 1000},
        {"op": "screenshot", "name": "J2-03-text-only-answer"},
        {"op": "dump", "name": "J2-03-text-only-answer"},
        {"op": "assertText", "text": THIN, "testID": "assistant-text"},
        *absent(BANNED),
    ])

    write("j2b-switch", "J2 exit (b): Fast without its pack, the visual PDF, the pack card, 'Switch to INSTANT': the new chat on Instant keeps the PDF and the message goes out with the page picture.", [
        *pack_card("J2-04"),
        {"op": "value", "testID": "vision-hold-switch"},
        {"op": "press", "testID": "vision-hold-switch"},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 240000},
        {"op": "value", "testID": "user-images"},
        {"op": "value", "testID": "model-chip"},
        {"op": "screenshot", "name": "J2-05-switched-sent"},
        *done(),
        {"op": "sleep", "ms": 1500},
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        {"op": "screenshot", "name": "J2-06-instant-answer"},
        {"op": "dump", "name": "J2-06-instant-answer"},
        *absent(BLIND + BANNED),
    ])

    write("j2a-download", "J2 exit (a): back on Fast, the visual PDF, the pack card, Download 668 MB: the pack lands and the held message goes out by itself with the page picture and a grounded answer.", [
        *use_model("fast", "FAST"),
        *pack_card("J2-07"),
        {"op": "press", "testID": "vision-hold-download"},
        {"op": "sleep", "ms": 4000},
        {"op": "value", "testID": "vision-hold"},
        {"op": "screenshot", "name": "J2-08-pack-downloading"},
        {"op": "idleTimer"},
        {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1500000},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 240000},
        {"op": "value", "testID": "user-images"},
        {"op": "screenshot", "name": "J2-09-sent-with-picture"},
        *done(),
        {"op": "sleep", "ms": 1500},
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        {"op": "screenshot", "name": "J2-10-fast-answer"},
        {"op": "dump", "name": "J2-10-fast-answer"},
        *absent(BLIND + BANNED + [DONT_MENTION]),
    ])

    write("j2d-fast-timing", "Timing: a new chat on Fast with its pack, the visual PDF, 'What do you see?': Send to the first token.", [
        *new_chat(),
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        *attach(VISUAL),
        *page_turn("J2-11"),
    ])

    write("j5-loading", "J5: Instant chosen, then Fast chosen from the model sheet; while 'Loading' is on screen the field takes 'hello while loading'; once ready, Send answers on Fast. The bridge types through onChangeText: it cannot raise the system keyboard.", [
        *use_model("instant", "INSTANT"),
        {"op": "press", "testID": "model-chip"},
        {"op": "waitFor", "testID": "model-sheet-use-fast", "timeoutMs": 10000},
        {"op": "press", "testID": "model-sheet-use-fast"},
        {"op": "waitFor", "text": "Loading", "timeoutMs": 5000},
        {"op": "type", "testID": "composer-input", "text": "hello while loading"},
        {"op": "assertText", "text": "Loading"},
        {"op": "value", "testID": "composer-input"},
        {"op": "screenshot", "name": "J5-04-typed-while-loading"},
        {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 180000},
        {"op": "sleep", "ms": 1000},
        {"op": "value", "testID": "composer-input"},
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        {"op": "send"},
        *answer(),
        {"op": "screenshot", "name": "J5-05-loading-text-answered"},
    ])

    write("j5-fast-text", "J5: one plain text turn on Fast.", [
        *new_chat(),
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        *ask("Give me two short tips for sleeping better."),
        {"op": "screenshot", "name": "J5-06-fast-text-turn"},
        {"op": "assertText", "text": COULD_NOT, "absent": True},
        *absent(BANNED),
    ])

    write("j5-wipe-on", "J5: Settings > Erase everything with 'also delete models' ON (Fast and its pack installed and used).", wipe("J5-07", True))

    write("j4-onboard-offline", "J5 + J4 onboarding door: after the wipe the model step offers 'Download Fast · 1.28 GB'; the app goes offline: the offline line, Download tapped: waiting + 'Start now with Instant'; online: it starts by itself; then Stop, Instant, a chat on Instant answers.", [
        {"op": "waitFor", "testID": "onboarding-continue", "timeoutMs": 120000},
        {"op": "sleep", "ms": 1200},
        {"op": "press", "testID": "onboarding-continue"},
        {"op": "waitFor", "testID": "onboarding-model", "timeoutMs": 30000},
        {"op": "sleep", "ms": 2500},
        {"op": "value", "testID": "download-model"},
        {"op": "assertText", "text": "Download Fast", "testID": "download-model"},
        {"op": "assertText", "text": "1.28 GB", "testID": "download-model"},
        {"op": "screenshot", "name": "J5-08-model-step-after-wipe"},
        {"op": "dump", "name": "J5-08-model-step"},
        {"op": "network", "offline": True},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "download-offline"},
        {"op": "screenshot", "name": "J4-01-model-step-offline"},
        {"op": "press", "testID": "download-model"},
        {"op": "sleep", "ms": 4000},
        {"op": "value", "testID": "model-offline-fast"},
        {"op": "value", "testID": "model-waiting-fast"},
        {"op": "value", "testID": "start-now-with"},
        {"op": "assertText", "text": "Instant", "testID": "start-now-with"},
        {"op": "screenshot", "name": "J4-02-download-tapped-offline"},
        {"op": "dump", "name": "J4-02-model-step"},
        {"op": "sleep", "ms": 12000},
        {"op": "value", "testID": "model-waiting-fast"},
        {"op": "screenshot", "name": "J4-03-offline-16s"},
        {"op": "network", "offline": False},
        {"op": "sleep", "ms": 10000},
        {"op": "value", "testID": "model-progress"},
        {"op": "screenshot", "name": "J4-04-online-10s"},
        {"op": "dump", "name": "J4-04-model-step"},
        {"op": "press", "testID": "cancel-download"},
        {"op": "sleep", "ms": 1500},
        *seal("start-now-with"),
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        *ask("What is the capital of France?"),
        {"op": "screenshot", "name": "J5-09-chat-instant-after-wipe"},
        {"op": "assertText", "text": COULD_NOT, "absent": True},
    ])

    write("j4-index-offline", f"J4 index door: Instant, no index model (wiped), '{TURBINE}', the serial question, the card; offline, Download: the offline line + waiting; online: the download starts by itself and the held message goes out.", [
        *new_chat(),
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        *attach(TURBINE),
        {"op": "type", "testID": "composer-input", "text": SERIAL},
        {"op": "send"},
        {"op": "waitFor", "testID": "docs-hold", "timeoutMs": 15000},
        {"op": "sleep", "ms": 1500},
        {"op": "network", "offline": True},
        {"op": "sleep", "ms": 1500},
        {"op": "press", "testID": "docs-hold-download"},
        {"op": "sleep", "ms": 4000},
        {"op": "value", "testID": "docs-hold-offline"},
        {"op": "value", "testID": "docs-hold-body"},
        {"op": "screenshot", "name": "J4-05-index-card-offline"},
        {"op": "dump", "name": "J4-05-index-card"},
        {"op": "sleep", "ms": 12000},
        {"op": "value", "testID": "docs-hold-body"},
        {"op": "screenshot", "name": "J4-06-index-card-offline-16s"},
        {"op": "network", "offline": False},
        {"op": "sleep", "ms": 8000},
        {"op": "value", "testID": "docs-hold-body"},
        {"op": "screenshot", "name": "J4-07-index-card-online-8s"},
        {"op": "idleTimer"},
        {"op": "waitFor", "testID": "docs-hold", "gone": True, "timeoutMs": 1800000},
        *answer(first_ms=300000),
        {"op": "waitFor", "testID": "citations", "timeoutMs": 30000},
        {"op": "value", "testID": "citations"},
        {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": "J4-08-held-message-answered"},
        {"op": "assertText", "text": "RK-4417", "testID": "assistant-text"},
    ])


def taps(cafe_id):
    write("j5-tap-cafe", "J5 part 2: tap the café picture in the library list on Instant. Expect a thumbnail chip, no paperclip; 'What do you see in the photo?' answered with a description, no blind words, no 'Nothing in your documents matched' banner.", [
        {"op": "value", "testID": f"attach-{cafe_id}"},
        {"op": "press", "testID": f"attach-{cafe_id}"},
        {"op": "waitFor", "testID": "attach-sheet", "gone": True, "timeoutMs": 10000},
        {"op": "waitFor", "testID": "pending-images", "timeoutMs": 30000},
        {"op": "sleep", "ms": 1500},
        {"op": "waitFor", "testID": "attached-docs", "gone": True, "timeoutMs": 1000},
        {"op": "value", "testID": "pending-images"},
        {"op": "screenshot", "name": "J5-02-a-thumbnail-chip"},
        {"op": "type", "testID": "composer-input", "text": "What do you see in the photo?"},
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
