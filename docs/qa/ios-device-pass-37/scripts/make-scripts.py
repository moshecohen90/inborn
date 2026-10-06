#!/usr/bin/env python3
"""Writes pass 37's bridge scripts into this folder. Run from docs/qa/ios-device-pass-37/scripts.
Round 132 on the phone, on the real free tier of a fresh twin (no setTier anywhere), no index model and no downloaded
model at the start. J1 onboarding, J2 the image-only scan on Instant at 1024, J3 the founder's picture file on Instant
(private), J7 a composer photo on Instant, J6 a text PDF still held for the index model, J4 Fast through the advice card
then the founder's 9-page file summarized whole (private) and a committed 9-page fixture, J5 the scan on Fast after its
photo pack, J7 the photo on Fast, J8 settings, vault and Stop mid-answer. The founder's files are pushed under neutral
names and their scripts write only to the ignored private/ folder."""
import json

BANNED = ["The request specifies", "I will focus", "as an AI", "NOT_FOUND", "<<<", "The user is asking"]
BLIND = ["cannot see", "can't see", "cannot physically see", "see images", "text-based", "unable to see", "not able to see", "don't have eyes"]
NONE_MATCHED = "Nothing in your documents matched this question"
COULD_NOT = "Could not load"
DONT_MENTION = "Your documents don't mention this"
NEEDS_OCR = "is a scan. Run OCR"
CAFE = "בית קפה הגינה תפריט.jpg"
PICTURE = "מסמך.pdf"
NINE = "קובץ.pdf"
SCAN = "sign-scan.pdf"
TURBINE = "turbine-report-3pages.pdf"
CONSTITUTION = "constitution-9pages.pdf"
SEE = "What do you see?"
SERIAL = "What is the serial number of the Rakovsky turbine?"
SUMMARIZE = "Summarize it"
ABOUT = "What is this file about?"


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


def attach(name, kind="attached-docs", settle=8000):
    return [
        {"op": "devPrompt", "lines": [f"attach: {name}"]},
        {"op": "waitFor", "testID": kind, "timeoutMs": 60000},
        {"op": "sleep", "ms": settle},
        {"op": "value", "testID": kind},
    ]


def ledger(shot):
    return [
        {"op": "press", "testID": "ledger-toggle"},
        {"op": "sleep", "ms": 1200},
        {"op": "value", "testID": "ledger"},
        {"op": "screenshot", "name": f"{shot}-ledger"},
    ]


def picture_turn(shot, question=SEE, advice=True, first_ms=90000):
    """Send, then the first token (the send step + this waitFor = Send to first token on screen). No card may hold it:
    a docs-hold or vision-hold would leave the waitFor to time out."""
    steps = [
        {"op": "type", "testID": "composer-input", "text": question},
        {"op": "send"},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": first_ms},
        {"op": "value", "testID": "user-images"},
        {"op": "screenshot", "name": f"{shot}-sent-bubble"},
        *done(),
        {"op": "sleep", "ms": 2000},
        {"op": "waitFor", "testID": "docs-hold", "gone": True, "timeoutMs": 1000},
        {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1000},
        *absent(BLIND + BANNED + [DONT_MENTION, NEEDS_OCR]),
    ]
    if advice:
        steps += [
            {"op": "waitFor", "testID": "model-advice", "timeoutMs": 15000},
            {"op": "value", "testID": "model-advice-reason"},
            {"op": "value", "testID": "model-advice-install"},
            {"op": "assertText", "text": "FAST sees pictures better than INSTANT", "testID": "model-advice-reason"},
        ]
    else:
        steps += [{"op": "waitFor", "testID": "model-advice", "gone": True, "timeoutMs": 3000}]
    return steps + [
        {"op": "screenshot", "name": f"{shot}-answer"},
        {"op": "dump", "name": f"{shot}-answer"},
        *ledger(shot),
    ]


