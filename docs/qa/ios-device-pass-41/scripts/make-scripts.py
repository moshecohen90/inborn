#!/usr/bin/env python3
"""Writes pass 41's bridge scripts into this folder. Run from docs/qa/ios-device-pass-41/scripts.
Rounds 134I (reworks keep the summary's sources; an off-topic answer shows no chip), 134J (a memory switch during a
photo turn) and 134K (the Ask sheet shows the opener at once when no passage matched) on the phone, plus the 134A-H
regressions, on the free tier of a fresh twin. Screenshots are named jN-MM (pN-MM for the founder's file, which goes
only to the ignored private/ folder); names.json says what each one shows. DOCID / CHAT5 are filled in by the shell.
The helpers down to `write` are build 40's."""
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


def main():
    w("j1-onboard", "J1: fresh twin: Welcome, the model step, Start now with Instant, the chat on Instant; 'Hi'; Chats and back; 'What can you do?'.", lambda: [
        {"op": "waitFor", "testID": "onboarding-continue", "timeoutMs": 120000},
        *snap(sc("j1", "Welcome on a fresh install"), 1200),
        {"op": "press", "testID": "onboarding-continue"},
        {"op": "waitFor", "testID": "onboarding-model", "timeoutMs": 30000},
        {"op": "sleep", "ms": 2500},
        {"op": "value", "testID": "model-source-fast"},
        {"op": "assertText", "text": "models.inbornapp.com", "testID": "model-source-fast"},
        {"op": "screenshot", "name": sc("j1", "the model step, the source line names models.inbornapp.com")},
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
        {"op": "screenshot", "name": sc("j1", "the first chat, chip INSTANT")},
        *turn41(sc("j1", "'Hi' answered"), "Hi"),
        *back41(sc("j1", "past the goal: the Chats list"), sc("j1", "back in the chat")),
        *turn41(sc("j1", "past the goal: 'What can you do?' answered"), "What can you do?"),
    ])

    w("j2-install-fast", "J2: the vault, Install Fast from models.inbornapp.com; past the goal: a new chat (which model?), the model sheet, the vault.", lambda: [
        {"op": "deeplink", "url": "/vault"},
        {"op": "waitFor", "testID": "best-for", "timeoutMs": 30000},
        {"op": "sleep", "ms": 3000},
        {"op": "scrollTo", "testID": "install-fast"},
        {"op": "screenshot", "name": sc("j2", "the vault, Fast not installed")},
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

    w("j6a-card", f"J6: before the index model: a new chat, '{TURBINE}', a question → the 468 MB card → Cancel keeps the chat; past the goal: 'thanks', the tallest composer, Chats and back.", lambda: [
        *new_chat(),
        *attach(TURBINE, settle=8000),
        {"op": "type", "testID": "composer-input", "text": "What is the serial number of the turbine?"},
        {"op": "send"},
        {"op": "waitFor", "testID": "docs-hold", "timeoutMs": 30000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "docs-hold"},
        {"op": "assertText", "text": "468 MB", "testID": "docs-hold"},
        *snap(sc("j6", "the index card (468 MB) before the download"), 0),
        {"op": "press", "testID": "docs-hold-cancel"},
        {"op": "waitFor", "testID": "docs-hold", "gone": True, "timeoutMs": 10000},
        {"op": "waitFor", "testID": "composer-input", "timeoutMs": 5000},
        *look("attached-docs", "assistant-text"),
        *snap(sc("j6", "Cancel: the chat and its file stay"), 1500),
        *turn41(sc("j6", "past the goal: 'thanks' after Cancel"), "thanks"),
        {"op": "type", "testID": "composer-input", "text": PII},
        {"op": "waitFor", "testID": "redact-bar", "timeoutMs": 10000},
        *snap(sc("j6", "the composer at its tallest (file row + Redact row)"), 3000),
        {"op": "type", "testID": "composer-input", "text": ""},
        {"op": "sleep", "ms": 1500},
        *back41(sc("j6", "Chats"), sc("j6", "back in the chat")),
    ])

    def founder(p, mid, chip, full):
        steps = [*new_chat(), *switch_model(mid, chip), *attach(NINE, settle=20000), {"op": "screenshot", "name": sc(p, f"{chip}: the founder's file attached")}]
        steps += summary41(sc(p, f"{chip}: reading the pages"), sc(p, f"{chip}: 'Summarize it' → the summary with chips"))
        if full:
            steps += turn41(sc(p, f"{chip}: 'Thanks'"), "Thanks")
        steps += rework41(sc(p, f"{chip}: 'shorter' → a shorter summary WITH the chips"), "shorter")
        steps += rework41(sc(p, f"{chip}: 'make it 3 bullet points' → chips kept, no stray [n]"), "make it 3 bullet points")
        if full:
            steps += rework41(sc(p, f"{chip}: 'translate it to French' → chips kept"), "translate it to French")
        steps += offtopic41(sc(p, f"{chip}: '{PANCAKES}' → no chip, the none-matched line"))
        if full:
            steps += real41(sc(p, f"{chip}: '{DELETING}' → chips"), DELETING)
            steps += real41(sc(p, f"{chip}: the same question again → chips"), DELETING)
            steps += back41(sc(p, f"{chip}: Chats"), sc(p, f"{chip}: back"))
        return steps

    w("p3-founder-fast", "J3 PRIVATE (134I) on Fast: the founder's 9-page file; summary, thanks, shorter, bullets, French, pancakes, a real question twice.", lambda: founder("p3", "fast", "FAST", True))
    w("p3-founder-instant", "J3 PRIVATE (134I) on Instant in a new chat: summary, shorter, bullets, pancakes.", lambda: founder("p3i", "instant", "INSTANT", False))

    def mirror(j, mid, chip, full):
        steps = [*new_chat(), *switch_model(mid, chip), *attach(CONSTITUTION, settle=20000), {"op": "screenshot", "name": sc(j, f"{chip}: the constitution attached")}]
        steps += summary41(sc(j, f"{chip}: reading the pages"), sc(j, f"{chip}: 'Summarize it' → the summary with chips"))
        if full:
            steps += turn41(sc(j, f"{chip}: 'Thanks'"), "Thanks")
        steps += rework41(sc(j, f"{chip}: 'shorter' → a shorter summary WITH the chips"), "shorter")
        steps += rework41(sc(j, f"{chip}: 'make it 3 bullet points' → chips kept, no stray [n]"), "make it 3 bullet points")
        if full:
            steps += rework41(sc(j, f"{chip}: 'translate it to French' → chips kept"), "translate it to French")
        steps += offtopic41(sc(j, f"{chip}: '{PANCAKES}' → no chip, the none-matched line"))
        if full:
            steps += real41(sc(j, f"{chip}: '{VETO}' → chips"), VETO)
            steps += real41(sc(j, f"{chip}: the same question again → chips"), VETO)
        return steps

    w("j3-constitution-fast", "J3 public mirror (134I) on Fast with the constitution fixture: the same steps as the founder's file.", lambda: mirror("j3", "fast", "FAST", True))
    w("j3-constitution-instant", "J3 public mirror (134I) on Instant in a new chat: summary, shorter, bullets, pancakes.", lambda: mirror("j3", "instant", "INSTANT", False))

    w("p0-lists", "PRIVATE harness: Chats and Documents dumped so the shell can read the chat and document ids.", lambda: [
        {"op": "deeplink", "url": "/chats"},
        {"op": "waitFor", "testID": "new-chat", "timeoutMs": 15000},
        *snap("p0-chats"),
        {"op": "deeplink", "url": "/documents"},
        {"op": "waitFor", "testID": "documents-screen", "timeoutMs": 30000},
        *snap("p0-documents", 3000),
    ])

    w("p3b-founder-again", "J3 PRIVATE: the founder's Fast chat (HISCHAT): the real question a second time (the first run's second ask was lost to a harness race).", lambda: [
        *open_chat("HISCHAT"),
        *real41(sc("p3", "FAST: the same question again → chips"), DELETING),
    ])
    w("j3x-pancake-probe", "J3 probe: the constitution's Fast chat (CHATF): the pancake request again, so dev-run.json keeps the engine's reply and the screen shows its start.", lambda: [
        *open_chat("CHATF"),
        *turn41(sc("j3", "FAST probe: 'give me a pancake recipe' again in the constitution chat"), PANCAKES),
    ])

    w("j4-sheet-instant", "J4 (134K) on Instant: Documents → Ask on the constitution (DOCID).", lambda: j4("j4", "instant", "INSTANT"))
    w("j4-sheet-fast", "J4 (134K) on Fast: the same.", lambda: j4("j4", "fast", "FAST"))

    w("j6b-stop", f"J6: Stop mid-answer → 'Stopped · Continue'; past the goal: Continue, a second question.", lambda: [
        *new_chat(),
        {"op": "type", "testID": "composer-input", "text": STORY},
        {"op": "send"},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 120000},
        {"op": "sleep", "ms": 4000},
        {"op": "press", "testID": "stop"},
        {"op": "sleep", "ms": 2000},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 10000},
        {"op": "value", "testID": "assistant-text"},
        {"op": "assertText", "text": "Continue"},
        *snap(sc("j6", "Stop mid-answer: the text so far + 'Stopped · Continue'"), 0),
        *turn41(sc("j6", "past the goal: 'What is the capital of France?' after the stop"), "What is the capital of France?"),
        *turn41(sc("j6", "past the goal: 'thanks'"), "thanks"),
    ])

    def pics(j, mid, chip):
        return [
            *new_chat(), *switch_model(mid, chip),
            *attach(SCAN), *look("attached-docs"),
            *turn41(sc(j, f"{chip}: the scanned PDF, 'What do you see?'"), SEE, [*[{"op": "assertText", "text": x, "testID": "assistant-text", "absent": True} for x in BLIND]], pre=[
                {"op": "waitFor", "testID": "vision-hold", "timeoutMs": 8000}, {"op": "press", "testID": "vision-hold-download"},
                {"op": "idleTimer"}, {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1800000}]),
            *new_chat(), *switch_model(mid, chip),
            *photo41(sc(j, f"{chip}: the café photo sent"), sc(j, f"{chip}: the café photo answered"), CAFE),
            *turn41(sc(j, f"{chip}: past the goal: 'and the colours?'"), "and the colours?"),
        ]

    w("j6c-pictures-instant", "J6: the scanned PDF and the café photo as pictures on Instant.", lambda: pics("j6", "instant", "INSTANT"))
    w("j6d-pictures-fast", "J6: the same on Fast (its photo pack comes from the card if not in yet).", lambda: pics("j6", "fast", "FAST"))

    w("j6e-hebrew", "J6: a Hebrew question (RTL bubble) then an English one (LTR); the model sheet; the vault; Settings.", lambda: [
        *new_chat(),
        *turn41(sc("j6", "'מה בירת צרפת?' → the bubble right-aligned"), "מה בירת צרפת?", look("model-advice")),
        *turn41(sc("j6", "past the goal: 'What is the capital of Italy?' → LTR"), "What is the capital of Italy?"),
        {"op": "press", "testID": "model-chip"},
        {"op": "waitFor", "testID": "model-sheet", "timeoutMs": 10000},
        *snap(sc("j6", "the model sheet"), 1500),
        {"op": "press", "testID": "model-sheet-close"},
        {"op": "deeplink", "url": "/vault"},
        {"op": "waitFor", "testID": "best-for", "timeoutMs": 30000},
        *look("model-status-fast", "model-status-instant", "best-for-use"),
        *snap(sc("j6", "the vault"), 3000),
        {"op": "deeplink", "url": "/settings"},
        {"op": "waitFor", "testID": "row-wipe", "timeoutMs": 15000},
        *snap(sc("j6", "Settings"), 1500),
        {"op": "deeplink", "url": "/chats"},
        {"op": "sleep", "ms": 1500},
    ])

    w("j6f-scan-fast", "J6: the scanned PDF on Fast once more (in j6d the answer was still streaming when the next chat opened).", lambda: [
        *new_chat(), *switch_model("fast", "FAST"),
        *attach(SCAN), *look("attached-docs"),
        *turn41(sc("j6", "FAST: the scanned PDF, 'What do you see?' (again, answered)"), SEE, [*[{"op": "assertText", "text": x, "testID": "assistant-text", "absent": True} for x in BLIND]],
                pre=[{"op": "waitFor", "testID": "stop", "timeoutMs": 60000}]),
        *turn41(sc("j6", "FAST: past the goal: 'and the colours?'"), "and the colours?"),
    ])

    # J5: the hot phone. j5a opens the chat on Fast with a photo; the shell then alternates j5b (heat) and j5c (a new
    # photo) until the phone's own memory warnings come, reading the app log between runs; j5d checks the aftermath.
    w("j5a-photo-fast", "J5 (134J): a new chat on Fast, a photo turn with Fast's pack.", lambda: [
        *new_chat(), *switch_model("fast", "FAST"),
        *photo41(sc("j5", "Fast: the café photo sent"), sc("j5", "Fast: the café photo answered with its pack"), CAFE),
    ])
    w("j5b-heat", f"J5 (134J): the same chat: '{STORY}', then 'Give it a title.'.", lambda: [
        *look("model-chip", "vision-released", "banners"),
        *turn41("j5-heat-story", STORY, look("vision-released")),
        *turn41("j5-heat-title", "Give it a title.", look("vision-released")),
    ])
    for k, f in enumerate(PHOTOS):
        w(f"j5c-photo-{k}", f"J5 (134J): the same chat, a new photo ({f}).", lambda f=f, k=k: [
            *look("model-chip", "vision-released", "banners"),
            *photo41(f"j5-photo{k}-sent", f"j5-photo{k}-answer", f),
        ])
    w("j5d-after", "J5 (134J) after warning 2: the banner, the model sheet, the vault, back to the chat (CHAT5); the next answer retires the banner.", lambda: [
        *look("banners", "model-chip", "vision-released", "model-advice"),
        *snap("j5-after-banner"),
        {"op": "press", "testID": "model-chip"},
        {"op": "waitFor", "testID": "model-sheet", "timeoutMs": 10000},
        *snap("j5-after-sheet", 1500),
        {"op": "press", "testID": "model-sheet-close"},
        {"op": "deeplink", "url": "/vault"},
        {"op": "waitFor", "testID": "best-for", "timeoutMs": 30000},
        *look("model-status-fast", "model-status-instant"),
        *snap("j5-after-vault", 3000),
        *open_chat("CHAT5"),
        *look("banners", "model-chip"),
        *snap("j5-after-back"),
        *turn41("j5-after-next", "Thanks. What colour is the wall in the first picture?", look("vision-released", "model-advice")),
        *turn41("j5-after-next2", "and the sky?", look("vision-released", "model-advice")),
    ])

    w("j5e-after-warning", "J5 (134J) after the one real memory warning (04:26:44, during J7a, projector released, Fast kept): back in the J5 chat (CHAT5): the quiet line?; a NEW photo on Fast (pack attached again?); past the goal: a question about it.", lambda: [
        *open_chat("CHAT5"),
        *look("vision-released", "banners"),
        *snap(sc("j5", "back in the J5 chat after warning 1: chip, quiet line or not")),
        *switch_model("fast", "FAST"),
        *photo41(sc("j5", "a new photo sent on Fast after warning 1"), sc("j5", "the new photo read on Fast (pack attached again)"), "polka-mug.jpg", "What is on this mug?"),
        *turn41(sc("j5", "past the goal: 'what colour is the table?'"), "what colour is the table?", look("vision-released")),
    ])

    # J7: exploratory, a new user's wander with the build 40 probes folded in.
    w("j7a-explore", "J7 exploratory (1): a new chat; small talk; general questions that might echo system lines (weather, news, a recipe, advice); the Draft chip; the model sheet.", lambda: [
        *new_chat(),
        *snap(sc("j7", "a new chat: which model, the starter chips")),
        *turn41(sc("j7", "'hey! what is this app?'"), "hey! what is this app?"),
        *turn41(sc("j7", "'what's the weather like today?' (probe a: echoed system lines)"), "what's the weather like today?"),
        *turn41(sc("j7", "'give me a pancake recipe' with no file (probe a)"), PANCAKES),
        *turn41(sc("j7", "'thanks, and how long do they keep in the fridge?'"), "thanks, and how long do they keep in the fridge?"),
        *turn41(sc("j7", "'who won the last football World Cup?' (probe a / invented facts)"), "who won the last football World Cup?"),
        *turn41(sc("j7", "'my 4 year old won't sleep, any tips?'"), "my 4 year old won't sleep, any tips?"),
        *new_chat(),
        {"op": "press", "testID": "suggestion-draft"},
        *snap(sc("j7", "the 'Draft a message' chip fills the composer (probe d)"), 1500),
        {"op": "send"},
        {"op": "sleep", "ms": 2500},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 300000},
        *snap(sc("j7", "the Draft chip's answer")),
        {"op": "press", "testID": "model-chip"},
        {"op": "waitFor", "testID": "model-sheet", "timeoutMs": 10000},
        *snap(sc("j7", "the model sheet from the chip"), 1500),
        {"op": "press", "testID": "model-sheet-manage"},
        {"op": "waitFor", "testID": "best-for", "timeoutMs": 20000},
        *snap(sc("j7", "Manage → the vault")),
    ])
    w("j7b-explore", "J7 exploratory (2): Chats (the footer, probe d), Documents from Chats (probe c), Documents, Settings and the paywall; a file question with chips (duplicate chips, probe d); Hebrew small talk.", lambda: [
        *new_chat(),
        {"op": "press", "testID": "open-chats"},
        {"op": "waitFor", "testID": "close-chats", "timeoutMs": 10000},
        *snap(sc("j7", "the Chats list from the chat (footer)")),
        {"op": "waitFor", "testID": "drawer-documents", "timeoutMs": 3000},
        {"op": "press", "testID": "drawer-documents"},
        {"op": "waitFor", "testID": "documents-screen", "timeoutMs": 10000},
        *snap(sc("j7", "Documents from Chats? (probe c)"), 2000),
        {"op": "deeplink", "url": "/settings"},
        {"op": "waitFor", "testID": "row-pro", "timeoutMs": 15000},
        *snap(sc("j7", "Settings")),
        {"op": "press", "testID": "row-pro"},
        {"op": "waitFor", "testID": "close-paywall", "timeoutMs": 15000},
        *snap(sc("j7", "the paywall")),
        {"op": "press", "testID": "close-paywall"},
        *snap(sc("j7", "after closing the paywall")),
        *new_chat(),
        *attach(TURBINE),
        *turn41(sc("j7", "the turbine report: 'What is the serial number of the turbine?'"), "What is the serial number of the turbine?"),
        *turn41(sc("j7", "'when was it inspected and by whom?' (invented facts?)"), "when was it inspected and by whom?"),
        *turn41(sc("j7", "'ok great'"), "ok great"),
        *turn41(sc("j7", "'make it a short email to my boss'"), "make it a short email to my boss"),
        *turn41(sc("j7", "Hebrew small talk 'מה שלומך?'"), "מה שלומך?"),
    ])

    w("j7c-explore", "J7 exploratory (3): the Summarize and Translate chips, a second answer in a fresh chat, the ledger, Personas and Memory from Chats, an incognito chat, Instant again, a long question.", lambda: [
        *new_chat(),
        {"op": "press", "testID": "suggestion-summarize"},
        *snap(sc("j7", "the 'Summarize text' chip fills the composer"), 1500),
        {"op": "type", "testID": "composer-input", "text": "Summarize this: The meeting moved from Tuesday to Thursday at 3pm because the client is travelling. Bring the Q3 numbers and the new logo drafts."},
        *turn41(sc("j7", "a summary of a pasted note"), "Summarize this: The meeting moved from Tuesday to Thursday at 3pm because the client is travelling. Bring the Q3 numbers and the new logo drafts."),
        *turn41(sc("j7", "'translate that to Spanish'"), "translate that to Spanish"),
        *ledger(sc("j7", "the ledger opened")),
        {"op": "press", "testID": "open-chats"},
        {"op": "waitFor", "testID": "close-chats", "timeoutMs": 10000},
        {"op": "press", "testID": "open-personas"},
        *snap(sc("j7", "Personas from the Chats footer"), 1500),
        {"op": "deeplink", "url": "/chats"},
        {"op": "sleep", "ms": 1500},
        {"op": "press", "testID": "new-incognito"},
        {"op": "waitFor", "testID": "start-chat", "timeoutMs": 10000},
        *snap(sc("j7", "the incognito sheet"), 1000),
        {"op": "press", "testID": "start-chat"},
        {"op": "waitFor", "testID": "composer-input", "timeoutMs": 30000},
        *switch_model("instant", "INSTANT"),
        *turn41(sc("j7", "incognito on Instant: 'what's a good name for a golden retriever puppy?'"), "what's a good name for a golden retriever puppy?"),
        *turn41(sc("j7", "a long question on Instant"), "I'm planning a 3 day trip to Rome with two kids aged 6 and 9 in November, we like museums but they get bored fast, we don't want to spend more than 300 euro on tickets in total, what should each day look like?"),
        *turn41(sc("j7", "'thank you!'"), "thank you!"),
        *switch_model("fast", "FAST"),
        *snap(sc("j7", "back on Fast")),
    ])

    with open("names.json", "w") as f:
        json.dump(NAMES, f, indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
