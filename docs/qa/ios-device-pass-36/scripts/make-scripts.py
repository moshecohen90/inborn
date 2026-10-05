#!/usr/bin/env python3
"""Writes pass 36's bridge scripts into this folder. Run from docs/qa/ios-device-pass-36/scripts.
Round 131 on the phone, on the real free tier of a fresh twin (no setTier anywhere), no index model and no downloaded
model at the start. J1 the founder's PDF on Instant (its scripts write only to the ignored private/ folder; the file is
pushed under a neutral name), J1b the synthetic visual page, J2 the café photo and the advice card's "Not now", J3 a
text PDF still held for the index model, J4 Install Fast through the advice card and its photo pack through the pack
card, J5 the vault's multi-use Best for, J7 regressions, J6 the onboarding door offline after the wipe."""
import json

BANNED = ["The request specifies", "I will focus", "as an AI", "NOT_FOUND", "<<<", "The user is asking"]
BLIND = ["cannot see", "can't see", "cannot physically see", "see images", "text-based", "unable to see", "not able to see", "don't have eyes"]
NONE_MATCHED = "Nothing in your documents matched this question"
COULD_NOT = "Could not load"
DONT_MENTION = "Your documents don't mention this"
CAFE = "בית קפה הגינה תפריט.jpg"
FOUNDER = "מסמך.pdf"
VISUAL = "visual-page.pdf"
TURBINE = "turbine-report-3pages.pdf"
SEE = "What do you see?"
SEE_HE = "מה אתה רואה?"
SERIAL = "What is the serial number of the Rakovsky turbine?"
USES = ["chat", "writing", "summarize", "translate", "code", "documents", "voice", "math"]
CARDS = ["instant", "fast", "sharp", "sharp-phi"]


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
        *absent(BLIND + BANNED + [DONT_MENTION]),
    ]
    if advice:
        steps += [
            {"op": "waitFor", "testID": "model-advice", "timeoutMs": 15000},
            {"op": "value", "testID": "model-advice-reason"},
            {"op": "value", "testID": "model-advice-install"},
            {"op": "assertText", "text": "FAST sees pictures better than INSTANT", "testID": "model-advice-reason"},
            {"op": "assertText", "text": "1.28 GB", "testID": "model-advice-install"},
        ]
    else:
        steps += [{"op": "waitFor", "testID": "model-advice", "gone": True, "timeoutMs": 3000}]
    return steps + [
        {"op": "screenshot", "name": f"{shot}-answer"},
        {"op": "dump", "name": f"{shot}-answer"},
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


def wipe(shot):
    return [
        {"op": "deeplink", "url": "/settings"},
        {"op": "waitFor", "testID": "row-wipe", "timeoutMs": 15000},
        {"op": "scrollTo", "testID": "row-wipe"},
        {"op": "press", "testID": "row-wipe"},
        {"op": "waitFor", "testID": "wipe-models", "timeoutMs": 10000},
        {"op": "sleep", "ms": 800},
        {"op": "press", "testID": "wipe-models"},
        {"op": "sleep", "ms": 800},
        {"op": "value", "testID": "wipe-models"},
        {"op": "screenshot", "name": f"{shot}-wipe-models-on"},
        {"op": "dump", "name": f"{shot}-wipe"},
        {"op": "press", "testID": "wipe-step1"},
        {"op": "waitFor", "testID": "wipe-step2", "timeoutMs": 10000},
        {"op": "sleep", "ms": 800},
        {"op": "press", "testID": "wipe-step2"},
        {"op": "sleep", "ms": 6000},
    ]


def source(label):
    return [{"op": "value", "testID": "model-source-fast"}, {"op": "assertText", "text": "models.inbornapp.com", "testID": "model-source-fast"}]


def write(name, note, steps):
    with open(f"{name}.json", "w") as f:
        json.dump({"_": note, "steps": steps}, f, indent=1, ensure_ascii=False)
        f.write("\n")


def vault_cards(shot):
    steps = []
    for mid in CARDS:
        steps += [
            {"op": "scrollTo", "testID": f"model-card-{mid}"},
            {"op": "sleep", "ms": 1200},
            {"op": "value", "testID": f"model-uses-{mid}"},
            {"op": "screenshot", "name": f"{shot}-card-{mid}"},
        ]
    return steps


def main():
    write("p0-onboard", "J1: a fresh twin, Welcome, the model step (the source line names the host), 'Start now with Instant', the chat on Instant.", [
        {"op": "waitFor", "testID": "onboarding-continue", "timeoutMs": 120000},
        {"op": "sleep", "ms": 1200},
        {"op": "screenshot", "name": "J1-00-welcome"},
        {"op": "press", "testID": "onboarding-continue"},
        {"op": "waitFor", "testID": "onboarding-model", "timeoutMs": 30000},
        {"op": "sleep", "ms": 2500},
        *source("before"),
        {"op": "screenshot", "name": "J1-01-model-step"},
        {"op": "dump", "name": "J1-01-model-step"},
        *seal("start-now-with"),
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        {"op": "screenshot", "name": "J1-02-chat-instant"},
    ])

    for n, q in (("s1", SEE), ("s2", SEE), ("s3", SEE), ("he", SEE_HE)):
        write(f"f1-{n}", f"J1 PRIVATE: a new chat on Instant, '{FOUNDER}' (the founder's PDF under a neutral name), '{q}': no index card, the page picture in the bubble, an answer, the Fast advice card. Output stays in private/.", [
            *new_chat(),
            {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
            *attach(FOUNDER),
            {"op": "screenshot", "name": f"P1-{n}-composer-chip"},
            *picture_turn(f"P1-{n}", q),
        ])

    for n in ("1", "2"):
        write(f"j1b-visual-{n}", f"J1b: a new chat on Instant, '{VISUAL}', 'What do you see?': no index card, the page picture in the bubble, the answer, the Fast advice card.", [
            *new_chat(),
            {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
            *attach(VISUAL),
            {"op": "screenshot", "name": f"J1b-{n}-composer-chip"},
            *picture_turn(f"J1b-{n}"),
        ])

    for n in ("1", "2"):
        write(f"j2-cafe-{n}", f"J2: a new chat on Instant, the café photo '{CAFE}' as a plain photo, 'What do you see?': the answer and the advice card.", [
            *new_chat(),
            {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
            *attach(CAFE, "pending-images"),
            {"op": "waitFor", "testID": "attached-docs", "gone": True, "timeoutMs": 1000},
            {"op": "screenshot", "name": f"J2-{n}-thumbnail-chip"},
            *picture_turn(f"J2-{n}"),
        ])

    write("j2-not-now", f"J2: in the second café chat, 'Not now' on the card; the next picture turn in that chat ('{CAFE}' again) shows no card.", [
        {"op": "press", "testID": "model-advice-not-now"},
        {"op": "sleep", "ms": 1500},
        {"op": "waitFor", "testID": "model-advice", "gone": True, "timeoutMs": 3000},
        {"op": "screenshot", "name": "J2-3-not-now"},
        *attach(CAFE, "pending-images"),
        *picture_turn("J2-4", "What is written on the board?", advice=False),
    ])

    write("j3-index", f"J3: Instant, no index model, '{TURBINE}' (3 pages), the serial question: the 468 MB card still holds it; Download, 'Reading your document…', the serial answer with its source.", [
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
    ])

    write("j4a-door", f"J4: a new chat on Instant, '{VISUAL}', the advice card, 'Install FAST · 1.28 GB': the vault opens on Fast; install it and wait for it.", [
        *new_chat(),
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        *attach(VISUAL),
        *picture_turn("J4-01"),
        {"op": "press", "testID": "model-advice-install"},
        {"op": "waitFor", "testID": "best-for", "timeoutMs": 30000},
        {"op": "sleep", "ms": 3000},
        {"op": "screenshot", "name": "J4-02-vault-on-fast"},
        {"op": "dump", "name": "J4-02-vault-on-fast"},
        {"op": "scrollTo", "testID": "install-fast"},
        {"op": "press", "testID": "install-fast"},
        {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": "J4-03-vault-confirm"},
        {"op": "press", "testID": "confirm-download"},
        {"op": "sleep", "ms": 15000},
        {"op": "value", "testID": "model-status-fast"},
        {"op": "screenshot", "name": "J4-04-fast-downloading"},
        {"op": "idleTimer"},
        {"op": "waitFor", "testID": "use-fast", "timeoutMs": 1800000},
        {"op": "value", "testID": "model-status-fast"},
        {"op": "screenshot", "name": "J4-05-fast-installed"},
    ])

    write("j4b-pack", f"J4: a new chat on Fast (no photo pack yet), '{VISUAL}', 'What do you see?': the pack card, Download 668 MB, the held message goes out with the picture; no advice card on Fast.", [
        *use_model("fast", "FAST"),
        *attach(VISUAL),
        {"op": "type", "testID": "composer-input", "text": SEE},
        {"op": "send"},
        {"op": "waitFor", "testID": "vision-hold", "timeoutMs": 30000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "vision-hold"},
        {"op": "assertText", "text": "668 MB", "testID": "vision-hold"},
        {"op": "screenshot", "name": "J4-06-pack-card"},
        {"op": "press", "testID": "vision-hold-download"},
        {"op": "sleep", "ms": 4000},
        {"op": "value", "testID": "vision-hold"},
        {"op": "screenshot", "name": "J4-07-pack-downloading"},
        {"op": "idleTimer"},
        {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1800000},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 240000},
        {"op": "value", "testID": "user-images"},
        {"op": "screenshot", "name": "J4-08-sent-with-picture"},
        *done(),
        {"op": "sleep", "ms": 2000},
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        {"op": "waitFor", "testID": "model-advice", "gone": True, "timeoutMs": 3000},
        {"op": "screenshot", "name": "J4-09-fast-answer"},
        {"op": "dump", "name": "J4-09-fast-answer"},
        *absent(BLIND + BANNED + [DONT_MENTION]),
    ])

    write("j4c-visual-fast", f"J4 timing: a new chat on Fast with its pack, '{VISUAL}', 'What do you see?': Send to first token, no advice card.", [
        *new_chat(),
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        *attach(VISUAL),
        *picture_turn("J4-10", advice=False, first_ms=180000),
    ])

    for n in ("1", "2"):
        write(f"f4-s{n}", f"J4 PRIVATE: a new chat on Fast with its pack, '{FOUNDER}', 'What do you see?': no advice card. Output stays in private/.", [
            *new_chat(),
            {"op": "assertText", "text": "FAST", "testID": "model-chip"},
            *attach(FOUNDER),
            *picture_turn(f"P4-{n}", advice=False, first_ms=180000),
        ])

    tick_rest = [{"op": "press", "testID": f"best-for-use-{u}"} for u in USES if u not in ("chat", "documents")]
    write("j5-vault", "J5: the vault's Best for on the phone: the sheet, Chat + Documents, all eight, Math & reasoning alone, back to Chat.", [
        {"op": "deeplink", "url": "/vault"},
        {"op": "waitFor", "testID": "best-for", "timeoutMs": 30000},
        {"op": "sleep", "ms": 4000},
        {"op": "value", "testID": "best-for-use"},
        {"op": "screenshot", "name": "J5-01-vault-chat"},
        {"op": "dump", "name": "J5-01-vault-chat"},
        {"op": "press", "testID": "best-for-use"},
        {"op": "waitFor", "testID": "best-for-use-sheet", "timeoutMs": 30000},
        {"op": "sleep", "ms": 1500},
        {"op": "assertText", "text": "Pick one or more."},
        {"op": "screenshot", "name": "J5-02-sheet-chat"},
        {"op": "dump", "name": "J5-02-sheet"},
        {"op": "press", "testID": "best-for-use-documents"},
        {"op": "sleep", "ms": 1200},
        {"op": "screenshot", "name": "J5-03-sheet-chat-documents"},
        {"op": "press", "testID": "best-for-use-sheet-close"},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "best-for-use"},
        {"op": "assertText", "text": "Chat + Documents", "testID": "best-for-use"},
        {"op": "screenshot", "name": "J5-04-vault-chat-documents"},
        {"op": "dump", "name": "J5-04-vault-chat-documents"},
        *vault_cards("J5-05"),
        {"op": "deeplink", "url": "/vault"},
        {"op": "sleep", "ms": 2000},
        {"op": "press", "testID": "best-for-use"},
        {"op": "waitFor", "testID": "best-for-use-sheet", "timeoutMs": 30000},
        {"op": "sleep", "ms": 1000},
        *tick_rest,
        {"op": "sleep", "ms": 1200},
        {"op": "screenshot", "name": "J5-06-sheet-all"},
        {"op": "press", "testID": "best-for-use-sheet-close"},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "best-for-use"},
        {"op": "screenshot", "name": "J5-07-vault-all"},
        {"op": "dump", "name": "J5-07-vault-all"},
        *vault_cards("J5-08"),
        {"op": "press", "testID": "best-for-use"},
        {"op": "waitFor", "testID": "best-for-use-sheet", "timeoutMs": 30000},
        {"op": "sleep", "ms": 1000},
        *[{"op": "press", "testID": f"best-for-use-{u}"} for u in USES],
        {"op": "sleep", "ms": 1200},
        {"op": "screenshot", "name": "J5-09-sheet-math-stays"},
        {"op": "dump", "name": "J5-09-sheet-math-stays"},
        {"op": "press", "testID": "best-for-use-sheet-close"},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "best-for-use"},
        {"op": "assertText", "text": "Math", "testID": "best-for-use"},
        {"op": "screenshot", "name": "J5-10-vault-math"},
        {"op": "dump", "name": "J5-10-vault-math"},
        {"op": "press", "testID": "best-for-use"},
        {"op": "waitFor", "testID": "best-for-use-sheet", "timeoutMs": 30000},
        {"op": "sleep", "ms": 1000},
        {"op": "press", "testID": "best-for-use-chat"},
        {"op": "press", "testID": "best-for-use-math"},
        {"op": "sleep", "ms": 1000},
        {"op": "press", "testID": "best-for-use-sheet-close"},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "best-for-use"},
        {"op": "assertText", "text": "Chat", "testID": "best-for-use"},
        {"op": "screenshot", "name": "J5-11-vault-back-to-chat"},
        {"op": "dump", "name": "J5-11-vault-back-to-chat"},
    ])

    tick_all = [{"op": "press", "testID": f"best-for-use-{u}"} for u in USES if u != "chat"]
    write("j5b-vault-all", "J5 again from all eight (in j5-vault the deeplink back to the top remounted the vault and reset Best for to Chat): all eight, Math & reasoning alone, back to Chat; scrollTo instead of a deeplink.", [
        {"op": "deeplink", "url": "/vault"},
        {"op": "waitFor", "testID": "best-for", "timeoutMs": 30000},
        {"op": "sleep", "ms": 3000},
        {"op": "value", "testID": "best-for-use"},
        {"op": "press", "testID": "best-for-use"},
        {"op": "waitFor", "testID": "best-for-use-sheet", "timeoutMs": 30000},
        {"op": "sleep", "ms": 1000},
        *tick_all,
        {"op": "sleep", "ms": 1200},
        {"op": "screenshot", "name": "J5-12-sheet-all"},
        {"op": "dump", "name": "J5-12-sheet-all"},
        {"op": "press", "testID": "best-for-use-sheet-close"},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "best-for-use"},
        {"op": "assertText", "text": "Chat +7", "testID": "best-for-use"},
        {"op": "screenshot", "name": "J5-13-vault-all"},
        {"op": "dump", "name": "J5-13-vault-all"},
        *vault_cards("J5-14"),
        {"op": "scrollTo", "testID": "best-for"},
        {"op": "sleep", "ms": 1200},
        {"op": "press", "testID": "best-for-use"},
        {"op": "waitFor", "testID": "best-for-use-sheet", "timeoutMs": 30000},
        {"op": "sleep", "ms": 1000},
        *[{"op": "press", "testID": f"best-for-use-{u}"} for u in USES],
        {"op": "sleep", "ms": 1200},
        {"op": "screenshot", "name": "J5-15-sheet-math-stays"},
        {"op": "dump", "name": "J5-15-sheet-math-stays"},
        {"op": "press", "testID": "best-for-use-sheet-close"},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "best-for-use"},
        {"op": "assertText", "text": "Math", "testID": "best-for-use"},
        {"op": "screenshot", "name": "J5-16-vault-math"},
        {"op": "dump", "name": "J5-16-vault-math"},
        {"op": "press", "testID": "best-for-use"},
        {"op": "waitFor", "testID": "best-for-use-sheet", "timeoutMs": 30000},
        {"op": "sleep", "ms": 1000},
        {"op": "press", "testID": "best-for-use-chat"},
        {"op": "press", "testID": "best-for-use-math"},
        {"op": "sleep", "ms": 1000},
        {"op": "press", "testID": "best-for-use-sheet-close"},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "best-for-use"},
        {"op": "screenshot", "name": "J5-17-vault-back-to-chat"},
        {"op": "dump", "name": "J5-17-vault-back-to-chat"},
    ])

    write("j7-fast-text", "J7: one plain text turn on Fast.", [
        *new_chat(),
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        *ask("Give me two short tips for sleeping better."),
        {"op": "screenshot", "name": "J7-01-fast-text-turn"},
        {"op": "assertText", "text": COULD_NOT, "absent": True},
        *absent(BANNED),
    ])

    write("j7-loading", "J7: Instant chosen, then Fast from the model sheet; while 'Loading' shows the field takes 'hello while loading'; once ready, Send answers on Fast.", [
        *use_model("instant", "INSTANT"),
        {"op": "press", "testID": "model-chip"},
        {"op": "waitFor", "testID": "model-sheet-use-fast", "timeoutMs": 10000},
        {"op": "press", "testID": "model-sheet-use-fast"},
        {"op": "waitFor", "text": "Loading", "timeoutMs": 5000},
        {"op": "type", "testID": "composer-input", "text": "hello while loading"},
        {"op": "assertText", "text": "Loading"},
        {"op": "value", "testID": "composer-input"},
        {"op": "screenshot", "name": "J7-02-typed-while-loading"},
        {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 180000},
        {"op": "sleep", "ms": 1000},
        {"op": "value", "testID": "composer-input"},
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        {"op": "send"},
        *answer(),
        {"op": "screenshot", "name": "J7-03-loading-text-answered"},
    ])

    write("j7-wipe", "J7: Settings > Erase everything with 'also delete models' ON (Fast, its pack and the index model installed).", wipe("J7-04"))

    write("j6-onboard-offline", "J6 + J7: after the wipe, the model step; simulated offline: Download Fast waits, the source line keeps the host; online it starts; offline mid-download (the transfer is dropped), the host still there; online, Stop, Start now with Instant, Instant answers with no 'Could not load'.", [
        {"op": "waitFor", "testID": "onboarding-continue", "timeoutMs": 120000},
        {"op": "sleep", "ms": 1200},
        {"op": "press", "testID": "onboarding-continue"},
        {"op": "waitFor", "testID": "onboarding-model", "timeoutMs": 30000},
        {"op": "sleep", "ms": 2500},
        {"op": "value", "testID": "download-model"},
        {"op": "assertText", "text": "1.28 GB", "testID": "download-model"},
        *source("after wipe"),
        {"op": "screenshot", "name": "J6-01-model-step-after-wipe"},
        {"op": "network", "offline": True},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "download-offline"},
        {"op": "press", "testID": "download-model"},
        {"op": "sleep", "ms": 4000},
        {"op": "value", "testID": "model-waiting-fast"},
        *source("waiting"),
        {"op": "screenshot", "name": "J6-02-offline-waiting"},
        {"op": "dump", "name": "J6-02-offline-waiting"},
        {"op": "sleep", "ms": 12000},
        *source("waiting 16 s"),
        {"op": "screenshot", "name": "J6-03-offline-16s"},
        {"op": "network", "offline": False},
        {"op": "sleep", "ms": 12000},
        {"op": "value", "testID": "model-progress"},
        *source("downloading"),
        {"op": "screenshot", "name": "J6-04-online-downloading"},
        {"op": "network", "offline": True},
        {"op": "sleep", "ms": 8000},
        {"op": "value", "testID": "download-failed"},
        {"op": "value", "testID": "model-waiting-fast"},
        *source("dropped"),
        {"op": "screenshot", "name": "J6-05-dropped-offline"},
        {"op": "dump", "name": "J6-05-dropped-offline"},
        {"op": "network", "offline": False},
        {"op": "sleep", "ms": 8000},
        *source("back online"),
        {"op": "screenshot", "name": "J6-06-back-online"},
        {"op": "press", "testID": "cancel-download"},
        {"op": "sleep", "ms": 2000},
        *source("stopped"),
        *seal("start-now-with"),
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        *ask("What is the capital of France?"),
        {"op": "screenshot", "name": "J7-05-instant-after-wipe"},
        {"op": "assertText", "text": COULD_NOT, "absent": True},
    ])


if __name__ == "__main__":
    main()
