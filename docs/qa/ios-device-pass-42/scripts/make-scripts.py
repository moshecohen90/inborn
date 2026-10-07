#!/usr/bin/env python3
"""Writes pass 42's bridge scripts into this folder. Run from docs/qa/ios-device-pass-42/scripts.
Build 42 is the App Store release walk: rounds 134L (one common word is not lexical evidence), 134M/134M2 (the app is
Inborn and never reads its rules back) and 134I2 (reworded words count for the source share) on the phone, plus the
134I/134J/134K regressions and the store-readiness rows, on the free tier of a fresh twin. Screenshots are named jX-MM
(pc-MM for the founder's file, written only to the ignored private/ folder); names.json says what each one shows.
DOCID / CHATF / CHATI / CHATE are filled in by the shell. The helpers down to `w` are build 41's."""
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


TREASON = "What does it say about treason?"
LEAK = ["If you do not know", "say only the opening", "stop after that sentence", "Start with", "were searched", "never say what", "Never say what"]
NO_MATCH = ["Who wrote this report?", "What does it say about the moon?", "What does it say about chocolate cake?", "Who won the 2018 World Cup?"]
REWORKS = [("shorter", "shorter"), ("more", "more"), ("bullets", "make it 3 bullet points"), ("french", "translate it to French")]


def rework(name, text):
    """134G: after a thanks, a follow-up or a rework is applied to the summary: no card, no search, no thanks reply."""
    return plain(name, text, ["welcome", "Welcome", "You're"])


def g_tail(prefix, n0):
    """Thanks, then the four reworks (134G), numbered from n0."""
    steps = [*plain(f"{prefix}-{n0:02d}-thanks", "Thanks")]
    for i, (slug, text) in enumerate(REWORKS):
        steps += rework(f"{prefix}-{n0 + 1 + i:02d}-{slug}", text)
    return steps


def sheet_nomatch(name, text):
    """134H: a question the file does not answer: the opener only, never the instruction text."""
    return sheet_ask(name, text, [
        *[{"op": "assertText", "text": w, "testID": "ask-answer", "absent": True} for w in LEAK],
    ])


def sheet_round(prefix, did, veto):
    steps = [*sheet_open(did), *shot(f"{prefix}-0-sheet", 500)]
    for i, q in enumerate(NO_MATCH):
        steps += sheet_nomatch(f"{prefix}-{i + 1}-nomatch", q)
    steps += sheet_plain(f"{prefix}-5-thank-you", "thank you", "Ask another question about these documents")
    steps += sheet_plain(f"{prefix}-6-and-now", "And now", "This sheet answers one question at a time")
    if veto:
        steps += sheet_ask(f"{prefix}-7-veto", VETO, [
            {"op": "waitFor", "testID": "ask-none-matched", "gone": True, "timeoutMs": 1000},
            {"op": "waitFor", "testID": "ask-not-found", "gone": True, "timeoutMs": 1000},
            *[{"op": "assertText", "text": w, "testID": "ask-answer", "absent": True} for w in LEAK],
        ])
    steps += [{"op": "deeplink", "url": "/chats"}, {"op": "sleep", "ms": 1500}]
    return steps



# ---- pass 41 ----------------------------------------------------------------------------------------------------
# Every screenshot is named jN-MM (pN-MM for the founder's file, written to private/). NAMES records what each one
# shows; journeys.md is assembled from it after the runs.
NAMES = []
COUNT = {}
SCRIPT = [""]


def sc(j, desc):
    COUNT[j] = COUNT.get(j, 0) + 1
    name = f"{j}-{COUNT[j]:02d}"
    NAMES.append({"script": SCRIPT[0], "name": name, "desc": desc})
    return name


PANCAKES = "give me a pancake recipe"
NEWS_LINE = ["I cannot know the current weather", "do not have access to browse", "safe for family consumption"]
WORLD_CUP = "Who won the 1998 World Cup?"
NO_MATCH_41 = [WORLD_CUP, "What does it say about the moon?", "Who wrote this report?"]
PHOTOS = ["dogs-park.jpg", "polka-mug.jpg", "street-sign.jpg", "receipt.jpg", "nutrition-label.jpg", CAFE]


def snap(name, wait=2000):
    return [{"op": "sleep", "ms": wait}, {"op": "screenshot", "name": name}, {"op": "dump", "name": name}]


