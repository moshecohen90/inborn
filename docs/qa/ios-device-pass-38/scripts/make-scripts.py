#!/usr/bin/env python3
"""Writes pass 38's bridge scripts into this folder. Run from docs/qa/ios-device-pass-38/scripts.
Rounds 132C and 133A-C on the phone, on the real free tier of a fresh twin (no setTier anywhere): J1 onboarding, Fast
installed from the vault, J2 a 9-page file summarized whole on Fast with ranged source chips, J3 "And now" / "Thanks" /
"shorter" in the same chat get plain replies and a real question still gets the 468 MB card, then single-page chips
above the file row and the Redact row, J4 the Documents screen's Ask sheet summarizes the whole file, J5 pictures on
Instant and a composer photo on Fast, J6 settings, vault and Stop. The founder's file is pushed under a neutral name and
its scripts (f*) write only to the ignored private/ folder."""
import json

BANNED = ["The request specifies", "I will focus", "as an AI", "NOT_FOUND", "<<<", "The user is asking"]
BLIND = ["cannot see", "can't see", "cannot physically see", "see images", "text-based", "unable to see", "not able to see", "don't have eyes"]
NONE_MATCHED = "Nothing in your documents matched this question"
COULD_NOT = "Could not load"
DONT_MENTION = "Your documents don't mention this"
NEEDS_OCR = "is a scan. Run OCR"
CAFE = "בית קפה הגינה תפריט.jpg"
NINE = "קובץ.pdf"
SCAN = "sign-scan.pdf"
CONSTITUTION = "constitution-9pages.pdf"
SEE = "What do you see?"
SUMMARIZE = "Summarize it"
RETENTION = "What does it say about data retention?"
TREASON = "What does it say about treason?"
PII = "My name is Dana and my phone is 555-0100"


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


def ask(text):
    return [{"op": "type", "testID": "composer-input", "text": text}, {"op": "send"}, {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 240000}, *done()]


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
    """The newest answer's ledger. Only the last answer of a chat is opened this way: the toggle is the first mounted."""
    return [
        {"op": "press", "testID": "ledger-toggle"},
        {"op": "sleep", "ms": 1200},
        {"op": "value", "testID": "ledger"},
        {"op": "screenshot", "name": f"{shot}-ledger"},
    ]


def picture_turn(shot, question=SEE, advice=True, first_ms=90000):
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
    """A summary ask in a chat with the file attached: no index card, 'Reading pages…', the answer with its scope line,
    ranged chips (round 133A) and, with the file still attached, the chips and LEDGER in view above the file row (133C)."""
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
        {"op": "value", "testID": "attached-docs"},
        {"op": "assertText", "text": f"Summary of all {pages} pages.", "testID": "assistant-text"},
        {"op": "assertText", "text": "p.1–", "testID": "citations"},
        {"op": "screenshot", "name": f"{shot}-summary"},
        {"op": "dump", "name": f"{shot}-summary"},
        *absent(BANNED + [NONE_MATCHED]),
        *ledger(shot),
        {"op": "dump", "name": f"{shot}-ledger"},
    ]


def plain_turn(shot, text):
    """Round 133B: a short follow-up after a file answer. If a card held it, `stop` never shows and the docs-hold check
    fails; the reply's own sources, notice and advice card are checked in the dump."""
    return [
        {"op": "type", "testID": "composer-input", "text": text},
        {"op": "send"},
        {"op": "sleep", "ms": 2500},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 300000},
        {"op": "sleep", "ms": 2500},
        {"op": "waitFor", "testID": "docs-hold", "gone": True, "timeoutMs": 1000},
        {"op": "waitFor", "testID": "none-matched", "gone": True, "timeoutMs": 1000},
        {"op": "waitFor", "testID": "model-advice", "gone": True, "timeoutMs": 3000},
        {"op": "assertText", "text": "468 MB", "absent": True},
        {"op": "assertText", "text": NONE_MATCHED, "absent": True},
        {"op": "screenshot", "name": f"{shot}"},
        {"op": "dump", "name": f"{shot}"},
    ]


def card_turn(shot, text):
    """A real question with no index model: the 468 MB card holds it; Cancel closes the card."""
    return [
        {"op": "type", "testID": "composer-input", "text": text},
        {"op": "send"},
        {"op": "waitFor", "testID": "docs-hold", "timeoutMs": 30000},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "docs-hold"},
        {"op": "assertText", "text": "468 MB", "testID": "docs-hold"},
        {"op": "screenshot", "name": f"{shot}-card"},
        {"op": "dump", "name": f"{shot}-card"},
        {"op": "press", "testID": "docs-hold-cancel"},
        {"op": "waitFor", "testID": "docs-hold", "gone": True, "timeoutMs": 10000},
        {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": f"{shot}-cancelled"},
        {"op": "dump", "name": f"{shot}-cancelled"},
    ]


