#!/usr/bin/env python3
"""Writes pass 32's bridge scripts into this folder. Run from docs/qa/ios-device-pass-32/scripts.
Round 127 on the phone: J0 the onboarding model step (Fast preselected with "Start now with Instant"), J1 pass 31's
first answer, J2 Spanish and Japanese on Instant, J4 the free user's advice card after the Japanese answer, J3 two
photos on Instant (512 image tokens), J5 pass 31's document row, J6 Fast from the model sheet, then on Fast: the
handwritten note (1024 image tokens), Spanish "cannot know", code, one polite rewrite, and a 12-turn chat ending in a
photo. Each answer's dev-run.json is pulled by the chain after its script, so every question that needs its timings has
a script of its own."""
import json

BANNED = ["The request specifies", "I will focus", "as an AI", "NOT_FOUND", "<<<"]
RECEIPT = ("receipt", "photo-receipt.png", "What is the total on this receipt, and how many items were bought?")
NOTE = ("note", "handwritten-note-ca-1918-december-dpla-65285abb9b0.jpg", "What number is written next to Mr. Thompson?")
LABEL = "office-hours.txt · part"
NO_ROOM = "Not enough context space"
TURNS = [
    "Hi! Give me one word for happy.",
    "Now one word for sad.",
    "Name a fruit that is red.",
    "Name a fruit that is yellow.",
    "What is 7 times 8?",
    "What is 12 plus 30?",
    "Name a planet near the Sun.",
    "Name a large ocean.",
    "What colour is the sky on a clear day?",
    "Name a bird that cannot fly.",
    "What day comes after Monday?",
    "Name a musical instrument with strings.",
]

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

def answer(first_ms=240000, done_ms=400000):
    return [
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": first_ms},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": done_ms},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "assistant-text"},
    ]

def ask(text):
    return [{"op": "type", "testID": "composer-input", "text": text}, {"op": "send"}, *answer()]

def ledger(shot):
    return [
        {"op": "press", "testID": "ledger-toggle"},
        {"op": "sleep", "ms": 800},
        {"op": "value", "testID": "ledger-model"},
        {"op": "value", "testID": "ledger-context"},
        {"op": "setTier", "tier": "pro"},
        {"op": "sleep", "ms": 1200},
        {"op": "value", "testID": "ledger-tokPerSec"},
        {"op": "value", "testID": "ledger-ttft"},
        {"op": "value", "testID": "ledger-tokens"},
        {"op": "value", "testID": "ledger-time"},
        {"op": "screenshot", "name": shot},
        {"op": "setTier", "tier": "free"},
        {"op": "sleep", "ms": 800},
    ]

def banned_absent():
    return [{"op": "assertText", "text": b, "testID": "assistant-text", "absent": True} for b in BANNED]

def photo(file, question, shot, first_ms=240000):
    return [
        {"op": "devPrompt", "lines": [f"image: {file}"]},
        {"op": "waitFor", "testID": "pending-images", "timeoutMs": 60000},
        {"op": "type", "testID": "composer-input", "text": question},
        {"op": "sleep", "ms": 800},
        {"op": "screenshot", "name": f"{shot}-a-composer"},
        {"op": "send"},
    ]

def write(name, note, steps):
    with open(f"{name}.json", "w") as f:
        json.dump({"_": note, "steps": steps}, f, indent=1, ensure_ascii=False)
        f.write("\n")