def look(*ids):
    return [{"op": "value", "testID": i} for i in ids]


def turn41(name, text, extra=(), pre=()):
    return [
        {"op": "type", "testID": "composer-input", "text": text},
        {"op": "send"},
        {"op": "sleep", "ms": 2500},
        *pre,
        {"op": "waitFor", "testID": "reading-pages", "gone": True, "timeoutMs": 900000},
        {"op": "waitFor", "testID": "reading-docs", "gone": True, "timeoutMs": 900000},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 900000},
        {"op": "sleep", "ms": 2500},
        *look("assistant-text", "citations", "none-matched", "banners", "model-chip"),
        *extra,
        {"op": "screenshot", "name": name},
        {"op": "dump", "name": name},
    ]


def maybe_index_card():
    """The first search without the index model holds the turn on the 468 MB card: Download it. With the model in,
    the card never shows and these two steps fail harmlessly."""
    return [
        {"op": "waitFor", "testID": "docs-hold", "timeoutMs": 15000},
        {"op": "value", "testID": "docs-hold"},
        {"op": "press", "testID": "docs-hold-download"},
        {"op": "idleTimer"},
        {"op": "waitFor", "testID": "docs-hold", "gone": True, "timeoutMs": 1800000},
        {"op": "waitFor", "testID": "reading-docs", "gone": True, "timeoutMs": 900000},
        # The held turn re-embeds the files before it answers: wait for the answer to start (pass 41, p3 race).
        {"op": "waitFor", "testID": "stop", "timeoutMs": 90000},
    ]


def rework41(name, text):
    """134I: the rework keeps the summary's chips, is never replaced by the no-file opener, has no thanks reply."""
    return turn41(name, text, [
        {"op": "waitFor", "testID": "docs-hold", "gone": True, "timeoutMs": 1000},
        {"op": "waitFor", "testID": "none-matched", "gone": True, "timeoutMs": 1000},
        {"op": "assertText", "text": DONT_MENTION, "testID": "assistant-text", "absent": True},
        {"op": "assertText", "text": "You're welcome", "testID": "assistant-text", "absent": True},
        {"op": "waitFor", "testID": "citations", "timeoutMs": 1000},
    ])


def offtopic41(name, text=PANCAKES):
    """134I: an answer that used no passage: no chip of its own, the none-matched line."""
    return turn41(name, text, [
        {"op": "waitFor", "testID": "none-matched", "timeoutMs": 3000},
        *[{"op": "assertText", "text": w, "testID": "assistant-text", "absent": True} for w in NEWS_LINE],
    ], pre=maybe_index_card())


def real41(name, text):
    return turn41(name, text, [
        {"op": "waitFor", "testID": "none-matched", "gone": True, "timeoutMs": 1000},
        {"op": "assertText", "text": DONT_MENTION, "testID": "assistant-text", "absent": True},
        {"op": "waitFor", "testID": "citations", "timeoutMs": 1000},
    ], pre=maybe_index_card())


def summary41(n_read, n_sum, pages=9):
    return [
        {"op": "type", "testID": "composer-input", "text": SUMMARIZE},
        {"op": "send"},
        {"op": "waitFor", "testID": "reading-pages", "timeoutMs": 120000},
        {"op": "value", "testID": "reading-pages"},
        {"op": "screenshot", "name": n_read},
        {"op": "waitFor", "testID": "reading-pages", "gone": True, "timeoutMs": 900000},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 240000},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 600000},
        {"op": "sleep", "ms": 2500},
        *look("assistant-text", "citations", "attached-docs"),
        {"op": "assertText", "text": f"Summary of all {pages} pages.", "testID": "assistant-text"},
        {"op": "screenshot", "name": n_sum},
        {"op": "dump", "name": n_sum},
    ]


def back41(n_chats, n_back):
    return [
        {"op": "press", "testID": "open-chats"},
        {"op": "waitFor", "testID": "close-chats", "timeoutMs": 10000},
        *snap(n_chats, 1500),
        {"op": "press", "testID": "close-chats"},
        {"op": "waitFor", "testID": "composer-input", "timeoutMs": 10000},
        *snap(n_back, 2500),
    ]


