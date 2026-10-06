#!/usr/bin/env python3
"""Writes pass 39's bridge scripts into this folder. Run from docs/qa/ios-device-pass-39/scripts.
Rounds 134A (follow-ups applied to the previous answer), 134B (phone embeddings), 134D (Ask sheet plain lines), 134E
(memory guard) and 134F (Hebrew file names) on the phone, on the real free tier of a fresh twin (no setTier). Every
journey goes 2-3 natural steps past its goal. The founder's file is pushed under a neutral name and its scripts (p*)
write only to the ignored private/ folder. DOCID / CHATID / HISID are filled in by the shell."""
import json

BANNED = ["The request specifies", "I will focus", "as an AI", "NOT_FOUND", "<<<", "The user is asking"]
BLIND = ["cannot see", "can't see", "cannot physically see", "see images", "text-based", "unable to see", "not able to see", "don't have eyes"]
NONE_MATCHED = "Nothing in your documents matched this question"
DONT_MENTION = "Your documents don't mention this"
NEEDS_OCR = "is a scan. Run OCR"
CAFE = "בית קפה הגינה תפריט.jpg"
NINE = "קובץ.pdf"
SCAN = "sign-scan.pdf"
CONSTITUTION = "constitution-9pages.pdf"
TURBINE = "turbine-report-3pages.pdf"
SEE = "What do you see?"
SUMMARIZE = "Summarize it"
DELETING = "What does it say about deleting my information?"
VETO = "Who can veto a bill?"
STORY = "Write a long story of about 600 words about a lighthouse keeper."
PII = "My name is Dana and my phone is 555-0100"


def new_chat():
    return [
        {"op": "deeplink", "url": "/chats"},
        {"op": "waitFor", "testID": "new-chat", "timeoutMs": 15000},
        {"op": "press", "testID": "new-chat"},
        {"op": "waitFor", "testID": "start-chat", "timeoutMs": 10000},
        {"op": "press", "testID": "start-chat"},
        {"op": "waitFor", "testID": "composer-input", "timeoutMs": 30000},
        {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 180000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "model-chip"},
    ]


def switch_model(mid, chip):
    """Through the model sheet; Close afterwards in case the chat was already on it (then there is no 'use' button)."""
    return [
        {"op": "press", "testID": "model-chip"},
        {"op": "waitFor", "testID": "model-sheet", "timeoutMs": 10000},
        {"op": "sleep", "ms": 1500},
        {"op": "press", "testID": f"model-sheet-use-{mid}"},
        {"op": "sleep", "ms": 3000},
        {"op": "press", "testID": "model-sheet-close"},
        {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 240000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "model-chip"},
        {"op": "assertText", "text": chip, "testID": "model-chip"},
    ]


def attach(name, kind="attached-docs", settle=10000):
    return [
        {"op": "devPrompt", "lines": [f"attach: {name}"]},
        {"op": "waitFor", "testID": kind, "timeoutMs": 60000},
        {"op": "sleep", "ms": settle},
        {"op": "value", "testID": kind},
    ]


def shot(name, wait=2000):
    return [{"op": "sleep", "ms": wait}, {"op": "screenshot", "name": name}, {"op": "dump", "name": name}]


def turn(name, text, extra=()):
    """Send and wait for whatever comes: a reading line, a card (then `stop` never shows) or an answer."""
    return [
        {"op": "type", "testID": "composer-input", "text": text},
        {"op": "send"},
        {"op": "sleep", "ms": 2500},
        {"op": "waitFor", "testID": "reading-pages", "gone": True, "timeoutMs": 900000},
        {"op": "waitFor", "testID": "reading-docs", "gone": True, "timeoutMs": 900000},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 900000},
        {"op": "sleep", "ms": 2500},
        {"op": "value", "testID": "assistant-text"},
        *extra,
        {"op": "screenshot", "name": name},
        {"op": "dump", "name": name},
    ]