write("j0-onboarding", "J0 (round 127): the model step on a fresh twin. Fast preselected and RECOMMENDED, 'Download Fast · 1.28 GB', 'Start now with Instant' under it, Instant still selectable; then 'Start now with Instant' -> Sealed -> lock -> chat on Instant.", [
    {"op": "waitFor", "testID": "onboarding-welcome", "timeoutMs": 120000},
    {"op": "sleep", "ms": 1500},
    {"op": "value", "testID": "onboarding-welcome"},
    {"op": "screenshot", "name": "J0-00-welcome"},
    {"op": "press", "testID": "onboarding-continue"},
    {"op": "waitFor", "testID": "onboarding-model", "timeoutMs": 30000},
    {"op": "sleep", "ms": 2500},
    {"op": "value", "testID": "onboarding-model"},
    {"op": "value", "testID": "model-option-fast"},
    {"op": "value", "testID": "model-option-instant"},
    {"op": "value", "testID": "download-model"},
    {"op": "value", "testID": "start-now-with"},
    {"op": "screenshot", "name": "J0-01-fast-selected"},
    {"op": "dump", "name": "model-step-fast-selected"},
    {"op": "assertText", "text": "RECOMMENDED", "testID": "model-option-fast"},
    {"op": "assertText", "text": "Download Fast · 1.28 GB", "testID": "download-model"},
    {"op": "assertText", "text": "Start now with Instant", "testID": "start-now-with"},
    {"op": "waitFor", "testID": "start-chatting", "gone": True, "timeoutMs": 1000},
    {"op": "press", "testID": "model-option-instant"},
    {"op": "sleep", "ms": 1500},
    {"op": "value", "testID": "onboarding-model"},
    {"op": "value", "testID": "start-chatting"},
    {"op": "waitFor", "testID": "download-model", "gone": True, "timeoutMs": 1000},
    {"op": "waitFor", "testID": "start-now-with", "gone": True, "timeoutMs": 1000},
    {"op": "screenshot", "name": "J0-02-instant-selected"},
    {"op": "dump", "name": "model-step-instant-selected"},
    {"op": "press", "testID": "model-option-fast"},
    {"op": "sleep", "ms": 1500},
    {"op": "waitFor", "testID": "start-now-with", "timeoutMs": 5000},
    {"op": "value", "testID": "download-model"},
    {"op": "screenshot", "name": "J0-03-fast-again"},
    {"op": "press", "testID": "start-now-with"},
    {"op": "waitFor", "testID": "onboarding-sealed", "timeoutMs": 30000},
    {"op": "sleep", "ms": 4000},
    {"op": "value", "testID": "onboarding-sealed"},
    {"op": "screenshot", "name": "J0-04-sealed"},
    {"op": "press", "testID": "sealed-start"},
    {"op": "waitFor", "testID": "onboarding-lock", "timeoutMs": 30000},
    {"op": "sleep", "ms": 1500},
    {"op": "press", "testID": "lock-start"},
    {"op": "waitFor", "testID": "composer-input", "timeoutMs": 60000},
    {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 120000},
    {"op": "sleep", "ms": 2000},
    {"op": "value", "testID": "model-chip"},
    {"op": "assertText", "text": "INSTANT", "testID": "model-chip"},
    {"op": "screenshot", "name": "J0-05-chat-on-instant"},
])

write("j1-first-answer", "J1: the first answer on Instant and the detailed ledger, in the chat J0 opened.", [
    *ask("In two sentences, what is a lighthouse for?"),
    {"op": "screenshot", "name": "J1-01-first-answer"},
    {"op": "press", "testID": "ledger-toggle"},
    {"op": "sleep", "ms": 800},
    {"op": "value", "testID": "ledger-model"},
    {"op": "value", "testID": "ledger-msPerToken"},
    {"op": "value", "testID": "ledger-context"},
    {"op": "setTier", "tier": "pro"},
    {"op": "sleep", "ms": 1200},
    {"op": "value", "testID": "ledger-tokPerSec"},
    {"op": "value", "testID": "ledger-ttft"},
    {"op": "value", "testID": "ledger-tokens"},
    {"op": "value", "testID": "ledger-time"},
    {"op": "screenshot", "name": "J1-02-ledger"},
    {"op": "setTier", "tier": "free"},
    {"op": "sleep", "ms": 800},
])

write("j2a-spanish", "J2: Spanish on Instant, answer expected in Spanish.", [
    *new_chat(),
    *ask("¿Cuál es la capital de Australia?"),
    {"op": "sleep", "ms": 1500},
    {"op": "screenshot", "name": "J2-01-spanish"},
    {"op": "dump", "name": "chat-spanish"},
])