def photo41(n_bubble, n_answer, file, question=SEE):
    return [
        *attach(file, "pending-images", settle=3000),
        *look("vision-released", "banners", "model-chip"),
        {"op": "type", "testID": "composer-input", "text": question},
        {"op": "send"},
        {"op": "sleep", "ms": 2000},
        {"op": "screenshot", "name": n_bubble},
        {"op": "waitFor", "testID": "vision-hold", "timeoutMs": 8000},
        {"op": "value", "testID": "vision-hold"},
        {"op": "press", "testID": "vision-hold-download"},
        {"op": "idleTimer"},
        {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1800000},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 240000},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 600000},
        {"op": "sleep", "ms": 3000},
        *look("assistant-text", "user-images", "vision-released", "banners", "model-chip", "model-advice", "model-advice-reason"),
        *[{"op": "assertText", "text": w, "testID": "assistant-text", "absent": True} for w in BLIND + [DONT_MENTION, NEEDS_OCR]],
        {"op": "screenshot", "name": n_answer},
        {"op": "dump", "name": n_answer},
    ]


def sheet_nomatch41(name, text):
    """134K: no passage kept → the opener at once, `0 passages`, no model call (no tok/s), no ask-answer node."""
    return [
        {"op": "type", "testID": "ask-input", "text": text},
        {"op": "press", "testID": "ask-send"},
        {"op": "sleep", "ms": 1500},
        {"op": "waitFor", "testID": "ask-not-found", "timeoutMs": 120000},
        {"op": "sleep", "ms": 1500},
        *look("ask-not-found", "ask-stats", "ask-answer", "citations"),
        {"op": "assertText", "text": DONT_MENTION, "testID": "ask-not-found"},
        {"op": "assertText", "text": "0 passages", "testID": "ask-stats"},
        {"op": "assertText", "text": "tok/s", "testID": "ask-stats", "absent": True},
        {"op": "waitFor", "testID": "ask-answer", "gone": True, "timeoutMs": 1000},
        {"op": "waitFor", "testID": "ask-none-matched", "gone": True, "timeoutMs": 1000},
        {"op": "screenshot", "name": name},
        {"op": "dump", "name": name},
    ]


def sheet_real41(name, text):
    return [
        {"op": "type", "testID": "ask-input", "text": text},
        {"op": "press", "testID": "ask-send"},
        {"op": "sleep", "ms": 2500},
        {"op": "waitFor", "testID": "ask-stop", "gone": True, "timeoutMs": 900000},
        {"op": "sleep", "ms": 2000},
        *look("ask-answer", "ask-stats", "citations", "ask-not-found"),
        {"op": "waitFor", "testID": "ask-not-found", "gone": True, "timeoutMs": 1000},
        {"op": "waitFor", "testID": "citations", "timeoutMs": 1000},
        {"op": "screenshot", "name": name},
        {"op": "dump", "name": name},
    ]


def sheet_plain41(name, text, line):
    return [
        {"op": "type", "testID": "ask-input", "text": text},
        {"op": "press", "testID": "ask-send"},
        {"op": "sleep", "ms": 2500},
        {"op": "waitFor", "testID": "ask-stop", "gone": True, "timeoutMs": 300000},
        {"op": "sleep", "ms": 1500},
        *look("ask-plain", "ask-not-found", "ask-answer", "ask-stats"),
        {"op": "assertText", "text": line, "testID": "ask-plain"},
        {"op": "screenshot", "name": name},
        {"op": "dump", "name": name},
    ]


def j4(j, mid, chip):
    steps = [*new_chat(), *switch_model(mid, chip), {"op": "setTier", "tier": "pro"}, *sheet_open("DOCID"), *snap(sc(j, f"{chip}: the Ask sheet on the constitution (Pro, so the stats line shows)"), 500)]
    for q in NO_MATCH_41:
        steps += sheet_nomatch41(sc(j, f"{chip}: '{q}' → the opener only, `0 passages`, no tok/s"), q)
    steps += sheet_real41(sc(j, f"{chip}: '{VETO}' → an answer with chips"), VETO)
    steps += [{"op": "press", "testID": "ask-strict"}, {"op": "sleep", "ms": 1500}, {"op": "value", "testID": "ask-strict"}]
    steps += sheet_nomatch41(sc(j, f"{chip}: strict on, '{WORLD_CUP}' → the same opener"), WORLD_CUP)
    steps += [{"op": "press", "testID": "ask-strict"}, {"op": "sleep", "ms": 1500}, {"op": "value", "testID": "ask-strict"}]
    steps += sheet_plain41(sc(j, f"{chip}: strict off again, 'thank you' → the plain line"), "thank you", "Ask another question about these documents")
    steps += sheet_plain41(sc(j, f"{chip}: 'And now' → the plain line"), "And now", "This sheet answers one question at a time")
    steps += [{"op": "deeplink", "url": "/chats"}, {"op": "sleep", "ms": 1500}, {"op": "setTier", "tier": "free"}]
    return steps


