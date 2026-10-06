#!/usr/bin/env python3
"""Pass 38 addendum: every journey continues 2-3 natural steps past its goal (X1-X6), each with a screenshot. Run from
docs/qa/ios-device-pass-38/scripts. The founder's file has its own private script (xp2); its output goes to private/."""
import json

CONSTITUTION = "constitution-9pages.pdf"
NINE = "קובץ.pdf"
SCAN = "sign-scan.pdf"
CAFE = "בית קפה הגינה תפריט.jpg"
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


def switch_model(mid):
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
    ]


def attach(name, kind="attached-docs", settle=10000):
    return [
        {"op": "devPrompt", "lines": [f"attach: {name}"]},
        {"op": "waitFor", "testID": kind, "timeoutMs": 60000},
        {"op": "sleep", "ms": settle},
    ]


def turn(shot, text):
    """Send and wait for whatever comes: a reading line, a card (then `stop` never shows) or an answer."""
    return [
        {"op": "type", "testID": "composer-input", "text": text},
        {"op": "send"},
        {"op": "sleep", "ms": 2500},
        {"op": "waitFor", "testID": "reading-pages", "gone": True, "timeoutMs": 900000},
        {"op": "waitFor", "testID": "reading-docs", "gone": True, "timeoutMs": 900000},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 900000},
        {"op": "sleep", "ms": 2500},
        {"op": "screenshot", "name": shot},
        {"op": "dump", "name": shot},
    ]


def end_check(shot):
    """The composer at its tallest (file row + Redact row): is the end of the last answer still in view?"""
    return [
        {"op": "type", "testID": "composer-input", "text": PII},
        {"op": "sleep", "ms": 3000},
        {"op": "screenshot", "name": f"{shot}-tallest"},
        {"op": "dump", "name": f"{shot}-tallest"},
        {"op": "type", "testID": "composer-input", "text": ""},
        {"op": "sleep", "ms": 1500},
    ]