def plain(name, text, words=()):
    """A thanks or a follow-up after a file answer: no card, no none-matched line, no SOURCES of its own."""
    return turn(name, text, [
        {"op": "waitFor", "testID": "docs-hold", "gone": True, "timeoutMs": 1000},
        {"op": "waitFor", "testID": "none-matched", "gone": True, "timeoutMs": 1000},
        {"op": "assertText", "text": "468 MB", "absent": True},
        {"op": "assertText", "text": NONE_MATCHED, "absent": True},
        *[{"op": "assertText", "text": w, "testID": "assistant-text", "absent": True} for w in words],
    ])


def ledger(name):
    return [
        {"op": "press", "testID": "ledger-toggle"},
        {"op": "sleep", "ms": 1200},
        {"op": "value", "testID": "ledger"},
        {"op": "screenshot", "name": f"{name}-ledger"},
        {"op": "press", "testID": "ledger-toggle"},
        {"op": "sleep", "ms": 800},
    ]


def summary_turn(name, pages=9):
    return [
        {"op": "type", "testID": "composer-input", "text": SUMMARIZE},
        {"op": "send"},
        {"op": "waitFor", "testID": "reading-pages", "timeoutMs": 120000},
        {"op": "value", "testID": "reading-pages"},
        {"op": "waitFor", "testID": "docs-hold", "gone": True, "timeoutMs": 1000},
        {"op": "screenshot", "name": f"{name}-reading"},
        {"op": "waitFor", "testID": "reading-pages", "gone": True, "timeoutMs": 900000},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 240000},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 600000},
        {"op": "sleep", "ms": 2500},
        {"op": "value", "testID": "assistant-text"},
        {"op": "value", "testID": "citations"},
        {"op": "value", "testID": "attached-docs"},
        {"op": "assertText", "text": f"Summary of all {pages} pages.", "testID": "assistant-text"},
        {"op": "assertText", "text": "p.1–", "testID": "citations"},
        {"op": "screenshot", "name": f"{name}-summary"},
        {"op": "dump", "name": f"{name}-summary"},
        *[{"op": "assertText", "text": w, "testID": "assistant-text", "absent": True} for w in BANNED],
        *ledger(name),
    ]


def card(name, text):
    """A real question with no index model: the 468 MB card holds it; Cancel closes the card."""
    return [
        {"op": "type", "testID": "composer-input", "text": text},
        {"op": "send"},
        {"op": "waitFor", "testID": "docs-hold", "timeoutMs": 30000},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "docs-hold"},
        {"op": "assertText", "text": "468 MB", "testID": "docs-hold"},
        *shot(f"{name}-card", 0),
        {"op": "press", "testID": "docs-hold-cancel"},
        {"op": "waitFor", "testID": "docs-hold", "gone": True, "timeoutMs": 10000},
        *shot(f"{name}-cancelled", 1500),
    ]


def download(name, text):
    """The question with no index model: the card, Download, the held message answered."""
    return [
        {"op": "type", "testID": "composer-input", "text": text},
        {"op": "send"},
        {"op": "waitFor", "testID": "docs-hold", "timeoutMs": 30000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "docs-hold"},
        *shot(f"{name}-card", 0),
        {"op": "press", "testID": "docs-hold-download"},
        {"op": "sleep", "ms": 4000},
        {"op": "value", "testID": "docs-hold"},
        {"op": "screenshot", "name": f"{name}-downloading"},
        {"op": "idleTimer"},
        {"op": "waitFor", "testID": "docs-hold", "gone": True, "timeoutMs": 1800000},
        {"op": "sleep", "ms": 5000},
        {"op": "waitFor", "testID": "reading-docs", "gone": True, "timeoutMs": 900000},
        {"op": "sleep", "ms": 3000},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 600000},
        {"op": "sleep", "ms": 3000},
        {"op": "value", "testID": "assistant-text"},
        {"op": "value", "testID": "citations"},
        {"op": "waitFor", "testID": "none-matched", "gone": True, "timeoutMs": 1000},
        {"op": "assertText", "text": DONT_MENTION, "testID": "assistant-text", "absent": True},
        *shot(f"{name}-answer", 0),
    ]


def question(name, text):
    """A real question with the index model in: SOURCES, no none-matched line, no 'don't mention'."""
    return turn(name, text, [
        {"op": "value", "testID": "citations"},
        {"op": "waitFor", "testID": "none-matched", "gone": True, "timeoutMs": 1000},
        {"op": "assertText", "text": DONT_MENTION, "testID": "assistant-text", "absent": True},
    ])


