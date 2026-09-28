#!/usr/bin/env python3
"""Writes pass 28's bridge scripts (J1-J8) into this folder. Run from docs/qa/ios-device-pass-28/scripts."""
import json

BANNED = ["The request specifies", "I will focus", "as an AI", "family-safe", "violence", "self-harm"]
PHOTOS = [
    ("cat", "red-circle-cat.png", "What colour is the shape in this photo, what shape is it, and what word is written under it?"),
    ("receipt", "photo-receipt.png", "What is the total on this receipt, and how many items were bought?"),
    ("sign", "photo-street-sign.png", "What does this street sign say, and which way does the arrow point?"),
    ("screenshot", "photo-text-screenshot.png", "When does the pool open on weekends, and on which day is it closed?"),
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

def banned_absent():
    return [{"op": "assertText", "text": b, "testID": "assistant-text", "absent": True} for b in BANNED]

def write(name, note, steps):
    with open(f"{name}.json", "w") as f:
        json.dump({"_": note, "steps": steps}, f, indent=1, ensure_ascii=False)
        f.write("\n")

# J1: onboarding on a wiped twin, then the first answer and its ledger (pass 27's a-first-answer, with the ledger shot)
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

# J2: Stop about 1.5 s into the answer (about 200 characters at Instant's rate), then Continue; two prompts
for n, prompt in ((1, "Write a long, detailed history of the spice trade between Asia and Europe, in at least eight paragraphs."),
                  (2, "Explain in detail how a bicycle's gears work, in at least six paragraphs.")):
    write(f"j2-continue-{n}", "J2: Stop after about 200 characters, then Continue (round 118's seam word).", [
        *new_chat(),
        {"op": "type", "testID": "composer-input", "text": prompt},
        {"op": "send"},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 240000},
        {"op": "sleep", "ms": 1500},
        {"op": "press", "testID": "stop"},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "assistant-text"},
        {"op": "screenshot", "name": f"J2-{n}a-stopped"},
        {"op": "waitFor", "testID": "continue", "timeoutMs": 10000},
        {"op": "press", "testID": "continue"},
        {"op": "sleep", "ms": 1500},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 400000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "assistant-text"},
        {"op": "screenshot", "name": f"J2-{n}b-continued"},
    ])

# J3: four photos on Instant with its bundled pack: no card may appear
for key, file, question in PHOTOS:
    write(f"j3-photo-{key}", f"J3: {file} on Instant (bundled pack), no card expected.", [
        *new_chat(),
        {"op": "devPrompt", "lines": [f"image: {file}"]},
        {"op": "waitFor", "testID": "pending-images", "timeoutMs": 60000},
        {"op": "type", "testID": "composer-input", "text": question},
        {"op": "sleep", "ms": 800},
        {"op": "screenshot", "name": f"J3-{key}-a-composer"},
        {"op": "send"},
        {"op": "sleep", "ms": 3000},
        {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1000},
        {"op": "assertText", "text": "photo pack", "absent": True},
        {"op": "waitFor", "testID": "user-images", "timeoutMs": 30000},
        *answer(),
        {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 1000},
        {"op": "screenshot", "name": f"J3-{key}-b-answer"},
        *banned_absent(),
        *ledger(f"J3-{key}-c-ledger"),
    ])

# J4a: Fast from the model sheet (1.28 GB over Wi-Fi), timed by the bridge's step clock, then switched to
write("j4a-fast-download", "J4a: the model sheet, Fast downloaded on demand and switched to.", [
    *new_chat(),
    {"op": "press", "testID": "model-chip"},
    {"op": "waitFor", "testID": "model-sheet", "timeoutMs": 10000},
    {"op": "sleep", "ms": 1500},
    {"op": "screenshot", "name": "J4-01-model-sheet"},
    {"op": "value", "testID": "model-sheet-row-fast"},
    {"op": "dump", "name": "model-sheet"},
    {"op": "press", "testID": "model-sheet-download-fast"},
    {"op": "waitFor", "testID": "model-sheet-confirm-fast", "timeoutMs": 5000},
    {"op": "sleep", "ms": 800},
    {"op": "value", "testID": "model-sheet-confirm-fast"},
    {"op": "screenshot", "name": "J4-02-fast-confirm"},
    {"op": "press", "testID": "model-sheet-go-fast"},
    {"op": "waitFor", "testID": "model-sheet-progress-fast", "timeoutMs": 60000},
    {"op": "sleep", "ms": 6000},
    {"op": "value", "testID": "model-sheet-progress-fast"},
    {"op": "screenshot", "name": "J4-03-fast-downloading"},
    {"op": "idleTimer"},
    {"op": "waitFor", "testID": "model-sheet-use-fast", "timeoutMs": 2400000},
    {"op": "sleep", "ms": 1000},
    {"op": "value", "testID": "model-sheet-row-fast"},
    {"op": "screenshot", "name": "J4-04-fast-installed"},
    {"op": "press", "testID": "model-sheet-use-fast"},
    {"op": "sleep", "ms": 3000},
    {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 240000},
    {"op": "sleep", "ms": 2000},
    {"op": "value", "testID": "model-chip"},
    {"op": "screenshot", "name": "J4-05-fast-selected"},
])