write("j2b-japanese-j4", "J2 + J4: Japanese on Instant (rated none at Japanese in catalog v8), answer expected in Japanese; then the free user's advice card: Fast with 'Install FAST · 1.28 GB', Sharp only on a second line with the PRO chip; dismissed with Not now.", [
    *new_chat(),
    *ask("日本で一番高い山は何ですか"),
    {"op": "sleep", "ms": 2500},
    {"op": "screenshot", "name": "J2-02-japanese"},
    {"op": "waitFor", "testID": "model-advice", "timeoutMs": 15000},
    {"op": "sleep", "ms": 800},
    {"op": "value", "testID": "model-advice"},
    {"op": "value", "testID": "model-advice-reason"},
    {"op": "value", "testID": "model-advice-install"},
    {"op": "value", "testID": "model-advice-best"},
    {"op": "value", "testID": "model-advice-best-pro"},
    {"op": "screenshot", "name": "J4-01-advice-card"},
    {"op": "dump", "name": "chat-japanese-advice"},
    {"op": "assertText", "text": "FAST", "testID": "model-advice-reason"},
    {"op": "assertText", "text": "Install FAST · 1.28 GB", "testID": "model-advice-install"},
    {"op": "assertText", "text": "SHARP", "testID": "model-advice-best"},
    {"op": "assertText", "text": "SHARP", "testID": "model-advice-install", "absent": True},
    {"op": "waitFor", "testID": "model-advice-best-pro", "timeoutMs": 1000},
    {"op": "press", "testID": "model-advice-not-now"},
    {"op": "sleep", "ms": 1500},
    {"op": "waitFor", "testID": "model-advice", "gone": True, "timeoutMs": 5000},
    {"op": "screenshot", "name": "J4-02-after-not-now"},
])

for key, file, question in (RECEIPT, NOTE):
    write(f"j3-instant-{key}", f"J3: {file} on Instant (bundled pack, 512 image tokens).", [
        *new_chat(),
        *photo(file, question, f"J3-{key}"),
        {"op": "sleep", "ms": 3000},
        {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1000},
        {"op": "waitFor", "testID": "user-images", "timeoutMs": 30000},
        *answer(),
        {"op": "screenshot", "name": f"J3-{key}-b-answer"},
        *banned_absent(),
        *ledger(f"J3-{key}-c-ledger"),
    ])

write("j5-documents", "J5 on Instant (pass 31's row, F457): office-hours.txt attached; the matching answer has no '[1] office-hours.txt · part 1' line and a source chip; the non-matching one answers with 'Answered without them'.", [
    *new_chat(),
    {"op": "devPrompt", "lines": ["attach: office-hours.txt"]},
    {"op": "waitFor", "testID": "attached-docs", "timeoutMs": 30000},
    {"op": "sleep", "ms": 3000},
    {"op": "value", "testID": "attached-docs"},
    {"op": "type", "testID": "composer-input", "text": "What is the office phone number?"},
    {"op": "send"},
    {"op": "waitFor", "testID": "docs-hold", "timeoutMs": 15000},
    {"op": "sleep", "ms": 800},
    {"op": "screenshot", "name": "J5-01-index-card"},
    {"op": "value", "testID": "docs-hold"},
    {"op": "press", "testID": "docs-hold-download"},
    {"op": "sleep", "ms": 6000},
    {"op": "value", "testID": "docs-hold-body"},
    {"op": "screenshot", "name": "J5-02-index-downloading"},
    {"op": "idleTimer"},
    {"op": "waitFor", "testID": "docs-hold", "gone": True, "timeoutMs": 2400000},
    {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 400000},
    {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 600000},
    {"op": "sleep", "ms": 1500},
    {"op": "value", "testID": "assistant-text"},
    {"op": "waitFor", "testID": "citations", "timeoutMs": 30000},
    {"op": "value", "testID": "citations"},
    {"op": "screenshot", "name": "J5-03-matching-answer"},
    {"op": "assertText", "text": "555-0134", "testID": "assistant-text"},
    {"op": "assertText", "text": LABEL, "testID": "assistant-text", "absent": True},
    {"op": "type", "testID": "composer-input", "text": "What is the capital of Australia?"},
    {"op": "send"},
    {"op": "sleep", "ms": 3000},
    {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 600000},
    {"op": "sleep", "ms": 2000},
    {"op": "waitFor", "testID": "none-matched", "timeoutMs": 10000},
    {"op": "value", "testID": "none-matched"},
    {"op": "assertText", "text": "Canberra"},
    {"op": "dump", "name": "chat-after-two-questions"},
    {"op": "screenshot", "name": "J5-04-nonmatching-answer"},
])

