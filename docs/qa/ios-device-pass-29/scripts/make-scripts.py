#!/usr/bin/env python3
"""Writes pass 29's bridge scripts (J1, J2 x3, J3 CAT) into this folder. Run from docs/qa/ios-device-pass-29/scripts.
J1 and J3 are pass 28's steps; J2 stops about 1.0 s after the answer text appears (pass 28's 1.5 s gave 278 and 316
characters), then presses Continue and reads the answer and its ledger when it ends."""
import json

BANNED = ["The request specifies", "I will focus", "as an AI", "family-safe", "violence", "self-harm"]
CAT_Q = "What colour is the shape in this photo, what shape is it, and what word is written under it?"
J2 = [
    (1, "tack", "Explain in 8 sentences how a sailing ship tacks against the wind."),
    (2, "habits", "Write a 10-item list of study habits."),
    (3, "knight", "Tell a short story about a knight who fears the dark."),
    # run 4 repeats run 1's prompt and steps: run 1's Stop landed exactly at a sentence end, so its join tested no mid-sentence cut
    (4, "tack2", "Explain in 8 sentences how a sailing ship tacks against the wind."),
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
    ]

def answer(first_ms=240000, done_ms=400000):
    return [
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": first_ms},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": done_ms},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "assistant-text"},
    ]

def ledger(shot):
    return [
        {"op": "press", "testID": "ledger-toggle"},
        {"op": "sleep", "ms": 800},
        {"op": "value", "testID": "ledger-model"},
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

def write(name, note, steps):
    with open(f"{name}.json", "w") as f:
        json.dump({"_": note, "steps": steps}, f, indent=1, ensure_ascii=False)
        f.write("\n")

# J1: pass 28's first answer on a wiped twin, with the ledger
write("j1-first-answer", "J1: onboarding, the first answer on Instant, the detailed ledger (tokens/s, first token).", [
    {"op": "waitFor", "testID": "onboarding-welcome", "timeoutMs": 120000},
    {"op": "sleep", "ms": 1500},
    {"op": "screenshot", "name": "J1-00-welcome"},
    {"op": "press", "testID": "onboarding-continue"},
    {"op": "waitFor", "testID": "onboarding-model", "timeoutMs": 30000},
    {"op": "sleep", "ms": 2500},
    {"op": "value", "testID": "onboarding-model"},
    {"op": "press", "testID": "start-chatting"},
    {"op": "waitFor", "testID": "onboarding-sealed", "timeoutMs": 30000},
    {"op": "sleep", "ms": 4000},
    {"op": "press", "testID": "sealed-start"},
    {"op": "waitFor", "testID": "onboarding-lock", "timeoutMs": 30000},
    {"op": "sleep", "ms": 1500},
    {"op": "press", "testID": "lock-start"},
    {"op": "waitFor", "testID": "composer-input", "timeoutMs": 60000},
    {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 120000},
    {"op": "sleep", "ms": 2000},
    {"op": "type", "testID": "composer-input", "text": "In two sentences, what is a lighthouse for?"},
    {"op": "send"},
    *answer(),
    {"op": "screenshot", "name": "J1-01-first-answer"},
    {"op": "waitFor", "testID": "loop-notice", "gone": True, "timeoutMs": 500},
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

# J2: round 121 on llama.rn. New chat, Stop about 200 characters in, Continue, the final text and the ledger of the resumed turn
for n, key, prompt in J2:
    write(f"j2-continue-{n}", f"J2 run {n} ({key}): Stop about 200 characters in, then Continue (round 121, the same assistant turn by prefill).", [
        *new_chat(),
        {"op": "value", "testID": "model-chip"},
        {"op": "type", "testID": "composer-input", "text": prompt},
        {"op": "send"},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 240000},
        {"op": "sleep", "ms": 1000},
        {"op": "press", "testID": "stop"},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "assistant-text"},
        {"op": "screenshot", "name": f"J2-{n}a-{key}-stopped"},
        {"op": "waitFor", "testID": "continue", "timeoutMs": 10000},
        {"op": "press", "testID": "continue"},
        {"op": "sleep", "ms": 1500},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 400000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "assistant-text"},
        {"op": "screenshot", "name": f"J2-{n}b-{key}-final"},
        {"op": "waitFor", "testID": "loop-notice", "gone": True, "timeoutMs": 500},
        *ledger(f"J2-{n}c-{key}-ledger"),
    ])

# J3: the CAT photo on Instant with its bundled pack: no card, the red circle and CAT named, no narrated instruction
write("j3-photo-cat", "J3: red-circle-cat.png on Instant (bundled pack), no card expected.", [
    *new_chat(),
    {"op": "devPrompt", "lines": ["image: red-circle-cat.png"]},
    {"op": "waitFor", "testID": "pending-images", "timeoutMs": 60000},
    {"op": "type", "testID": "composer-input", "text": CAT_Q},
    {"op": "sleep", "ms": 800},
    {"op": "screenshot", "name": "J3-cat-a-composer"},
    {"op": "send"},
    {"op": "sleep", "ms": 3000},
    {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1000},
    {"op": "assertText", "text": "photo pack", "absent": True},
    {"op": "waitFor", "testID": "user-images", "timeoutMs": 30000},
    *answer(),
    {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1000},
    {"op": "screenshot", "name": "J3-cat-b-answer"},
    *[{"op": "assertText", "text": b, "testID": "assistant-text", "absent": True} for b in BANNED],
    *[{"op": "assertText", "text": w, "testID": "assistant-text"} for w in ("red", "circle", "CAT")],
    *ledger("J3-cat-c-ledger"),
])