def w(name, note, build):
    SCRIPT[0] = name
    write(name, note, build())


# ---- pass 42 ----------------------------------------------------------------------------------------------------
IDENTITY_BANNED = ["Qwen", "Tongyi", "Alibaba", "family-safe", "family-friendly", "within my guidelines", "within my safety guidelines",
                   "admit doubt", "admitting", "Rules, never described", "never described", "nothing hateful", "crisis line"]
OFFLINE_INVENTED = ["°", "degrees", "Argentina", "France won", "Spain won", "sunny", "rain"]
IDENTITY_QS = [("app", "hey! what is this app?"), ("yourself", "tell me about yourself"), ("maker", "who made you?"), ("model", "what model are you?")]
WAFFLES = "and a waffle recipe"


def ident_chat(j, chip, slug, q, follow=None):
    steps = [*new_chat(), *turn41(sc(j, f"{chip}: '{q}' → says Inborn, no base-model name, no rule read back"), q, [
        {"op": "assertText", "text": "Inborn", "testID": "assistant-text"},
        *[{"op": "assertText", "text": x, "testID": "assistant-text", "absent": True} for x in IDENTITY_BANNED],
    ])]
    if follow:
        steps += turn41(sc(j, f"{chip}: past the goal: '{follow}'"), follow)
    return steps


def plain_chat(j, chip, q, desc, extra=(), follow=None):
    steps = [*new_chat(), *turn41(sc(j, f"{chip}: '{q}' → {desc}"), q, [
        *[{"op": "assertText", "text": x, "testID": "assistant-text", "absent": True} for x in IDENTITY_BANNED],
        *extra,
    ])]
    if follow:
        steps += turn41(sc(j, f"{chip}: past the goal: '{follow}'"), follow)
    return steps


def m_round(j, mid, chip):
    steps = [*new_chat(), *switch_model(mid, chip)]
    follows = {"app": "does anything I type leave my phone?", "maker": "thanks!"}
    for slug, q in IDENTITY_QS:
        steps += ident_chat(j, chip, slug, q, follows.get(slug))
    steps += [*new_chat(), {"op": "press", "testID": "suggestion-draft"}, *snap(sc(j, f"{chip}: the 'Draft a message' chip fills the composer"), 1500),
              {"op": "send"}, {"op": "sleep", "ms": 2500}, {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 300000}, {"op": "sleep", "ms": 2500},
              *look("assistant-text", "model-chip"),
              *[{"op": "assertText", "text": x, "testID": "assistant-text", "absent": True} for x in IDENTITY_BANNED],
              *snap(sc(j, f"{chip}: the Draft chip's answer → no rule sentences"), 0)]
    steps += plain_chat(j, chip, "who won the World Cup?", "says it is offline, invents no result")
    steps += plain_chat(j, chip, "what's the weather tomorrow?", "says it is offline, invents no forecast")
    steps += plain_chat(j, chip, "tips to sleep better", "tips; a doctor/988 line, if written, stays")
    steps += plain_chat(j, chip, "what's the capital of France?", "one clean answer", [{"op": "assertText", "text": "Paris", "testID": "assistant-text"}], "and of Italy?")
    return steps