def summary_turn(shot, question=SUMMARIZE, pages=9):
    """Send a summary ask: no index card, the 'Reading pages' line, then the answer with its scope line.
    Send to the end = send + every step up to `stop` gone."""
    return [
        {"op": "type", "testID": "composer-input", "text": question},
        {"op": "send"},
        {"op": "waitFor", "testID": "reading-pages", "timeoutMs": 120000},
        {"op": "value", "testID": "reading-pages"},
        {"op": "waitFor", "testID": "docs-hold", "gone": True, "timeoutMs": 1000},
        {"op": "screenshot", "name": f"{shot}-reading"},
        {"op": "waitFor", "testID": "reading-pages", "gone": True, "timeoutMs": 900000},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 240000},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 600000},
        {"op": "sleep", "ms": 2500},
        {"op": "value", "testID": "assistant-text"},
        {"op": "value", "testID": "citations"},
        {"op": "assertText", "text": f"Summary of all {pages} pages.", "testID": "assistant-text"},
        {"op": "screenshot", "name": f"{shot}-summary"},
        {"op": "dump", "name": f"{shot}-summary"},
        *absent(BANNED + [NONE_MATCHED]),
        *ledger(shot),
    ]


def about_turn(shot):
    """'What is this file about?' in the same chat. The opening route is not a summary, so the 468 MB index card may hold
    it on a phone without the index model: then Download, and the held message goes out when the model is in."""
    return [
        {"op": "type", "testID": "composer-input", "text": ABOUT},
        {"op": "send"},
        {"op": "sleep", "ms": 6000},
        {"op": "screenshot", "name": f"{shot}-after-send"},
        {"op": "dump", "name": f"{shot}-after-send"},
        {"op": "value", "testID": "docs-hold"},
        {"op": "press", "testID": "docs-hold-download"},
        {"op": "idleTimer"},
        {"op": "waitFor", "testID": "docs-hold", "gone": True, "timeoutMs": 1800000},
        {"op": "sleep", "ms": 6000},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 600000},
        {"op": "sleep", "ms": 2500},
        {"op": "value", "testID": "assistant-text"},
        {"op": "value", "testID": "citations"},
        {"op": "screenshot", "name": f"{shot}-answer"},
        {"op": "dump", "name": f"{shot}-answer"},
        *absent(BANNED),
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


def write(name, note, steps):
    with open(f"{name}.json", "w") as f:
        json.dump({"_": note, "steps": steps}, f, indent=1, ensure_ascii=False)
        f.write("\n")