def leave_return(shot):
    """Chats list and back with its close button, as a person would."""
    return [
        {"op": "press", "testID": "open-chats"},
        {"op": "waitFor", "testID": "close-chats", "timeoutMs": 10000},
        {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": f"{shot}-chats"},
        {"op": "press", "testID": "close-chats"},
        {"op": "waitFor", "testID": "composer-input", "timeoutMs": 10000},
        {"op": "sleep", "ms": 2500},
        {"op": "screenshot", "name": f"{shot}-back"},
        {"op": "dump", "name": f"{shot}-back"},
    ]


def settings_mid(shot):
    """Chats → Settings → Back, then back to the chat."""
    return [
        {"op": "press", "testID": "open-chats"},
        {"op": "waitFor", "testID": "drawer-settings", "timeoutMs": 10000},
        {"op": "press", "testID": "drawer-settings"},
        {"op": "waitFor", "testID": "row-wipe", "timeoutMs": 15000},
        {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": f"{shot}-settings"},
        {"op": "press", "testID": "back"},
        {"op": "sleep", "ms": 2500},
        {"op": "screenshot", "name": f"{shot}-after-back"},
        {"op": "dump", "name": f"{shot}-after-back"},
        {"op": "press", "testID": "close-chats"},
        {"op": "waitFor", "testID": "composer-input", "timeoutMs": 10000},
        {"op": "sleep", "ms": 2500},
        {"op": "screenshot", "name": f"{shot}-chat"},
    ]


def write(name, note, steps):
    with open(f"{name}.json", "w") as f:
        json.dump({"_": note, "steps": steps}, f, indent=1, ensure_ascii=False)
        f.write("\n")


def summary(shot, name, fast=False):
    return [*new_chat(), *(switch_model("fast") if fast else []), *attach(name, settle=20000), *turn(f"{shot}-summary", "Summarize it")]


def main():
    write("x1-onboard-plus", "X1: J1's onboarding, then past the goal: small talk, the Chats list and back, Settings mid-chat, one more message.", [
        {"op": "waitFor", "testID": "onboarding-continue", "timeoutMs": 120000},
        {"op": "sleep", "ms": 1200},
        {"op": "press", "testID": "onboarding-continue"},
        {"op": "waitFor", "testID": "onboarding-model", "timeoutMs": 30000},
        {"op": "sleep", "ms": 2500},
        {"op": "press", "testID": "start-now-with"},
        {"op": "waitFor", "testID": "sealed-start", "timeoutMs": 30000},
        {"op": "sleep", "ms": 5000},
        {"op": "press", "testID": "sealed-start"},
        {"op": "waitFor", "testID": "lock-start", "timeoutMs": 20000},
        {"op": "press", "testID": "lock-start"},
        {"op": "waitFor", "testID": "composer-input", "timeoutMs": 60000},
        {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 180000},
        {"op": "sleep", "ms": 2000},
        {"op": "screenshot", "name": "X1-00-chat"},
        *turn("X1-01-hi", "Hi"),
        *leave_return("X1-02"),
        *settings_mid("X1-03"),
        *turn("X1-04-what-can-you-do", "What can you do?"),
    ])

    for prefix, name, priv in (("X2", CONSTITUTION, False), ("XP2", NINE, True)):
        write(f"{prefix.lower()}-summary-plus", f"{'PRIVATE: ' if priv else ''}X2: J2's summary on Fast, then 'And now', 'thank you', 'more', the composer at its tallest, the Chats list and back, one more message.", [
            *summary(prefix, name, fast=priv),
            *turn(f"{prefix}-01-and-now", "And now"),
            *turn(f"{prefix}-02-thank-you", "thank you"),
            *turn(f"{prefix}-03-more", "more"),
            *end_check(f"{prefix}-04"),
            *leave_return(f"{prefix}-05"),
            *turn(f"{prefix}-06-one-more", "Who wrote it?" if not priv else "Who wrote it?"),
        ])

    write("x3-card-plus", "X3: in X2's chat: a real question → the 468 MB card → Cancel → the next message; the question again → Download → the answer → a follow-up and thanks, the composer at its tallest, Chats and back, one more.", [
        {"op": "waitFor", "testID": "docs-hold", "timeoutMs": 5000},
        {"op": "screenshot", "name": "X3-00-card"},
        {"op": "press", "testID": "docs-hold-cancel"},
        {"op": "sleep", "ms": 2000},
        {"op": "screenshot", "name": "X3-01-cancelled"},
        {"op": "dump", "name": "X3-01-cancelled"},
        *turn("X3-02-thanks", "Thanks"),
        {"op": "type", "testID": "composer-input", "text": "What does it say about treason?"},
        {"op": "send"},
        {"op": "waitFor", "testID": "docs-hold", "timeoutMs": 30000},
        {"op": "press", "testID": "docs-hold-download"},
        {"op": "idleTimer"},
        {"op": "waitFor", "testID": "docs-hold", "gone": True, "timeoutMs": 1800000},
        {"op": "sleep", "ms": 5000},
        {"op": "waitFor", "testID": "reading-docs", "gone": True, "timeoutMs": 900000},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 600000},
        {"op": "sleep", "ms": 2500},
        {"op": "screenshot", "name": "X3-03-treason"},
        {"op": "dump", "name": "X3-03-treason"},
        *turn("X3-04-punishment", "and the punishment?"),
        *turn("X3-05-thanks", "thanks"),
        *end_check("X3-06"),
        *leave_return("X3-07"),
        *turn("X3-08-one-more", "Who can veto a bill?"),
    ])

    write("x4-sheet-plus", f"X4: Documents → '{CONSTITUTION}' → Ask: 'Summarize it', then 'And now', 'thank you', 'more' in the sheet. DOCID filled in by the shell.", [
        {"op": "deeplink", "url": "/documents"},
        {"op": "waitFor", "testID": "doc-select-DOCID", "timeoutMs": 30000},
        {"op": "sleep", "ms": 2000},
        {"op": "press", "testID": "doc-select-DOCID"},
        {"op": "sleep", "ms": 1000},
        {"op": "press", "testID": "documents-ask-selected"},
        {"op": "waitFor", "testID": "ask-sheet", "timeoutMs": 20000},
        *[s for text, shot in (("Summarize it", "X4-01-summary"), ("And now", "X4-02-and-now"), ("thank you", "X4-03-thank-you"), ("more", "X4-04-more")) for s in (
            {"op": "type", "testID": "ask-input", "text": text},
            {"op": "press", "testID": "ask-send"},
            {"op": "sleep", "ms": 2500},
            {"op": "waitFor", "testID": "ask-stop", "gone": True, "timeoutMs": 900000},
            {"op": "sleep", "ms": 2000},
            {"op": "screenshot", "name": shot},
            {"op": "dump", "name": shot},
        )],
    ])

    write("x5-picture-plus", f"X5: Instant, '{SCAN}': the answer → 'Not now' on the advice card → 'and the colours?' → 'thanks', Chats and back; then Fast with the café photo: the pack card → Remove the photo → the next message → the photo again → Download → 'and the colours?' → 'thanks'.", [
        *new_chat(),
        *switch_model("instant"),
        *attach(SCAN),
        *turn("X5-01-scan", "What do you see?"),
        {"op": "press", "testID": "model-advice-not-now"},
        {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": "X5-02-not-now"},
        *turn("X5-03-colours", "and the colours?"),
        *turn("X5-04-thanks", "thanks"),
        *leave_return("X5-05"),
        *new_chat(),
        *switch_model("fast"),
        *attach(CAFE, "pending-images", settle=3000),
        {"op": "type", "testID": "composer-input", "text": "What do you see?"},
        {"op": "send"},
        {"op": "waitFor", "testID": "vision-hold", "timeoutMs": 30000},
        {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": "X5-06-pack-card"},
        {"op": "press", "testID": "vision-hold-remove"},
        {"op": "sleep", "ms": 2000},
        {"op": "screenshot", "name": "X5-07-removed"},
        {"op": "dump", "name": "X5-07-removed"},
        *turn("X5-08-next", "What is a good name for a cafe?"),
        *attach(CAFE, "pending-images", settle=3000),
        {"op": "type", "testID": "composer-input", "text": "What do you see?"},
        {"op": "send"},
        {"op": "waitFor", "testID": "vision-hold", "timeoutMs": 30000},
        {"op": "press", "testID": "vision-hold-download"},
        {"op": "idleTimer"},
        {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1800000},
        {"op": "sleep", "ms": 3000},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 600000},
        {"op": "sleep", "ms": 2500},
        {"op": "screenshot", "name": "X5-09-cafe"},
        {"op": "dump", "name": "X5-09-cafe"},
        *turn("X5-10-colours", "and the colours?"),
        *turn("X5-11-thanks", "thanks"),
    ])

    write("x6-stop-plus", "X6: Stop mid-answer, then Continue, the Chats list and back, one more message.", [
        *new_chat(),
        {"op": "type", "testID": "composer-input", "text": "Write a long story of about 600 words about a lighthouse keeper."},
        {"op": "send"},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 120000},
        {"op": "sleep", "ms": 4000},
        {"op": "press", "testID": "stop"},
        {"op": "sleep", "ms": 2500},
        {"op": "screenshot", "name": "X6-01-stopped"},
        {"op": "press", "testID": "continue"},
        {"op": "sleep", "ms": 2500},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 600000},
        {"op": "sleep", "ms": 2500},
        {"op": "screenshot", "name": "X6-02-continued"},
        {"op": "dump", "name": "X6-02-continued"},
        *leave_return("X6-03"),
        *turn("X6-04-one-more", "Give it a title."),
    ])