def l_round(j, mid, chip, full):
    """134L: the constitution in the chat; an off-topic request gets a recipe, no chip, no 'don't mention'."""
    steps = [*new_chat(), *switch_model(mid, chip), *attach(CONSTITUTION, settle=20000), {"op": "screenshot", "name": sc(j, f"{chip}: the constitution attached")}]
    steps += summary41(sc(j, f"{chip}: reading the pages"), sc(j, f"{chip}: 'Summarize it' → the summary with chips"))
    steps += turn41(sc(j, f"{chip}: '{PANCAKES}' → a recipe, no SOURCES chip, no 'Your documents don't mention this'"), PANCAKES, [
        {"op": "waitFor", "testID": "citations", "gone": True, "timeoutMs": 1000},
        {"op": "assertText", "text": DONT_MENTION, "testID": "assistant-text", "absent": True},
        {"op": "assertText", "text": "flour", "testID": "assistant-text"},
    ], pre=maybe_index_card())
    steps += turn41(sc(j, f"{chip}: past the goal: 'thanks'"), "thanks")
    steps += turn41(sc(j, f"{chip}: past the goal: '{WAFFLES}' → a recipe, no chip"), WAFFLES, [
        {"op": "assertText", "text": DONT_MENTION, "testID": "assistant-text", "absent": True},
    ])
    if full:
        steps += real41(sc(j, f"{chip}: past the goal: '{VETO}' → chips"), VETO)
    return steps