def tallest(name):
    """The composer at its tallest (file row + Redact row): is the end of the last answer still in view?"""
    return [
        {"op": "type", "testID": "composer-input", "text": PII},
        {"op": "waitFor", "testID": "redact-bar", "timeoutMs": 10000},
        *shot(f"{name}-tallest", 3000),
        {"op": "type", "testID": "composer-input", "text": ""},
        {"op": "waitFor", "testID": "redact-bar", "gone": True, "timeoutMs": 10000},
        {"op": "sleep", "ms": 1500},
    ]


def leave_return(name):
    return [
        {"op": "press", "testID": "open-chats"},
        {"op": "waitFor", "testID": "close-chats", "timeoutMs": 10000},
        *shot(f"{name}-chats", 1500),
        {"op": "press", "testID": "close-chats"},
        {"op": "waitFor", "testID": "composer-input", "timeoutMs": 10000},
        *shot(f"{name}-back", 2500),
    ]


def open_chat(cid):
    return [
        {"op": "deeplink", "url": "/chats"},
        {"op": "waitFor", "testID": f"chat-row-{cid}", "timeoutMs": 15000},
        {"op": "press", "testID": f"chat-row-{cid}"},
        {"op": "waitFor", "testID": "composer-input", "timeoutMs": 30000},
        {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 180000},
        {"op": "sleep", "ms": 3000},
        {"op": "value", "testID": "model-chip"},
        {"op": "value", "testID": "attached-docs"},
    ]


def sheet_open(did):
    return [
        {"op": "deeplink", "url": "/documents"},
        {"op": "waitFor", "testID": f"doc-select-{did}", "timeoutMs": 30000},
        {"op": "sleep", "ms": 2000},
        {"op": "press", "testID": f"doc-select-{did}"},
        {"op": "sleep", "ms": 1000},
        {"op": "value", "testID": "documents-ask-selected"},
        {"op": "press", "testID": "documents-ask-selected"},
        {"op": "waitFor", "testID": "ask-sheet", "timeoutMs": 20000},
        {"op": "sleep", "ms": 1500},
    ]


def sheet_ask(name, text, extra=()):
    return [
        {"op": "type", "testID": "ask-input", "text": text},
        {"op": "press", "testID": "ask-send"},
        {"op": "sleep", "ms": 2500},
        {"op": "waitFor", "testID": "ask-stop", "gone": True, "timeoutMs": 900000},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "ask-plain"},
        {"op": "value", "testID": "ask-answer"},
        {"op": "value", "testID": "citations"},
        *extra,
        *shot(name, 0),
    ]


def sheet_plain(name, text, line):
    return sheet_ask(name, text, [
        {"op": "assertText", "text": line, "testID": "ask-plain"},
        {"op": "waitFor", "testID": "ask-none-matched", "gone": True, "timeoutMs": 1000},
        {"op": "waitFor", "testID": "ask-not-found", "gone": True, "timeoutMs": 1000},
    ])


def details(name, did):
    return [
        {"op": "deeplink", "url": "/documents"},
        {"op": "waitFor", "testID": f"doc-row-{did}", "timeoutMs": 30000},
        {"op": "sleep", "ms": 1500},
        {"op": "press", "testID": f"doc-row-{did}"},
        {"op": "waitFor", "testID": "doc-details", "timeoutMs": 10000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "doc-details"},
        {"op": "assertText", "text": "embed-e5", "testID": "doc-details"},
        {"op": "assertText", "text": "@2", "testID": "doc-details", "absent": True},
        *shot(name, 0),
    ]


def photo_turn(name, first_ms=120000):
    return [
        {"op": "type", "testID": "composer-input", "text": SEE},
        {"op": "send"},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": first_ms},
        {"op": "value", "testID": "user-images"},
        {"op": "screenshot", "name": f"{name}-sent-bubble"},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 400000},
        {"op": "sleep", "ms": 3000},
        {"op": "value", "testID": "assistant-text"},
        *[{"op": "assertText", "text": w, "testID": "assistant-text", "absent": True} for w in BLIND + BANNED + [DONT_MENTION, NEEDS_OCR]],
        *shot(f"{name}-answer", 0),
        *ledger(name),
    ]