# J4b: the CAT photo on Fast: its pack's card, the download, the photo sending by itself, Fast's answer
write("j4b-fast-photo", "J4b: the CAT photo on Fast: the pack card, Download 668 MB, the photo sends by itself.", [
    *new_chat(),
    {"op": "value", "testID": "model-chip"},
    {"op": "devPrompt", "lines": ["image: red-circle-cat.png"]},
    {"op": "waitFor", "testID": "pending-images", "timeoutMs": 60000},
    {"op": "type", "testID": "composer-input", "text": PHOTOS[0][2]},
    {"op": "sleep", "ms": 800},
    {"op": "send"},
    {"op": "waitFor", "testID": "vision-hold", "timeoutMs": 15000},
    {"op": "sleep", "ms": 1200},
    {"op": "screenshot", "name": "J4-06-fast-pack-card"},
    {"op": "value", "testID": "vision-hold-title"},
    {"op": "value", "testID": "vision-hold-body"},
    {"op": "value", "testID": "vision-hold-download"},
    {"op": "value", "testID": "vision-hold-switch"},
    {"op": "value", "testID": "vision-hold-caption"},
    {"op": "value", "testID": "vision-hold-remove"},
    {"op": "dump", "name": "pack-card"},
    {"op": "assertText", "text": "FAST needs its photo pack to see photos", "testID": "vision-hold-title"},
    {"op": "assertText", "text": "One 668 MB download, then this photo sends by itself.", "testID": "vision-hold-body"},
    {"op": "assertText", "text": "Download 668 MB", "testID": "vision-hold-download"},
    {"op": "assertText", "text": "Switch to INSTANT", "testID": "vision-hold-switch"},
    {"op": "press", "testID": "vision-hold-download"},
    {"op": "waitFor", "testID": "vision-hold-progress", "timeoutMs": 30000},
    {"op": "sleep", "ms": 5000},
    {"op": "value", "testID": "vision-hold-body"},
    {"op": "screenshot", "name": "J4-07-pack-downloading"},
    {"op": "idleTimer"},
    {"op": "waitFor", "testID": "vision-hold", "gone": True, "timeoutMs": 2400000},
    {"op": "waitFor", "testID": "user-images", "timeoutMs": 60000},
    {"op": "sleep", "ms": 1000},
    {"op": "screenshot", "name": "J4-08-photo-sent"},
    *answer(first_ms=600000, done_ms=600000),
    {"op": "screenshot", "name": "J4-09-fast-answer"},
    *banned_absent(),
    *ledger("J4-10-fast-ledger"),
])

# J5: a .txt in the chat, a matching question (the index card and its download), then a question it cannot answer
write("j5-documents", "J5: office-hours.txt attached; a matching question with a citation, a non-matching one with 'Answered without them'.", [
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
    *answer(first_ms=400000, done_ms=600000),
    {"op": "waitFor", "testID": "citations", "timeoutMs": 30000},
    {"op": "value", "testID": "citations"},
    {"op": "screenshot", "name": "J5-03-matching-answer"},
    {"op": "assertText", "text": "555-0134", "testID": "assistant-text"},
    {"op": "type", "testID": "composer-input", "text": "What is the capital of Australia?"},
    {"op": "send"},
    {"op": "sleep", "ms": 3000},
    {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 600000},
    {"op": "sleep", "ms": 2000},
    {"op": "waitFor", "testID": "none-matched", "timeoutMs": 10000},
    {"op": "value", "testID": "none-matched"},
    {"op": "dump", "name": "chat-after-two-questions"},
    {"op": "screenshot", "name": "J5-04-nonmatching-answer"},
])