def main():
    w("j1-onboard", "J1: fresh twin: Welcome, the model step, Start now with Instant, the chat on Instant; 'Hi'; Chats and back; 'What can you do?'.", lambda: [
        {"op": "waitFor", "testID": "onboarding-continue", "timeoutMs": 120000},
        *snap(sc("j1", "Welcome on a fresh install (English)"), 1200),
        {"op": "press", "testID": "onboarding-continue"},
        {"op": "waitFor", "testID": "onboarding-model", "timeoutMs": 30000},
        {"op": "sleep", "ms": 2500},
        {"op": "value", "testID": "model-source-fast"},
        {"op": "assertText", "text": "models.inbornapp.com", "testID": "model-source-fast"},
        {"op": "screenshot", "name": sc("j1", "the model step, the source line names models.inbornapp.com")},
        {"op": "press", "testID": "start-now-with"},
        {"op": "waitFor", "testID": "sealed-start", "timeoutMs": 30000},
        {"op": "sleep", "ms": 5000},
        {"op": "screenshot", "name": sc("j1", "the sealed step")},
        {"op": "press", "testID": "sealed-start"},
        {"op": "waitFor", "testID": "lock-start", "timeoutMs": 20000},
        {"op": "screenshot", "name": sc("j1", "the lock step")},
        {"op": "press", "testID": "lock-start"},
        {"op": "waitFor", "testID": "composer-input", "timeoutMs": 60000},
        {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 180000},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "model-chip"},
        {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
        {"op": "screenshot", "name": sc("j1", "the first chat, chip INSTANT")},
        *turn41(sc("j1", "'Hi' answered"), "Hi"),
        *back41(sc("j1", "past the goal: the Chats list"), sc("j1", "back in the chat")),
        *turn41(sc("j1", "past the goal: 'What can you do?' answered"), "What can you do?"),
    ])

    w("f1-store", "F (store-readiness): Settings → About shows 1.0.0 (42); the paywall on the free tier shows the store prices (nothing bought, no sign-in); Restore/Have a code visible; close.", lambda: [
        {"op": "deeplink", "url": "/settings"},
        {"op": "waitFor", "testID": "row-about", "timeoutMs": 15000},
        *snap(sc("f1", "Settings on the fresh twin"), 1500),
        {"op": "scrollTo", "testID": "row-about"},
        {"op": "press", "testID": "row-about"},
        {"op": "waitFor", "testID": "about", "timeoutMs": 10000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "about"},
        {"op": "assertText", "text": "1.0.0 (42)", "testID": "about"},
        *snap(sc("f1", "About: 1.0.0 (42) and the commit"), 500),
        {"op": "deeplink", "url": "/settings"},
        {"op": "waitFor", "testID": "row-pro", "timeoutMs": 15000},
        {"op": "press", "testID": "row-pro"},
        {"op": "waitFor", "testID": "close-paywall", "timeoutMs": 15000},
        {"op": "sleep", "ms": 8000},
        *look("paywall-status", "owned", "price-inborn.pro", "price-inborn.pro.launch", "price-inborn.work", "price-inborn.work.upgrade", "tier-inborn.pro", "tier-inborn.pro.launch", "tier-inborn.work", "tier-inborn.work.upgrade", "web-price-note"),
        *snap(sc("f1", "the paywall: the prices as loaded"), 0),
        {"op": "scrollTo", "testID": "restore"},
        *snap(sc("f1", "the paywall lower: Restore, Have a code"), 1000),
        {"op": "press", "testID": "close-paywall"},
        *snap(sc("f1", "after closing the paywall"), 1500),
    ])

    w("j2-install-fast", "J2: the vault (Instant built in), Install Fast from models.inbornapp.com; past the goal: a new chat (which model?), the model sheet, the vault.", lambda: [
        {"op": "deeplink", "url": "/vault"},
        {"op": "waitFor", "testID": "best-for", "timeoutMs": 30000},
        {"op": "sleep", "ms": 3000},
        *look("model-status-instant", "model-status-fast"),
        {"op": "screenshot", "name": sc("j2", "the vault: Instant built in, Fast not installed")},
        {"op": "scrollTo", "testID": "install-fast"},
        {"op": "screenshot", "name": sc("j2", "the vault, Fast's Install button")},
        {"op": "press", "testID": "install-fast"},
        {"op": "sleep", "ms": 1500},
        {"op": "press", "testID": "confirm-download"},
        {"op": "sleep", "ms": 15000},
        {"op": "value", "testID": "model-status-fast"},
        {"op": "screenshot", "name": sc("j2", "Fast downloading")},
        {"op": "idleTimer"},
        {"op": "waitFor", "testID": "use-fast", "timeoutMs": 1800000},
        {"op": "value", "testID": "model-status-fast"},
        {"op": "screenshot", "name": sc("j2", "Fast installed")},
        *new_chat(),
        *snap(sc("j2", "past the goal: a new chat, which model it opens on")),
        {"op": "press", "testID": "model-chip"},
        {"op": "waitFor", "testID": "model-sheet", "timeoutMs": 10000},
        *snap(sc("j2", "the model sheet"), 1500),
        {"op": "press", "testID": "model-sheet-close"},
        {"op": "deeplink", "url": "/vault"},
        {"op": "waitFor", "testID": "best-for", "timeoutMs": 30000},
        *look("model-status-fast", "model-status-instant"),
        *snap(sc("j2", "the vault after the install"), 3000),
    ])

    w("ja-lexical-fast", "A (134L) on Fast: the constitution in a new chat; summary; pancakes (the index card on first search); thanks; waffles; past the goal: the veto question.", lambda: l_round("ja", "fast", "FAST", True))
    w("ja-lexical-instant", "A (134L) on Instant: the same in a new chat.", lambda: l_round("ja", "instant", "INSTANT", True))

    w("jb-identity-fast", "B (134M/134M2) on Fast: nine fresh chats, no file.", lambda: m_round("jb", "fast", "FAST"))
    w("jb-identity-instant", "B (134M/134M2) on Instant: the same nine.", lambda: m_round("jb", "instant", "INSTANT"))

    def founder(p, mid, chip):
        steps = [*new_chat(), *switch_model(mid, chip), *attach(NINE, settle=20000), {"op": "screenshot", "name": sc(p, f"{chip}: the founder's file attached")}]
        steps += summary41(sc(p, f"{chip}: reading the pages"), sc(p, f"{chip}: 'Summarize it' → the summary with chips"))
        steps += turn41(sc(p, f"{chip}: 'Thanks'"), "Thanks")
        steps += rework41(sc(p, f"{chip}: 'shorter' → chips kept"), "shorter")
        steps += rework41(sc(p, f"{chip}: 'make it 3 bullet points' → chips kept"), "make it 3 bullet points")
        steps += rework41(sc(p, f"{chip}: 'translate it to French' → chips kept"), "translate it to French")
        steps += turn41(sc(p, f"{chip}: '{PANCAKES}' → no chip"), PANCAKES, [{"op": "waitFor", "testID": "citations", "gone": True, "timeoutMs": 1000}])
        steps += real41(sc(p, f"{chip}: past the goal: '{DELETING}' → chips"), DELETING)
        return steps

    w("pc-founder-fast", "C PRIVATE (134I regression) on Fast: the founder's 9-page file: summary, Thanks, shorter, bullets, French, pancakes, a real question.", lambda: founder("pc", "fast", "FAST"))

    w("p0-lists", "PRIVATE harness: Chats and Documents dumped so the shell can read the chat and document ids.", lambda: [
        {"op": "deeplink", "url": "/chats"},
        {"op": "waitFor", "testID": "new-chat", "timeoutMs": 15000},
        *snap("p0-chats"),
        {"op": "deeplink", "url": "/documents"},
        {"op": "waitFor", "testID": "documents-screen", "timeoutMs": 30000},
        *snap("p0-documents", 3000),
    ])

    def jd():
        j = "jd"
        steps = [*new_chat(), *switch_model("fast", "FAST"), {"op": "setTier", "tier": "pro"}, *sheet_open("DOCID"), *snap(sc(j, "FAST: the Ask sheet on the constitution (Pro, so the stats line shows)"), 500)]
        steps += sheet_nomatch41(sc(j, "FAST: 'Who won the 1998 World Cup?' → one line at once, `0 passages`"), WORLD_CUP)
        steps += sheet_nomatch41(sc(j, "FAST: past the goal: 'What does it say about the moon?' → the same"), "What does it say about the moon?")
        steps += sheet_real41(sc(j, f"FAST: '{VETO}' → an answer with passages and chips"), VETO)
        steps += sheet_plain41(sc(j, "FAST: past the goal: 'thank you' → the plain line"), "thank you", "Ask another question about these documents")
        steps += [{"op": "deeplink", "url": "/chats"}, {"op": "sleep", "ms": 1500}, {"op": "setTier", "tier": "free"}]
        return steps

    w("jd-sheet-fast", "D (134K) on Fast: Documents → Ask on the constitution (DOCID): an unanswerable question, then an answerable one.", jd)

    w("jf-stop", "F: Stop during a long answer → 'Stopped · Continue'; past the goal: Continue, a second question.", lambda: [
        *new_chat(),
        {"op": "type", "testID": "composer-input", "text": STORY},
        {"op": "send"},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 120000},
        {"op": "sleep", "ms": 5000},
        {"op": "press", "testID": "stop"},
        {"op": "sleep", "ms": 2000},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 10000},
        {"op": "value", "testID": "assistant-text"},
        {"op": "assertText", "text": "Continue"},
        *snap(sc("jf", "Stop mid-answer: the text so far + 'Stopped · Continue'"), 0),
        {"op": "press", "testID": "continue"},
        {"op": "sleep", "ms": 2500},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 600000},
        *snap(sc("jf", "past the goal: Continue → the story goes on"), 2000),
        *turn41(sc("jf", "past the goal: 'Give it a title.'"), "Give it a title."),
    ])

    w("jf-hebrew", "F: a Hebrew question (RTL bubble) then an English one; the model sheet; the vault (Fast In use); Settings.", lambda: [
        *new_chat(),
        *turn41(sc("jf", "'מה בירת צרפת?' → the bubble right-aligned, the answer RTL"), "מה בירת צרפת?", look("model-advice")),
        *turn41(sc("jf", "past the goal: 'What is the capital of Italy?'"), "What is the capital of Italy?"),
        *turn41(sc("jf", "past the goal: 'תודה רבה'"), "תודה רבה"),
        {"op": "press", "testID": "model-chip"},
        {"op": "waitFor", "testID": "model-sheet", "timeoutMs": 10000},
        *snap(sc("jf", "the model sheet"), 1500),
        {"op": "press", "testID": "model-sheet-close"},
        {"op": "deeplink", "url": "/vault"},
        {"op": "waitFor", "testID": "best-for", "timeoutMs": 30000},
        *look("model-status-fast", "model-status-instant", "best-for-use"),
        *snap(sc("jf", "the vault: Instant built in, Fast downloaded and In use"), 3000),
        {"op": "deeplink", "url": "/chats"},
        {"op": "sleep", "ms": 1500},
    ])

    w("jf-reopen", "F (report only): open the Instant 134L chat (CHATI) and the Fast one (CHATF) from Chats; which model does each open on?", lambda: [
        *open_chat("CHATI"),
        *snap(sc("jf", "reopened the INSTANT constitution chat: which chip?")),
        *open_chat("CHATF"),
        *snap(sc("jf", "reopened the FAST constitution chat: which chip?")),
        *turn41(sc("jf", "past the goal: 'what does it say about treason?' in the reopened chat"), "What does it say about treason?"),
    ])

    # E: the hot phone, as build 41's J5. The shell alternates je-heat and je-photo-k until a memory switch or 30 min.
    w("je-photo-fast", "E (134J): a new chat on Fast, a photo turn with Fast's pack.", lambda: [
        *new_chat(), *switch_model("fast", "FAST"),
        *photo41(sc("je", "Fast: the café photo sent"), sc("je", "Fast: the café photo answered with its pack"), CAFE),
    ])
    w("je-heat", f"E (134J): the same chat: '{STORY}', then 'Give it a title.'.", lambda: [
        *look("model-chip", "vision-released", "banners"),
        *turn41("je-heat-story", STORY, look("vision-released")),
        *turn41("je-heat-title", "Give it a title.", look("vision-released")),
    ])
    for k, f in enumerate(PHOTOS):
        w(f"je-photo-{k}", f"E (134J): the same chat, a new photo ({f}).", lambda f=f, k=k: [
            *look("model-chip", "vision-released", "banners"),
            *photo41(f"je-photo{k}-sent", f"je-photo{k}-answer", f),
        ])
    w("je-after", "E (134J) after a memory event: the banner, the model sheet, the vault, back to the chat (CHATE); one more turn.", lambda: [
        *open_chat("CHATE"),
        *look("banners", "model-chip", "vision-released", "model-advice", "model-advice-reason"),
        *snap("je-after-chat"),
        {"op": "press", "testID": "model-chip"},
        {"op": "waitFor", "testID": "model-sheet", "timeoutMs": 10000},
        *snap("je-after-sheet", 1500),
        {"op": "press", "testID": "model-sheet-close"},
        {"op": "deeplink", "url": "/vault"},
        {"op": "waitFor", "testID": "best-for", "timeoutMs": 30000},
        *look("model-status-fast", "model-status-instant"),
        *snap("je-after-vault", 3000),
        *open_chat("CHATE"),
        *turn41("je-after-next", "Thanks. What colour is the table in the first picture?", look("vision-released", "model-advice")),
    ])

    # G: exploratory, a first-time user.
    w("jg-explore-1", "G exploratory (1): what a new user types: small talk, a plan, an email, a translation, a joke, a recipe follow-up.", lambda: [
        *new_chat(),
        *snap(sc("jg", "a new chat: which model, the starter chips")),
        *turn41(sc("jg", "'hi, is this like chatgpt?'"), "hi, is this like chatgpt?"),
        *turn41(sc("jg", "'can you read my emails?'"), "can you read my emails?"),
        *turn41(sc("jg", "'write a short email to my landlord that the heater is broken'"), "write a short email to my landlord that the heater is broken"),
        *turn41(sc("jg", "'make it more polite'"), "make it more polite"),
        *turn41(sc("jg", "'translate it to Spanish'"), "translate it to Spanish"),
        *new_chat(),
        *turn41(sc("jg", "'tell me a joke'"), "tell me a joke"),
        *turn41(sc("jg", "'another one'"), "another one"),
        *turn41(sc("jg", "'what's 15% tip on $86?'"), "what's 15% tip on $86?"),
        *turn41(sc("jg", "'what day is it today?'"), "what day is it today?"),
    ])
    w("jg-explore-2", "G exploratory (2): the turbine report as a new user's file; the Summarize chip; Chats, Documents, Settings, Privacy.", lambda: [
        *new_chat(),
        *attach(TURBINE),
        *turn41(sc("jg", "the turbine report: 'what is this?'"), "what is this?"),
        *turn41(sc("jg", "'is anything wrong with it?'"), "is anything wrong with it?"),
        *turn41(sc("jg", "'ok thanks'"), "ok thanks"),
        *new_chat(),
        {"op": "press", "testID": "suggestion-summarize"},
        *snap(sc("jg", "the 'Summarize text' chip fills the composer"), 1500),
        {"op": "press", "testID": "open-chats"},
        {"op": "waitFor", "testID": "close-chats", "timeoutMs": 10000},
        *snap(sc("jg", "the Chats list (footer)")),
        {"op": "press", "testID": "close-chats"},
        {"op": "deeplink", "url": "/settings"},
        {"op": "waitFor", "testID": "row-about", "timeoutMs": 15000},
        {"op": "scrollTo", "testID": "row-about"},
        *snap(sc("jg", "Settings, lower")),
        {"op": "press", "testID": "row-about"},
        {"op": "waitFor", "testID": "row-privacy", "timeoutMs": 10000},
        {"op": "press", "testID": "row-privacy"},
        *snap(sc("jg", "the privacy policy from About"), 2500),
        {"op": "deeplink", "url": "/chats"},
        {"op": "sleep", "ms": 1500},
    ])

    with open("names.json", "w") as f:
        json.dump(NAMES, f, indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