def write(name, note, steps):
    with open(f"{name}.json", "w") as f:
        json.dump({"_": note, "steps": steps}, f, indent=1, ensure_ascii=False)
        f.write("\n")


def main():
    write("j1-onboard", "J1: a fresh twin, Welcome, the model step (the source line names the host), 'Start now with Instant', the chat on Instant; then 'Hi', the Chats list and back, 'What can you do?'.", [
        {"op": "waitFor", "testID": "onboarding-continue", "timeoutMs": 120000},
        *shot("J1-00-welcome", 1200),
        {"op": "press", "testID": "onboarding-continue"},
        {"op": "waitFor", "testID": "onboarding-model", "timeoutMs": 30000},
        {"op": "sleep", "ms": 2500},
        {"op": "value", "testID": "model-source-fast"},
        {"op": "assertText", "text": "models.inbornapp.com", "testID": "model-source-fast"},
        {"op": "screenshot", "name": "J1-01-model-step"},
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
        {"op": "screenshot", "name": "J1-02-chat-instant"},
        *turn("J1-03-hi", "Hi"),
        *leave_return("J1-04"),
        *turn("J1-05-what-can-you-do", "What can you do?"),
    ])

    write("j2-install-fast", "J2: the vault, Install Fast (from models.inbornapp.com), wait until installed; then a new chat: which model does it open on; then the model sheet and the vault side by side (J8, 'In use').", [
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
        *new_chat(),
        *shot("J2-01-new-chat"),
        {"op": "press", "testID": "model-chip"},
        {"op": "waitFor", "testID": "model-sheet", "timeoutMs": 10000},
        *shot("J8-01-model-sheet", 1500),
        {"op": "press", "testID": "model-sheet-close"},
        {"op": "deeplink", "url": "/vault"},
        {"op": "waitFor", "testID": "best-for", "timeoutMs": 30000},
        *shot("J8-02-vault", 3000),
    ])

    write("j3-constitution", f"J3 (tracked): a new chat on Fast, '{CONSTITUTION}', '{SUMMARIZE}', ranged chips; 'And now', 'Thanks', 'shorter' (134A: a shorter summary), 'more'; then '{VETO}' with no index model: the 468 MB card (J8: a text PDF is held); Cancel; the tallest composer.", [
        *new_chat(),
        *switch_model("fast", "FAST"),
        *attach(CONSTITUTION, settle=20000),
        {"op": "screenshot", "name": "J3-01-attached"},
        *summary_turn("J3-02"),
        *plain("J3-03-and-now", "And now"),
        *plain("J3-04-thanks", "Thanks"),
        *plain("J3-05-shorter", "shorter", ["welcome", "Welcome"]),
        *plain("J3-06-more", "more", ["welcome", "Welcome"]),
        *card("J8-03", VETO),
        *tallest("J8-04"),
    ])

    write("p3-founder", f"J3 PRIVATE: a new chat on Fast, '{NINE}' (the founder's 9-page file), '{SUMMARIZE}', chips p.1–2 … p.8–9 (134F order); 'And now', 'Thanks', 'shorter', 'more'; '{DELETING}' → the 468 MB card → Download → answered with passages (134B); the same question a second time; the tallest composer, Chats and back.", [
        *new_chat(),
        *switch_model("fast", "FAST"),
        *attach(NINE, settle=20000),
        {"op": "screenshot", "name": "P3-01-attached"},
        *summary_turn("P3-02"),
        *plain("P3-03-and-now", "And now"),
        *plain("P3-04-thanks", "Thanks"),
        *plain("P3-05-shorter", "shorter", ["welcome", "Welcome"]),
        *plain("P3-06-more", "more", ["welcome", "Welcome"]),
        *download("P3-07", DELETING),
        *question("P3-08-again", DELETING),
        *tallest("P3-09"),
        *leave_return("P3-10"),
    ])

    write("p0-lists", "PRIVATE harness: the Chats list and the Documents screen, dumped so the shell can find the chat and document ids (they list the founder's file).", [
        {"op": "deeplink", "url": "/chats"},
        {"op": "waitFor", "testID": "new-chat", "timeoutMs": 15000},
        *shot("P0-chats"),
        {"op": "deeplink", "url": "/documents"},
        {"op": "waitFor", "testID": "documents-screen", "timeoutMs": 30000},
        *shot("P0-documents", 3000),
    ])

    write("p4-sheet", f"J3 PRIVATE: Documents → the founder's file only (HISID) → Ask: '{DELETING}' (all KEPT, the same cosines as the chat), 'thank you', then its details: 'Index model embed-e5'.", [
        *sheet_open("HISID"),
        *sheet_ask("P4-01-sheet-deleting", DELETING, [
            {"op": "waitFor", "testID": "ask-none-matched", "gone": True, "timeoutMs": 1000},
            {"op": "assertText", "text": DONT_MENTION, "testID": "ask-answer", "absent": True},
        ]),
        *sheet_plain("P4-02-sheet-thank-you", "thank you", "Ask another question about these documents"),
        {"op": "deeplink", "url": "/chats"},
        {"op": "sleep", "ms": 1500},
        *details("P4-03-details", "HISID"),
    ])

    write("j3b-veto", f"J3 (tracked): back in the constitution chat (CHATID), '{VETO}' with the index model now in, then the same question a second time; Chats and back.", [
        *open_chat("CHATID"),
        *question("J3-07-veto", VETO),
        *question("J3-08-veto-again", VETO),
        *leave_return("J3-09"),
    ])

    write("j4-sheet", f"J4 (134D): Documents → '{CONSTITUTION}' only (DOCID) → Ask: '{SUMMARIZE}' (whole file), 'thank you' → the thanks line, 'And now' → the one-question line, '{VETO}' → a search with chips; then the document's details.", [
        *sheet_open("DOCID"),
        {"op": "screenshot", "name": "J4-01-sheet"},
        {"op": "type", "testID": "ask-input", "text": SUMMARIZE},
        {"op": "press", "testID": "ask-send"},
        {"op": "waitFor", "testID": "ask-reading-pages", "timeoutMs": 120000},
        {"op": "value", "testID": "ask-reading-pages"},
        {"op": "screenshot", "name": "J4-02-reading"},
        {"op": "waitFor", "testID": "ask-stop", "gone": True, "timeoutMs": 900000},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "ask-answer"},
        {"op": "assertText", "testID": "ask-answer", "text": "Summary of all 9 pages."},
        {"op": "waitFor", "testID": "ask-none-matched", "gone": True, "timeoutMs": 1000},
        {"op": "waitFor", "testID": "ask-not-found", "gone": True, "timeoutMs": 1000},
        *shot("J4-03-summary", 0),
        *sheet_plain("J4-04-thank-you", "thank you", "You're welcome. Ask another question about these documents."),
        *sheet_plain("J4-05-and-now", "And now", "This sheet answers one question at a time"),
        *sheet_ask("J4-06-veto", VETO, [
            {"op": "assertText", "testID": "ask-answer", "text": "Summary of all", "absent": True},
            {"op": "waitFor", "testID": "ask-none-matched", "gone": True, "timeoutMs": 1000},
            {"op": "waitFor", "testID": "ask-not-found", "gone": True, "timeoutMs": 1000},
        ]),
        *sheet_ask("J4-07-veto-again", VETO),
        {"op": "deeplink", "url": "/chats"},
        {"op": "sleep", "ms": 1500},
        *details("J4-08-details", "DOCID"),
    ])

    write("j5a-scan-instant", f"J5: a new chat on Instant, '{SCAN}', '{SEE}' (imageMaxTokens 1024 in dev-run); 'Not now' on the advice card; 'and the colours?'.", [
        *new_chat(),
        *switch_model("instant", "INSTANT"),
        *attach(SCAN),
        *photo_turn("J5-01"),
        {"op": "value", "testID": "model-advice-reason"},
        {"op": "press", "testID": "model-advice-not-now"},
        *shot("J5-02-not-now", 1500),
        *turn("J5-03-colours", "and the colours?"),
    ])

    write("j5b-cafe-instant", f"J5: a new chat on Instant, the café photo, '{SEE}'; 'thanks'.", [
        *new_chat(),
        *switch_model("instant", "INSTANT"),
        *attach(CAFE, "pending-images", settle=3000),
        *photo_turn("J5-04"),
        *turn("J5-05-thanks", "thanks"),
    ])

    write("j5c-cafe-fast", f"J5: a new chat on Fast, the café photo, '{SEE}': the photo pack card, Download, the answer; 'and the colours?'.", [
        *new_chat(),
        *switch_model("fast", "FAST"),
        *attach(CAFE, "pending-images", settle=3000),
        {"op": "type", "testID": "composer-input", "text": SEE},
        {"op": "send"},
        {"op": "waitFor", "testID": "vision-hold", "timeoutMs": 30000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "vision-hold"},
        *shot("J5-06-pack-card", 0),
        {"op": "press", "testID": "vision-hold-download"},
        {"op": "idleTimer"},
        {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1800000},
        *shot("J5-07-after-card", 1500),
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 240000},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 600000},
        {"op": "sleep", "ms": 3000},
        {"op": "value", "testID": "assistant-text"},
        {"op": "value", "testID": "model-chip"},
        *shot("J5-08-answer", 0),
        *turn("J5-09-colours", "and the colours?"),
    ])

    write("j6-story", f"J6 (134E): the same chat, Fast with its pack: a photo turn first (the café again), then '{STORY}'; then 'Give it a title.'; the banners; Chats, Settings and back; the photo again.", [
        {"op": "value", "testID": "model-chip"},
        *attach(CAFE, "pending-images", settle=3000),
        *photo_turn("J6-00-photo"),
        {"op": "type", "testID": "composer-input", "text": STORY},
        {"op": "send"},
        {"op": "sleep", "ms": 3000},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 900000},
        {"op": "sleep", "ms": 3000},
        {"op": "value", "testID": "assistant-text"},
        {"op": "value", "testID": "banners"},
        {"op": "value", "testID": "model-chip"},
        *shot("J6-01-story", 0),
        *turn("J6-02-title", "Give it a title.", [{"op": "value", "testID": "banners"}, {"op": "value", "testID": "model-chip"}]),
        *turn("J6-03-shorter", "Make the title shorter.", [{"op": "value", "testID": "banners"}, {"op": "value", "testID": "model-chip"}]),
        {"op": "press", "testID": "open-chats"},
        {"op": "waitFor", "testID": "drawer-settings", "timeoutMs": 10000},
        *shot("J6-04-chats", 1500),
        {"op": "press", "testID": "drawer-settings"},
        {"op": "waitFor", "testID": "row-wipe", "timeoutMs": 15000},
        {"op": "value", "testID": "banners"},
        *shot("J6-05-settings", 1500),
        {"op": "press", "testID": "back"},
        {"op": "sleep", "ms": 1500},
        {"op": "press", "testID": "close-chats"},
        {"op": "waitFor", "testID": "composer-input", "timeoutMs": 10000},
        *shot("J6-06-back", 2000),
        *attach(CAFE, "pending-images", settle=3000),
        *photo_turn("J6-07-photo-again"),
        {"op": "value", "testID": "model-chip"},
        {"op": "value", "testID": "banners"},
    ])

    write("j7-settings-stop", "J7: Settings opens, the vault opens, a long answer stopped mid-way leaves the text so far and Continue; the next question is answered; Chats and back.", [
        {"op": "deeplink", "url": "/settings"},
        {"op": "waitFor", "testID": "row-wipe", "timeoutMs": 15000},
        *shot("J7-01-settings", 1500),
        {"op": "deeplink", "url": "/vault"},
        {"op": "waitFor", "testID": "best-for", "timeoutMs": 30000},
        {"op": "value", "testID": "best-for-use"},
        *shot("J7-02-vault", 3000),
        *new_chat(),
        {"op": "type", "testID": "composer-input", "text": STORY},
        {"op": "send"},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 120000},
        {"op": "sleep", "ms": 4000},
        {"op": "press", "testID": "stop"},
        {"op": "sleep", "ms": 2000},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 10000},
        {"op": "value", "testID": "assistant-text"},
        *shot("J7-03-stopped", 0),
        *turn("J7-04-after-stop", "What is the capital of France?", [{"op": "assertText", "text": "Paris", "testID": "assistant-text"}]),
        *turn("J7-05-why", "Why is it the capital?"),
        *leave_return("J7-06"),
    ])

    write("j9-explore", "J9 exploratory, a new user's wander: small talk, a general question, the paperclip and its sheet, a 3-page file and a question, thanks, the starter chips, the model sheet and the vault, Chats, Documents, Settings and the paywall, an old chat from the list.", [
        *new_chat(),
        *shot("J9-01-new-chat"),
        *turn("J9-02-hey", "hey, how are you?"),
        *turn("J9-03-coffee", "Is coffee bad for you?"),
        {"op": "press", "testID": "attach"},
        *shot("J9-04-attach-sheet", 1500),
        {"op": "press", "testID": "attach-sheet-close"},
        *attach(TURBINE),
        *shot("J9-05-file-attached", 500),
        *turn("J9-06-serial", "What is the serial number of the turbine?"),
        *turn("J9-07-who", "Who wrote this report?"),
        *turn("J9-08-thanks", "thanks!"),
        *turn("J9-09-translate", "translate it to French"),
        *new_chat(),
        {"op": "press", "testID": "suggestion-draft"},
        *shot("J9-10-chip-draft", 1500),
        {"op": "send"},
        {"op": "sleep", "ms": 2500},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 300000},
        *shot("J9-11-draft-answer"),
        {"op": "press", "testID": "model-chip"},
        *shot("J9-12-model-sheet", 1500),
        {"op": "press", "testID": "model-sheet-manage"},
        {"op": "waitFor", "testID": "best-for", "timeoutMs": 20000},
        *shot("J9-13-vault"),
        {"op": "deeplink", "url": "/chats"},
        {"op": "waitFor", "testID": "new-chat", "timeoutMs": 15000},
        *shot("J9-14-chats"),
        {"op": "press", "testID": "drawer-documents"},
        {"op": "waitFor", "testID": "documents-screen", "timeoutMs": 20000},
        *shot("J9-15-documents", 3000),
        {"op": "press", "testID": "documents-close"},
        *shot("J9-16-after-documents"),
        {"op": "deeplink", "url": "/settings"},
        {"op": "waitFor", "testID": "row-pro", "timeoutMs": 15000},
        *shot("J9-17-settings"),
        {"op": "press", "testID": "row-pro"},
        {"op": "waitFor", "testID": "close-paywall", "timeoutMs": 15000},
        *shot("J9-18-paywall"),
        {"op": "press", "testID": "close-paywall"},
        *shot("J9-19-after-paywall"),
    ])

    write("j9b-explore", "J9 exploratory, second half: Documents → the turbine report (TURBINEID) → Ask 'Who wrote this report?'; back to the constitution chat (CHATID) from the list and one more question there; a Hebrew question.", [
        *sheet_open("TURBINEID"),
        *sheet_ask("J9-20-sheet-who", "Who wrote this report?"),
        *open_chat("CHATID"),
        *shot("J9-21-old-chat", 1000),
        *turn("J9-22-impeachment", "What does it say about impeachment?"),
        *new_chat(),
        *turn("J9-23-hebrew", "מה השעה בטוקיו כשבירושלים שתיים בצהריים?"),
        *turn("J9-24-hebrew-thanks", "תודה"),
    ])


def isolate():
    write("j3c-shorter-direct", f"J3 isolation (finding 1): a new chat on Fast, '{CONSTITUTION}', '{SUMMARIZE}', then 'shorter' right after the summary (no thanks before it), then 'make it 3 bullet points'.", [
        *new_chat(),
        *switch_model("fast", "FAST"),
        *attach(CONSTITUTION, settle=10000),
        *summary_turn("J3c-01"),
        *plain("J3c-02-shorter", "shorter", ["welcome", "Welcome"]),
        *plain("J3c-03-three-bullets", "make it 3 bullet points"),
    ])


if __name__ == "__main__":
    main()
    isolate()
