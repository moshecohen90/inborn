#!/usr/bin/env python3
"""Writes pass 30's bridge scripts into this folder. Run from docs/qa/ios-device-pass-30/scripts.
J1, J2 (the knight, Stop 1.0 s after the answer text appears) and J3 are pass 29's steps. J5 is pass 28's document
row on Instant, with round 124's checks: no sentence about instructions, rules or general knowledge in the matching
answer. J6 reads the Instant photo pack's card in the native vault (round 124's 0.1B label). J4-probe starts the Fast
download from the model sheet and waits 180 s for Use: the brief's condition for running J4 at all."""
import json

BANNED = ["The request specifies", "I will focus", "as an AI", "family-safe", "violence", "self-harm"]
CAT_Q = "What colour is the shape in this photo, what shape is it, and what word is written under it?"
# F449's narration, as the web saw it ("no general knowledge was used ... within the documents list itself")
NARRATION = ["instruction", "rules", "general knowledge", "documents list", "NOT_FOUND", "<<<"]

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

write("j2-continue-1", "J2 (knight): Stop about 200 characters in, then Continue (round 121, the same assistant turn by prefill).", [
    *new_chat(),
    {"op": "value", "testID": "model-chip"},
    {"op": "type", "testID": "composer-input", "text": "Tell a short story about a knight who fears the dark."},
    {"op": "send"},
    {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 240000},
    {"op": "sleep", "ms": 1000},
    {"op": "press", "testID": "stop"},
    {"op": "sleep", "ms": 2000},
    {"op": "value", "testID": "assistant-text"},
    {"op": "screenshot", "name": "J2-1a-knight-stopped"},
    {"op": "waitFor", "testID": "continue", "timeoutMs": 10000},
    {"op": "press", "testID": "continue"},
    {"op": "sleep", "ms": 1500},
    {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 400000},
    {"op": "sleep", "ms": 1500},
    {"op": "value", "testID": "assistant-text"},
    {"op": "screenshot", "name": "J2-1b-knight-final"},
    {"op": "waitFor", "testID": "loop-notice", "gone": True, "timeoutMs": 500},
    *ledger("J2-1c-knight-ledger"),
])

def j3(name, note, sfx=""):
    write(name, note, [
    *new_chat(),
    {"op": "devPrompt", "lines": ["image: red-circle-cat.png"]},
    {"op": "waitFor", "testID": "pending-images", "timeoutMs": 60000},
    {"op": "type", "testID": "composer-input", "text": CAT_Q},
    {"op": "sleep", "ms": 800},
    {"op": "screenshot", "name": f"J3-cat{sfx}-a-composer"},
    {"op": "send"},
    {"op": "sleep", "ms": 3000},
    {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1000},
    {"op": "assertText", "text": "photo pack", "absent": True},
    {"op": "waitFor", "testID": "user-images", "timeoutMs": 30000},
    *answer(),
    {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1000},
    {"op": "screenshot", "name": f"J3-cat{sfx}-b-answer"},
    *[{"op": "assertText", "text": b, "testID": "assistant-text", "absent": True} for b in BANNED],
    *[{"op": "assertText", "text": w, "testID": "assistant-text"} for w in ("red", "circle", "CAT")],
    *ledger(f"J3-cat{sfx}-c-ledger"),
    ])

j3("j3-photo-cat", "J3: red-circle-cat.png on Instant (bundled pack), no card expected.")
# run 2, added after run 1's answer named the circle and CAT but no colour: the same steps once more, on the same twin
j3("j3-photo-cat-2", "J3 run 2: the same steps as run 1, once more.", "2")

write("j5-documents", "J5 on Instant (round 124's RAG prompt on llama.rn): office-hours.txt attached; the matching question names 555-0134 with a source and narrates nothing; the non-matching one answers Canberra with 'Answered without them'.", [
    *new_chat(),
    {"op": "value", "testID": "model-chip"},
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
    *[{"op": "assertText", "text": b, "testID": "assistant-text", "absent": True} for b in NARRATION],
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

write("j6-vault-packs", "J6: the Instant photo pack's card in the native vault (/vault?focus=<id>): round 124's 0.1B label and 'Included with the app'; then the index card, installed by J5.", [
    {"op": "deeplink", "url": "/vault?focus=vision-qwen35"},
    {"op": "sleep", "ms": 3500},
    {"op": "value", "testID": "model-card-vision-qwen35"},
    {"op": "value", "testID": "model-status-vision-qwen35"},
    {"op": "screenshot", "name": "J6-01-pack-instant"},
    {"op": "assertText", "text": "Qwen3.5 mmproj 0.1B · 205 MB · F16", "testID": "model-card-vision-qwen35"},
    {"op": "assertText", "text": "0.4B", "testID": "model-card-vision-qwen35", "absent": True},
    {"op": "assertText", "text": "Included with the app", "testID": "model-status-vision-qwen35"},
    {"op": "deeplink", "url": "/vault?focus=embed-e5"},
    {"op": "sleep", "ms": 3500},
    {"op": "value", "testID": "model-card-embed-e5"},
    {"op": "screenshot", "name": "J6-02-index"},
])

write("j4-probe-fast", "J4 probe: Fast from the model sheet, Use awaited for 180 s after Download. J4 runs only if Use shows in time.", [
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
    {"op": "screenshot", "name": "J4-probe-01-60s"},
    {"op": "waitFor", "testID": "model-sheet-use-fast", "timeoutMs": 118000},
    {"op": "value", "testID": "model-sheet-use-fast"},
    {"op": "screenshot", "name": "J4-probe-02-180s"},
])