# J6 + J7: the vault's Extensions, then Privacy & storage
write("j6-j7-vault-storage", "J6: vault Extensions after J4; J7: Privacy & storage sizes.", [
    {"op": "deeplink", "url": "/vault"},
    {"op": "sleep", "ms": 3000},
    {"op": "scrollTo", "testID": "vault-extensions"},
    {"op": "sleep", "ms": 1000},
    {"op": "screenshot", "name": "J6-01-vault-extensions"},
    {"op": "value", "testID": "vault-extensions"},
    {"op": "value", "testID": "ext-state-vision-qwen35"},
    {"op": "value", "testID": "ext-state-vision-qwen35-2b"},
    {"op": "value", "testID": "ext-state-embed-e5"},
    {"op": "assertText", "text": "Included with the app", "testID": "ext-state-vision-qwen35"},
    {"op": "assertText", "text": "Installed · 668 MB", "testID": "ext-state-vision-qwen35-2b"},
    {"op": "dump", "name": "vault"},
    {"op": "deeplink", "url": "/settings/storage"},
    {"op": "waitFor", "testID": "storage", "timeoutMs": 10000},
    {"op": "sleep", "ms": 2500},
    {"op": "value", "testID": "storage"},
    {"op": "value", "testID": "storage-chats"},
    {"op": "value", "testID": "storage-documents"},
    {"op": "value", "testID": "storage-models"},
    {"op": "screenshot", "name": "J7-01-privacy-storage"},
    {"op": "assertText", "text": "0 B", "testID": "storage-chats", "absent": True},
    {"op": "assertText", "text": "0 B", "testID": "storage-documents", "absent": True},
    {"op": "assertText", "text": "0 B", "testID": "storage-models", "absent": True},
])

# J8: Delete everything with models kept (pass 27's e-delete-everything and e2-cold-relaunch)
write("j8-delete-everything", "J8: Delete everything, models kept (the box not ticked); Welcome with no banner.", [
    {"op": "deeplink", "url": "/settings/storage"},
    {"op": "waitFor", "testID": "storage", "timeoutMs": 10000},
    {"op": "sleep", "ms": 1500},
    {"op": "value", "testID": "storage-chats"},
    {"op": "value", "testID": "storage-documents"},
    {"op": "value", "testID": "storage-models"},
    {"op": "screenshot", "name": "J8-01-before-delete"},
    {"op": "press", "testID": "storage-delete-all"},
    {"op": "waitFor", "testID": "wipe-sheet", "timeoutMs": 10000},
    {"op": "sleep", "ms": 800},
    {"op": "value", "testID": "wipe-sheet"},
    {"op": "value", "testID": "wipe-models"},
    {"op": "screenshot", "name": "J8-02-wipe-sheet"},
    {"op": "press", "testID": "wipe-step1"},
    {"op": "waitFor", "testID": "wipe-step2", "timeoutMs": 5000},
    {"op": "sleep", "ms": 500},
    {"op": "press", "testID": "wipe-step2"},
    {"op": "sleep", "ms": 10000},
    {"op": "screenshot", "name": "J8-03-after-delete"},
    {"op": "waitFor", "testID": "onboarding-welcome", "timeoutMs": 30000},
    {"op": "assertText", "text": "could not be opened", "absent": True},
    {"op": "waitFor", "testID": "banner-repair", "gone": True, "timeoutMs": 3000},
])
write("j8b-cold-relaunch", "J8b: a cold relaunch after the wipe keeps Welcome, no banner; the run sweeps Documents/qa.", [
    {"op": "waitFor", "testID": "onboarding-welcome", "timeoutMs": 120000},
    {"op": "sleep", "ms": 3000},
    {"op": "screenshot", "name": "J8-04-cold-relaunch"},
    {"op": "value", "testID": "onboarding-welcome"},
    {"op": "assertText", "text": "could not be opened", "absent": True},
    {"op": "waitFor", "testID": "banner-repair", "gone": True, "timeoutMs": 3000},
    {"op": "cleanup"},
])
print("written")