def download_turn(shot, text):
    """The same question again, Download on the card: the index model comes from models.inbornapp.com, the held
    message goes out, single-page chips; then a draft shows the Redact row over the file row (133C)."""
    return [
        {"op": "type", "testID": "composer-input", "text": text},
        {"op": "send"},
        {"op": "waitFor", "testID": "docs-hold", "timeoutMs": 30000},
        {"op": "sleep", "ms": 1500},
        {"op": "press", "testID": "docs-hold-download"},
        {"op": "sleep", "ms": 4000},
        {"op": "value", "testID": "docs-hold"},
        {"op": "screenshot", "name": f"{shot}-downloading"},
        {"op": "idleTimer"},
        {"op": "waitFor", "testID": "docs-hold", "gone": True, "timeoutMs": 1800000},
        {"op": "sleep", "ms": 5000},
        {"op": "waitFor", "testID": "reading-docs", "gone": True, "timeoutMs": 900000},
        {"op": "sleep", "ms": 3000},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 600000},
        {"op": "sleep", "ms": 3000},
        {"op": "value", "testID": "attached-docs"},
        {"op": "screenshot", "name": f"{shot}-answer"},
        {"op": "dump", "name": f"{shot}-answer"},
        *absent(BANNED),
        *redact_row(shot),
    ]