write("j6-1-fast-probe", "J6 (pass 31's J6b): Fast from the model sheet; its progress read when it appears and 60 s later.", [
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
    {"op": "screenshot", "name": "J6-01-fast-60s"},
])

write("j6-2-fast-use", "J6 (pass 31's J6c): wait for Use on the sheet, press it, Fast loads.", [
    {"op": "idleTimer"},
    {"op": "waitFor", "testID": "model-sheet-use-fast", "timeoutMs": 1500000},
    {"op": "value", "testID": "model-sheet-use-fast"},
    {"op": "screenshot", "name": "J6-02-fast-installed"},
    {"op": "press", "testID": "model-sheet-use-fast"},
    {"op": "sleep", "ms": 3000},
    {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 240000},
    {"op": "sleep", "ms": 2000},
    {"op": "value", "testID": "model-chip"},
    {"op": "assertText", "text": "FAST", "testID": "model-chip"},
    {"op": "screenshot", "name": "J6-03-fast-selected"},
])

write("j6a-fast-note", "J6a: the handwritten note on Fast. Fast's photo pack is downloaded from the card first (668 MB), then the photo sends by itself; expected '4658', 1024 image tokens.", [
    *new_chat(),
    {"op": "assertText", "text": "FAST", "testID": "model-chip"},
    *photo(NOTE[1], NOTE[2], "J6a-note"),
    {"op": "waitFor", "testID": "vision-hold", "timeoutMs": 15000},
    {"op": "sleep", "ms": 1200},
    {"op": "value", "testID": "vision-hold-title"},
    {"op": "value", "testID": "vision-hold-body"},
    {"op": "value", "testID": "vision-hold-download"},
    {"op": "screenshot", "name": "J6a-note-b-pack-card"},
    {"op": "press", "testID": "vision-hold-download"},
    {"op": "waitFor", "testID": "vision-hold-progress", "timeoutMs": 30000},
    {"op": "sleep", "ms": 5000},
    {"op": "value", "testID": "vision-hold-body"},
    {"op": "idleTimer"},
    {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 2400000},
    {"op": "waitFor", "testID": "user-images", "timeoutMs": 60000},
    *answer(first_ms=600000, done_ms=600000),
    {"op": "screenshot", "name": "J6a-note-c-answer"},
    {"op": "assertText", "text": "4658", "testID": "assistant-text"},
    *ledger("J6a-note-d-ledger"),
])

write("j6a2-fast-receipt", "J6a, control: the clean receipt on Fast (pack installed), for the 1024-token timings next to Instant's.", [
    *new_chat(),
    *photo(RECEIPT[1], RECEIPT[2], "J6a2-receipt"),
    {"op": "sleep", "ms": 3000},
    {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1000},
    {"op": "waitFor", "testID": "user-images", "timeoutMs": 30000},
    *answer(first_ms=600000, done_ms=600000),
    {"op": "screenshot", "name": "J6a2-receipt-b-answer"},
    *ledger("J6a2-receipt-c-ledger"),
])

write("j6b-fast-spanish", "J6b: on Fast, yesterday's Real Madrid match: an honest 'cannot know' in Spanish, no invented score.", [
    *new_chat(),
    *ask("¿Quién ganó el partido del Real Madrid ayer?"),
    {"op": "screenshot", "name": "J6b-real-madrid"},
    *banned_absent(),
])