def main():
    write("p0-onboard", "J1: a fresh twin, Welcome, the model step (the source line names the host), 'Start now with Instant', the chat on Instant.", [
        {"op": "waitFor", "testID": "onboarding-continue", "timeoutMs": 120000},
        {"op": "sleep", "ms": 1200},
        {"op": "screenshot", "name": "J1-00-welcome"},
        {"op": "press", "testID": "onboarding-continue"},
        {"op": "waitFor", "testID": "onboarding-model", "timeoutMs": 30000},
        {"op": "sleep", "ms": 2500},
        {"op": "value", "testID": "model-source-fast"},
        {"op": "assertText", "text": "models.inbornapp.com", "testID": "model-source-fast"},
        {"op": "screenshot", "name": "J1-01-model-step"},
        *seal("start-now-with"),
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        {"op": "screenshot", "name": "J1-02-chat-instant"},
    ])

    write("j2-scan-instant", f"J2: a new chat on Instant, '{SCAN}' (no text layer), 'What do you see?': the page picture in the bubble, no OCR refusal, no index card, an answer, the Fast advice card.", [
        *new_chat(),
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        *attach(SCAN),
        {"op": "screenshot", "name": "J2-01-composer-chip"},
        *picture_turn("J2-02"),
    ])

    write("j2-ledger", "J2: the scan answer's ledger, opened in the same chat (j2-scan-instant ran before the ledger step was added).", ledger("J2-02"))

    for n in ("s1", "s2"):
        write(f"f3-{n}", f"J3 PRIVATE: a new chat on Instant, '{PICTURE}' (the founder's picture file under a neutral name), 'What do you see?' at 1024 image tokens. Output stays in private/.", [
            *new_chat(),
            {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
            *attach(PICTURE),
            *picture_turn(f"P3-{n}"),
        ])

    write("j7a-photo-instant", f"J7: a new chat on Instant, the café photo '{CAFE}' from the composer, 'What do you see?': the answer and the advice card; then 'Install FAST' from the card and Fast downloaded from models.inbornapp.com.", [
        *new_chat(),
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        *attach(CAFE, "pending-images"),
        {"op": "waitFor", "testID": "attached-docs", "gone": True, "timeoutMs": 1000},
        {"op": "screenshot", "name": "J7-01-thumbnail-chip"},
        *picture_turn("J7-02"),
    ])

    write("j6-text-hold", f"J6: Instant, no index model, '{TURBINE}' (3 pages of text), the serial question: the 468 MB card still holds it. Not downloaded here.", [
        *new_chat(),
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        *attach(TURBINE),
        {"op": "type", "testID": "composer-input", "text": SERIAL},
        {"op": "send"},
        {"op": "waitFor", "testID": "docs-hold", "timeoutMs": 15000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "docs-hold"},
        {"op": "assertText", "text": "468 MB", "testID": "docs-hold"},
        {"op": "screenshot", "name": "J6-01-index-card"},
        {"op": "dump", "name": "J6-01-index-card"},
    ])

    write("j4a-install-fast", "J4: the vault, Install Fast (1.28 GB from models.inbornapp.com), wait until it is installed.", [
        {"op": "deeplink", "url": "/vault"},
        {"op": "waitFor", "testID": "best-for", "timeoutMs": 30000},
        {"op": "sleep", "ms": 3000},
        {"op": "scrollTo", "testID": "install-fast"},
        {"op": "screenshot", "name": "J4-01-vault-fast"},
        {"op": "press", "testID": "install-fast"},
        {"op": "sleep", "ms": 1500},
        {"op": "press", "testID": "confirm-download"},
        {"op": "sleep", "ms": 15000},
        {"op": "value", "testID": "model-status-fast"},
        {"op": "screenshot", "name": "J4-02-fast-downloading"},
        {"op": "idleTimer"},
        {"op": "waitFor", "testID": "use-fast", "timeoutMs": 1800000},
        {"op": "value", "testID": "model-status-fast"},
        {"op": "screenshot", "name": "J4-03-fast-installed"},
    ])

    write("f4-nine-fast", f"J4 PRIVATE: a new chat on Fast, '{NINE}' (the founder's 9-page file under a neutral name), '{SUMMARIZE}': no index card, 'Reading pages…', the summary with 'Summary of all 9 pages.'; then '{ABOUT}' in the same chat. Output stays in private/.", [
        *use_model("fast", "FAST"),
        *attach(NINE, settle=20000),
        {"op": "screenshot", "name": "P4-01-attached"},
        *summary_turn("P4-02"),
        *about_turn("P4-03"),
    ])

    write("f4b-about-wait", "J4 PRIVATE: the same chat; the held 'What is this file about?' waits for the index model to finish reading the file, then its answer (the f4 run stopped while it was still reading).", [
        {"op": "waitFor", "testID": "reading-docs", "gone": True, "timeoutMs": 900000},
        {"op": "sleep", "ms": 4000},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 600000},
        {"op": "sleep", "ms": 3000},
        {"op": "screenshot", "name": "P4-04-about-answer"},
        {"op": "dump", "name": "P4-04-about-answer"},
        *absent(BANNED),
    ])

    write("j4c-fixture-fast", f"J4 tracked example: a new chat on Fast, '{CONSTITUTION}' (9 pages), 'Summarize this file': 'Reading pages…', the summary with 'Summary of all 9 pages.'.", [
        *new_chat(),
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        *attach(CONSTITUTION, settle=20000),
        {"op": "screenshot", "name": "J4-04-attached"},
        *summary_turn("J4-05", "Summarize this file"),
    ])

    write("j5-scan-fast-pack", f"J5: a new chat on Fast (no photo pack yet), '{SCAN}', 'What do you see?': the pack card, Download 668 MB, the held message goes out with the page picture; no advice card on Fast.", [
        *new_chat(),
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        *attach(SCAN),
        {"op": "type", "testID": "composer-input", "text": SEE},
        {"op": "send"},
        {"op": "waitFor", "testID": "vision-hold", "timeoutMs": 30000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "vision-hold"},
        {"op": "assertText", "text": "668 MB", "testID": "vision-hold"},
        {"op": "screenshot", "name": "J5-01-pack-card"},
        {"op": "press", "testID": "vision-hold-download"},
        {"op": "sleep", "ms": 4000},
        {"op": "value", "testID": "vision-hold"},
        {"op": "screenshot", "name": "J5-02-pack-downloading"},
        {"op": "idleTimer"},
        {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1800000},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 240000},
        {"op": "value", "testID": "user-images"},
        {"op": "screenshot", "name": "J5-03-sent-with-picture"},
        *done(),
        {"op": "sleep", "ms": 2000},
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        {"op": "waitFor", "testID": "model-advice", "gone": True, "timeoutMs": 3000},
        {"op": "screenshot", "name": "J5-04-fast-answer"},
        {"op": "dump", "name": "J5-04-fast-answer"},
        *absent(BLIND + BANNED + [DONT_MENTION, NEEDS_OCR]),
    ])

    write("cool", "Between runs: wait until the app's thermal banner ('Slowing down to keep the phone cool') is gone, so the timed turns are not throttled.", [
        {"op": "deeplink", "url": "/chats"},
        {"op": "sleep", "ms": 2000},
        {"op": "waitFor", "testID": "banner-thermal", "gone": True, "timeoutMs": 900000},
    ])

    write("j5b-scan-fast", f"J5 timing: a new chat on Fast with its pack, '{SCAN}', 'What do you see?': Send to first token, no advice card.", [
        *new_chat(),
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        *attach(SCAN),
        *picture_turn("J5-05", advice=False, first_ms=180000),
    ])

    write("j7b-photo-fast", f"J7: a new chat on Fast with its pack, the café photo '{CAFE}' from the composer, 'What do you see?': an answer, no advice card.", [
        *new_chat(),
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        *attach(CAFE, "pending-images"),
        *picture_turn("J7-03", advice=False, first_ms=180000),
    ])

    write("j7c-photo-fast-again", f"J7 again: the café on Fast ended in 'Ran out of memory · Switched to Instant'; a new chat back on Fast, the same photo and question, to see whether it repeats.", [
        *use_model("fast", "FAST"),
        *attach(CAFE, "pending-images"),
        {"op": "type", "testID": "composer-input", "text": SEE},
        {"op": "send"},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 180000},
        {"op": "screenshot", "name": "J7-04-sent-bubble"},
        *done(),
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "model-chip"},
        {"op": "value", "testID": "banners"},
        {"op": "screenshot", "name": "J7-04-answer"},
        {"op": "dump", "name": "J7-04-answer"},
        *ledger("J7-04"),
    ])

    write("j8-settings-vault-stop", "J8: Settings opens, the vault opens on this phone, and Stop in the middle of a long answer leaves the text so far and a working composer.", [
        {"op": "deeplink", "url": "/settings"},
        {"op": "waitFor", "testID": "row-wipe", "timeoutMs": 15000},
        {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": "J8-01-settings"},
        {"op": "dump", "name": "J8-01-settings"},
        {"op": "deeplink", "url": "/vault"},
        {"op": "waitFor", "testID": "best-for", "timeoutMs": 30000},
        {"op": "sleep", "ms": 3000},
        {"op": "value", "testID": "best-for-use"},
        {"op": "screenshot", "name": "J8-02-vault"},
        {"op": "dump", "name": "J8-02-vault"},
        *new_chat(),
        {"op": "type", "testID": "composer-input", "text": "Write a long story of about 600 words about a lighthouse keeper."},
        {"op": "send"},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 120000},
        {"op": "sleep", "ms": 4000},
        {"op": "press", "testID": "stop"},
        {"op": "sleep", "ms": 2000},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 10000},
        {"op": "value", "testID": "assistant-text"},
        {"op": "screenshot", "name": "J8-03-stopped"},
        {"op": "dump", "name": "J8-03-stopped"},
        *ask("What is the capital of France?"),
        {"op": "screenshot", "name": "J8-04-after-stop"},
        {"op": "assertText", "text": COULD_NOT, "absent": True},
    ])


if __name__ == "__main__":
    main()