def redact_row(shot):
    return [
        {"op": "type", "testID": "composer-input", "text": PII},
        {"op": "waitFor", "testID": "redact-bar", "timeoutMs": 10000},
        {"op": "sleep", "ms": 3000},
        {"op": "screenshot", "name": f"{shot}-redact-row"},
        {"op": "dump", "name": f"{shot}-redact-row"},
        {"op": "type", "testID": "composer-input", "text": ""},
        {"op": "waitFor", "testID": "redact-bar", "gone": True, "timeoutMs": 10000},
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

    write("j2a-install-fast", "J2 setup: the vault, Install Fast (1.28 GB from models.inbornapp.com), wait until it is installed.", [
        {"op": "deeplink", "url": "/vault"},
        {"op": "waitFor", "testID": "best-for", "timeoutMs": 30000},
        {"op": "sleep", "ms": 3000},
        {"op": "scrollTo", "testID": "install-fast"},
        {"op": "screenshot", "name": "J2-00a-vault-fast"},
        {"op": "press", "testID": "install-fast"},
        {"op": "sleep", "ms": 1500},
        {"op": "press", "testID": "confirm-download"},
        {"op": "sleep", "ms": 15000},
        {"op": "value", "testID": "model-status-fast"},
        {"op": "screenshot", "name": "J2-00b-fast-downloading"},
        {"op": "idleTimer"},
        {"op": "waitFor", "testID": "use-fast", "timeoutMs": 1800000},
        {"op": "value", "testID": "model-status-fast"},
        {"op": "screenshot", "name": "J2-00c-fast-installed"},
    ])

    write("close-sheet", "Harness: closes a model sheet left open (f2's rerun opened it on a chat already on Fast, where the sheet has no 'use' button), then shows the end of the chat.", [
        {"op": "press", "testID": "model-sheet-close"},
        {"op": "waitFor", "testID": "model-sheet", "gone": True, "timeoutMs": 10000},
        {"op": "sleep", "ms": 2000},
        {"op": "screenshot", "name": "P3-chat-end"},
        {"op": "dump", "name": "P3-chat-end"},
    ])

    write("cool", "Between runs: wait until the app's thermal banner ('Slowing down to keep the phone cool') is gone, so the timed turns are not throttled.", [
        {"op": "deeplink", "url": "/chats"},
        {"op": "sleep", "ms": 2000},
        {"op": "waitFor", "testID": "banner-thermal", "gone": True, "timeoutMs": 900000},
    ])

    # The founder's file (private/).
    write("f2-nine-fast", f"J2 PRIVATE: a new chat on Fast, '{NINE}' (the founder's 9-page file under a neutral name), '{SUMMARIZE}': no index card, 'Reading pages…', 'Summary of all 9 pages.', ranged chips, chips and LEDGER above the file row.", [
        *use_model("fast", "FAST"),
        *attach(NINE, settle=20000),
        {"op": "screenshot", "name": "P2-01-attached"},
        *summary_turn("P2-02"),
    ])
    for n, text in (("a-and-now", "And now"), ("b-thanks", "Thanks"), ("c-shorter", "shorter")):
        write(f"f3{n}", f"J3 PRIVATE: the same chat, '{text}': a plain reply, no card, no none-matched line, no advice card.", plain_turn(f"P3{n}", text))
    write("f3d-retention-card", f"J3 PRIVATE: the same chat, '{RETENTION}' with no index model: the 468 MB card; Cancel.", card_turn("P3d", RETENTION))

    # The tracked fixture: the same journey.
    write("j2-fixture-fast", f"J2: a new chat on Fast, '{CONSTITUTION}', '{SUMMARIZE}': no index card, 'Reading pages…', 'Summary of all 9 pages.', ranged chips p.1–2…, chips and LEDGER above the file row.", [
        *new_chat(),
        {"op": "assertText", "text": "FAST", "testID": "model-chip"},
        *attach(CONSTITUTION, settle=20000),
        {"op": "screenshot", "name": "J2-01-attached"},
        *summary_turn("J2-02"),
    ])
    for n, text in (("a-and-now", "And now"), ("b-thanks", "Thanks"), ("c-thank-you", "thank you"), ("d-shorter", "shorter")):
        write(f"j3{n}", f"J3: the same chat, '{text}': a plain reply, no card, no none-matched line, no advice card.", plain_turn(f"J3{n}", text))
    write("j3e-treason-card", f"J3: the same chat, '{TREASON}' with no index model: the 468 MB card; Cancel.", card_turn("J3e", TREASON))
    write("j3f-treason-download", f"J3: '{TREASON}' again, Download on the card: the index model, the answer with single-page chips above the file row, then the Redact row.", download_turn("J3f", TREASON))

    write("f3e-chats", "J3 PRIVATE: the chat list, dumped so the shell can find the founder's chat id (it lists the file's chat title).", [
        {"op": "deeplink", "url": "/chats"},
        {"op": "waitFor", "testID": "new-chat", "timeoutMs": 15000},
        {"op": "sleep", "ms": 2000},
        {"op": "dump", "name": "P3e-chats"},
    ])

    write("f3e-retention-answer", f"J3 PRIVATE: back in the founder's chat (CHATID filled in by the shell), '{RETENTION}' now that the index model is in: no card, single-page chips above the file row, then the Redact row.", [
        {"op": "deeplink", "url": "/chats"},
        {"op": "waitFor", "testID": "chat-row-CHATID", "timeoutMs": 15000},
        {"op": "press", "testID": "chat-row-CHATID"},
        {"op": "waitFor", "testID": "composer-input", "timeoutMs": 30000},
        {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 180000},
        {"op": "sleep", "ms": 3000},
        {"op": "value", "testID": "model-chip"},
        {"op": "value", "testID": "attached-docs"},
        {"op": "type", "testID": "composer-input", "text": RETENTION},
        {"op": "send"},
        {"op": "sleep", "ms": 3000},
        {"op": "waitFor", "testID": "docs-hold", "gone": True, "timeoutMs": 1000},
        {"op": "waitFor", "testID": "reading-docs", "gone": True, "timeoutMs": 900000},
        {"op": "sleep", "ms": 2000},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 600000},
        {"op": "sleep", "ms": 3000},
        {"op": "screenshot", "name": "P3e-answer"},
        {"op": "dump", "name": "P3e-answer"},
        *absent(BANNED),
        *redact_row("P3e"),
    ])

    write("j4a-documents", "J4: the Documents screen, dumped so the shell can pick the fixture's doc id (private: it lists the founder's file too).", [
        {"op": "deeplink", "url": "/documents"},
        {"op": "waitFor", "testID": "documents-screen", "timeoutMs": 30000},
        {"op": "sleep", "ms": 3000},
        {"op": "screenshot", "name": "P4-00-documents"},
        {"op": "dump", "name": "P4-00-documents"},
    ])
    write("j4b-sheet", f"J4: Documents → select '{CONSTITUTION}' only (DOCID filled in by the shell) → Ask: '{SUMMARIZE}' shows 'Reading pages…' in the sheet, the answer with 'Summary of all 9 pages.', stats 'read … · 9 of 9 pages'; then 'Who can veto a bill?' is still a search ('… passages').", [
        {"op": "deeplink", "url": "/documents"},
        {"op": "waitFor", "testID": "doc-select-DOCID", "timeoutMs": 30000},
        {"op": "sleep", "ms": 2000},
        {"op": "press", "testID": "doc-select-DOCID"},
        {"op": "sleep", "ms": 1000},
        {"op": "value", "testID": "documents-ask-selected"},
        {"op": "press", "testID": "documents-ask-selected"},
        {"op": "waitFor", "testID": "ask-sheet", "timeoutMs": 20000},
        {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": "J4-01-sheet"},
        {"op": "type", "testID": "ask-input", "text": SUMMARIZE},
        {"op": "press", "testID": "ask-send"},
        {"op": "waitFor", "testID": "ask-reading-pages", "timeoutMs": 120000},
        {"op": "value", "testID": "ask-reading-pages"},
        {"op": "screenshot", "name": "J4-02-reading"},
        {"op": "waitFor", "testID": "ask-stop", "gone": True, "timeoutMs": 900000},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "ask-answer"},
        {"op": "value", "testID": "ask-stats"},
        {"op": "screenshot", "name": "J4-03-summary"},
        {"op": "assertText", "testID": "ask-answer", "text": "Summary of all 9 pages."},
        {"op": "assertText", "testID": "ask-stats", "text": "9 of 9 pages"},
        {"op": "waitFor", "testID": "ask-none-matched", "gone": True, "timeoutMs": 1000},
        {"op": "waitFor", "testID": "ask-not-found", "gone": True, "timeoutMs": 1000},
        {"op": "type", "testID": "ask-input", "text": "Who can veto a bill?"},
        {"op": "press", "testID": "ask-send"},
        {"op": "sleep", "ms": 2000},
        {"op": "waitFor", "testID": "ask-stop", "gone": True, "timeoutMs": 600000},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "ask-answer"},
        {"op": "value", "testID": "ask-stats"},
        {"op": "screenshot", "name": "J4-04-question"},
        {"op": "assertText", "testID": "ask-stats", "text": "passages"},
        {"op": "assertText", "testID": "ask-answer", "text": "Summary of all", "absent": True},
    ])

    write("j4c-sheet-stats", f"J4 stats: the stats line is Pro-only (can('detailedStats')), so this run sets the twin to Pro, asks '{SUMMARIZE}' in the sheet for the stats 'read … · 9 of 9 pages', then 'Who can veto a bill?' for '… passages', and sets the twin back to free. DOCID filled in by the shell.", [
        {"op": "deeplink", "url": "/chats"},
        {"op": "waitFor", "testID": "ask-sheet", "gone": True, "timeoutMs": 10000},
        {"op": "setTier", "tier": "pro"},
        {"op": "deeplink", "url": "/documents"},
        {"op": "waitFor", "testID": "doc-select-DOCID", "timeoutMs": 30000},
        {"op": "sleep", "ms": 2000},
        {"op": "press", "testID": "doc-select-DOCID"},
        {"op": "sleep", "ms": 1000},
        {"op": "press", "testID": "documents-ask-selected"},
        {"op": "waitFor", "testID": "ask-sheet", "timeoutMs": 20000},
        {"op": "type", "testID": "ask-input", "text": SUMMARIZE},
        {"op": "press", "testID": "ask-send"},
        {"op": "waitFor", "testID": "ask-reading-pages", "timeoutMs": 120000},
        {"op": "waitFor", "testID": "ask-stop", "gone": True, "timeoutMs": 900000},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "ask-answer"},
        {"op": "value", "testID": "ask-stats"},
        {"op": "assertText", "testID": "ask-answer", "text": "Summary of all 9 pages."},
        {"op": "assertText", "testID": "ask-stats", "text": "9 of 9 pages"},
        {"op": "screenshot", "name": "J4-05-summary-stats"},
        {"op": "type", "testID": "ask-input", "text": "Who can veto a bill?"},
        {"op": "press", "testID": "ask-send"},
        {"op": "sleep", "ms": 2000},
        {"op": "waitFor", "testID": "ask-stop", "gone": True, "timeoutMs": 600000},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "ask-stats"},
        {"op": "assertText", "testID": "ask-stats", "text": "passages"},
        {"op": "screenshot", "name": "J4-06-question-stats"},
        {"op": "deeplink", "url": "/chats"},
        {"op": "setTier", "tier": "free"},
    ])

    for tier in ("free", "pro"):
        write(f"j4d-veto-{tier}", f"J4 isolation: j4c's Pro answers came back empty (0 tokens). 'Who can veto a bill?' in the sheet on {tier}, then back to free. DOCID filled in by the shell.", [
            {"op": "deeplink", "url": "/chats"},
            {"op": "waitFor", "testID": "ask-sheet", "gone": True, "timeoutMs": 10000},
            {"op": "setTier", "tier": tier},
            {"op": "deeplink", "url": "/documents"},
            {"op": "waitFor", "testID": "doc-select-DOCID", "timeoutMs": 30000},
            {"op": "sleep", "ms": 2000},
            {"op": "press", "testID": "doc-select-DOCID"},
            {"op": "sleep", "ms": 1000},
            {"op": "press", "testID": "documents-ask-selected"},
            {"op": "waitFor", "testID": "ask-sheet", "timeoutMs": 20000},
            {"op": "type", "testID": "ask-input", "text": "Who can veto a bill?"},
            {"op": "press", "testID": "ask-send"},
            {"op": "sleep", "ms": 2000},
            {"op": "waitFor", "testID": "ask-stop", "gone": True, "timeoutMs": 600000},
            {"op": "sleep", "ms": 2000},
            {"op": "value", "testID": "ask-answer"},
            {"op": "screenshot", "name": f"J4-07-veto-{tier}"},
            {"op": "dump", "name": f"J4-07-veto-{tier}"},
            {"op": "deeplink", "url": "/chats"},
            {"op": "setTier", "tier": "free"},
        ])

    write("sanity-chat", "Isolation: after the sheet's empty answers, does a plain chat turn on Fast still generate?", [
        *new_chat(),
        *ask("What is the capital of France?"),
        {"op": "screenshot", "name": "J4-08-chat-sanity"},
    ])

    write("j5a-scan-instant", f"J5: a new chat on Instant, '{SCAN}' (no text layer), 'What do you see?': the page picture, the sign read, the Fast advice card; imageMaxTokens from dev-run.", [
        *use_model("instant", "INSTANT"),
        *attach(SCAN),
        {"op": "screenshot", "name": "J5-01-composer-chip"},
        *picture_turn("J5-02"),
    ])
    write("j5b-photo-instant", f"J5: a new chat on Instant, the café photo '{CAFE}' from the composer, 'What do you see?'.", [
        *new_chat(),
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        *attach(CAFE, "pending-images"),
        {"op": "waitFor", "testID": "attached-docs", "gone": True, "timeoutMs": 1000},
        *picture_turn("J5-03"),
    ])
    write("j5c-photo-fast", f"J5: a new chat on Fast (no photo pack yet), the café photo '{CAFE}': the pack card, Download 668 MB, the held message goes out; an answer on Fast or the out-of-memory switch is recorded.", [
        *use_model("fast", "FAST"),
        *attach(CAFE, "pending-images"),
        {"op": "type", "testID": "composer-input", "text": SEE},
        {"op": "send"},
        {"op": "waitFor", "testID": "vision-hold", "timeoutMs": 30000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "vision-hold"},
        {"op": "assertText", "text": "668 MB", "testID": "vision-hold"},
        {"op": "screenshot", "name": "J5-04-pack-card"},
        {"op": "press", "testID": "vision-hold-download"},
        {"op": "idleTimer"},
        {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1800000},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 240000},
        {"op": "value", "testID": "user-images"},
        {"op": "screenshot", "name": "J5-05-sent-bubble"},
        *done(),
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "model-chip"},
        {"op": "screenshot", "name": "J5-05-answer"},
        {"op": "dump", "name": "J5-05-answer"},
        *absent(BLIND + BANNED),
        *ledger("J5-05"),
    ])

    write("j6-settings-vault-stop", "J6: Settings opens, the vault opens on this phone, and Stop in the middle of a long answer leaves the text so far and a working composer.", [
        {"op": "deeplink", "url": "/settings"},
        {"op": "waitFor", "testID": "row-wipe", "timeoutMs": 15000},
        {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": "J6-01-settings"},
        {"op": "dump", "name": "J6-01-settings"},
        {"op": "deeplink", "url": "/vault"},
        {"op": "waitFor", "testID": "best-for", "timeoutMs": 30000},
        {"op": "sleep", "ms": 3000},
        {"op": "value", "testID": "best-for-use"},
        {"op": "screenshot", "name": "J6-02-vault"},
        {"op": "dump", "name": "J6-02-vault"},
        *new_chat(),
        {"op": "type", "testID": "composer-input", "text": "Write a long story of about 600 words about a lighthouse keeper."},
        {"op": "send"},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 120000},
        {"op": "sleep", "ms": 4000},
        {"op": "press", "testID": "stop"},
        {"op": "sleep", "ms": 2000},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 10000},
        {"op": "value", "testID": "assistant-text"},
        {"op": "screenshot", "name": "J6-03-stopped"},
        {"op": "dump", "name": "J6-03-stopped"},
        *ask("What is the capital of France?"),
        {"op": "screenshot", "name": "J6-04-after-stop"},
        {"op": "dump", "name": "J6-04-after-stop"},
        {"op": "assertText", "text": COULD_NOT, "absent": True},
    ])


if __name__ == "__main__":
    main()