write("j6c-fast-code", "J6c: on Fast, a Python palindrome function: real code.", [
    *new_chat(),
    *ask("Write a Python function that checks if a word is a palindrome"),
    {"op": "assertText", "text": "def ", "testID": "assistant-text"},
    {"op": "screenshot", "name": "J6c-palindrome"},
    {"op": "dump", "name": "chat-palindrome"},
])

write("j6d-fast-email", "J6d: on Fast, one polite rewrite of the email, not a list of versions.", [
    *new_chat(),
    *ask("Make this email more polite: 'You still haven't sent me the report. I needed it yesterday. Send it now.'"),
    {"op": "screenshot", "name": "J6d-polite-email"},
    {"op": "assertText", "text": "Version 2", "testID": "assistant-text", "absent": True},
    {"op": "assertText", "text": "Option 2", "testID": "assistant-text", "absent": True},
])

long_steps = [*new_chat()]
for t in TURNS:
    long_steps += [{"op": "type", "testID": "composer-input", "text": t}, {"op": "send"}, {"op": "sleep", "ms": 3000},
                   {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 400000}, {"op": "sleep", "ms": 1500}]
long_steps += [
    {"op": "screenshot", "name": "J6e-01-after-12-turns"},
    *photo(RECEIPT[1], RECEIPT[2], "J6e-02-receipt"),
    {"op": "sleep", "ms": 3000},
    {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1000},
    {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 600000},
    {"op": "sleep", "ms": 2500},
    {"op": "assertText", "text": NO_ROOM, "absent": True},
    {"op": "screenshot", "name": "J6e-03-receipt-answer"},
    {"op": "dump", "name": "chat-long"},
    *ledger("J6e-04-ledger"),
]
write("j6e-fast-long", "J6e: on Fast, 12 one-line turns, then the receipt photo with a question: an answer, no 'Not enough context space' row.", long_steps)

# J4 again on a relaunched twin. The bridge's setTier("free") leaves the licence state at "pro" (LicenceManager.set
# applies a pretend tier but never restores the real one), so j2b, run after J1's ledger read, saw a Pro user. A
# relaunch starts the licence state from the store's own answer: free. No setTier in this script.
write("j4-free-relaunched", "J4 on a relaunched twin (free, no setTier before it): Japanese on Instant, the card offers Fast with 'Install FAST · 1.28 GB' and Sharp only on a second line with the PRO chip; Not now.", [
    *new_chat(),
    *ask("日本で一番高い山は何ですか"),
    {"op": "sleep", "ms": 2500},
    {"op": "waitFor", "testID": "model-advice", "timeoutMs": 15000},
    {"op": "sleep", "ms": 800},
    {"op": "value", "testID": "model-advice"},
    {"op": "value", "testID": "model-advice-reason"},
    {"op": "value", "testID": "model-advice-install"},
    {"op": "value", "testID": "model-advice-best"},
    {"op": "value", "testID": "model-advice-best-pro"},
    {"op": "screenshot", "name": "J4-03-advice-card-free"},
    {"op": "dump", "name": "chat-japanese-advice-free"},
    {"op": "assertText", "text": "FAST", "testID": "model-advice-reason"},
    {"op": "assertText", "text": "Install FAST · 1.28 GB", "testID": "model-advice-install"},
    {"op": "assertText", "text": "SHARP", "testID": "model-advice-best"},
    {"op": "assertText", "text": "SHARP", "testID": "model-advice-install", "absent": True},
    {"op": "waitFor", "testID": "model-advice-best-pro", "timeoutMs": 1000},
    {"op": "press", "testID": "model-advice-not-now"},
    {"op": "sleep", "ms": 1500},
    {"op": "waitFor", "testID": "model-advice", "gone": True, "timeoutMs": 5000},
    {"op": "screenshot", "name": "J4-04-after-not-now-free"},
])