def shot(name, wait=2000):
    return [{"op": "sleep", "ms": wait}, {"op": "screenshot", "name": name}, {"op": "dump", "name": name}]


def j7():
    """A new user's 15 minutes, in the order a person would wander. Every screen passed gets a screenshot."""
    t = lambda name, text: turn(name, text)
    write("j7-explore", "J7 exploratory: small talk, a general question, the paperclip, a file and a question about it, thanks, the three starter chips, Stop, the vault, a model switch, Documents and its Ask sheet, Settings and the paywall.", [
        *new_chat(),
        *shot("J7-01-new-chat"),
        *t("J7-02-hey", "hey, how are you?"),
        *t("J7-03-vaccines", "How do vaccines work?"),
        {"op": "press", "testID": "attach"},
        *shot("J7-04-attach-sheet"),
        {"op": "press", "testID": "attach-sheet-close"},
        *attach("turbine-report-3pages.pdf"),
        *shot("J7-05-file-attached", 500),
        *t("J7-06-serial", "What is the serial number of the turbine?"),
        *t("J7-07-thanks", "thanks!"),
        *new_chat(),
        {"op": "press", "testID": "suggestion-summarize"},
        *shot("J7-08-chip-summarize", 1500),
        {"op": "press", "testID": "suggestion-translate"},
        *shot("J7-09-chip-translate", 1500),
        {"op": "press", "testID": "suggestion-draft"},
        *shot("J7-10-chip-draft", 1500),
        {"op": "send"},
        {"op": "sleep", "ms": 2500},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 300000},
        *shot("J7-11-draft-answer"),
        {"op": "type", "testID": "composer-input", "text": "Explain the history of the Roman Empire in detail."},
        {"op": "send"},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 120000},
        {"op": "sleep", "ms": 3000},
        {"op": "press", "testID": "stop"},
        *shot("J7-12-stopped"),
        {"op": "press", "testID": "model-chip"},
        *shot("J7-13-model-sheet", 1500),
        {"op": "press", "testID": "model-sheet-manage"},
        {"op": "waitFor", "testID": "best-for", "timeoutMs": 20000},
        *shot("J7-14-vault"),
        {"op": "press", "testID": "back"},
        *shot("J7-15-after-vault"),
        {"op": "press", "testID": "model-chip"},
        {"op": "sleep", "ms": 1500},
        {"op": "press", "testID": "model-sheet-use-fast"},
        {"op": "sleep", "ms": 2000},
        *shot("J7-16-switching", 0),
        {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 240000},
        *shot("J7-17-on-fast"),
        *t("J7-18-fast-question", "Which is bigger, a blue whale or an elephant?"),
        {"op": "press", "testID": "open-chats"},
        {"op": "waitFor", "testID": "drawer-documents", "timeoutMs": 10000},
        *shot("J7-19-chats"),
        {"op": "press", "testID": "drawer-documents"},
        {"op": "waitFor", "testID": "documents-screen", "timeoutMs": 20000},
        *shot("J7-20-documents"),
        {"op": "press", "testID": "documents-close"},
        *shot("J7-21-after-documents"),
        {"op": "press", "testID": "drawer-settings"},
        {"op": "waitFor", "testID": "row-pro", "timeoutMs": 15000},
        *shot("J7-22-settings"),
        {"op": "press", "testID": "row-pro"},
        {"op": "waitFor", "testID": "close-paywall", "timeoutMs": 15000},
        *shot("J7-23-paywall"),
        {"op": "press", "testID": "close-paywall"},
        *shot("J7-24-after-paywall"),
        {"op": "press", "testID": "back"},
        *shot("J7-25-after-settings"),
    ])


def j7b():
    write("j7b-explore", "J7 exploratory, second half: the paperclip's 'manage' to Documents, select the turbine report, Ask a question, leave, then back to the oldest 'Summarize it' chat from the Chats list (CHATID filled in by the shell) and one more message there.", [
        {"op": "deeplink", "url": "/"},
        {"op": "waitFor", "testID": "composer-input", "timeoutMs": 15000},
        *shot("J7-26-chat"),
        {"op": "press", "testID": "attach"},
        {"op": "sleep", "ms": 1500},
        {"op": "press", "testID": "attach-manage"},
        {"op": "waitFor", "testID": "documents-screen", "timeoutMs": 20000},
        *shot("J7-27-documents"),
        {"op": "press", "testID": "doc-select-TURBINEID"},
        {"op": "sleep", "ms": 1000},
        *shot("J7-28-selected", 500),
        {"op": "press", "testID": "documents-ask-selected"},
        {"op": "waitFor", "testID": "ask-sheet", "timeoutMs": 20000},
        {"op": "type", "testID": "ask-input", "text": "Who wrote this report?"},
        {"op": "press", "testID": "ask-send"},
        {"op": "sleep", "ms": 2500},
        {"op": "waitFor", "testID": "ask-stop", "gone": True, "timeoutMs": 600000},
        *shot("J7-29-ask"),
        {"op": "deeplink", "url": "/chats"},
        {"op": "waitFor", "testID": "chat-row-CHATID", "timeoutMs": 15000},
        *shot("J7-30-chats"),
        {"op": "press", "testID": "chat-row-CHATID"},
        {"op": "waitFor", "testID": "composer-input", "timeoutMs": 15000},
        {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 240000},
        *shot("J7-31-old-chat", 3000),
        *turn("J7-32-old-chat-more", "What does it say about impeachment?"),
    ])


def extra():
    write("x6b-after-oom", "X6 after the out-of-memory switch left an empty reply: the user tries again in the same chat.", [
        *turn("X6-05-hello", "Hello?"),
        *turn("X6-06-title-again", "Give the story a title."),
    ])


if __name__ == "__main__":
    main()
    extra()
    j7()
    j7b()
