#!/usr/bin/env python3
"""Writes pass 31's bridge scripts into this folder. Run from docs/qa/ios-device-pass-31/scripts.
J1 is pass 30's. J6a reads the Extensions section of the native vault on a fresh twin, where Fast and Sharp are not
installed (round 126, F456: no Install for a pack whose model is absent, "Install {model} first" instead). J5 is pass
30's document row on Instant, with round 126's check (F457): no passage label on the answer's first line. J6b starts the
Fast download from the model sheet and reads its progress at 60 s; J6c (run only if that read shows 2 MB/s or more)
waits for Use and reads the vault again: Fast's pack now offers Install, Sharp's still reads "Install Sharp first"."""
import json

# F449's narration, as the web saw it
NARRATION = ["instruction", "rules", "general knowledge", "documents list", "NOT_FOUND", "<<<"]
# F457: the passage header the prompt writes, "[1] office-hours.txt · part 1"
LABEL = "office-hours.txt · part"
PACKS = ("vision-qwen35", "vision-qwen35-2b", "vision-qwen35-4b")

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

def write(name, note, steps):
    with open(f"{name}.json", "w") as f:
        json.dump({"_": note, "steps": steps}, f, indent=1, ensure_ascii=False)
        f.write("\n")

def read_pack(pid):
    return [
        {"op": "value", "testID": f"model-card-{pid}"},
        {"op": "value", "testID": f"model-spec-{pid}"},
        {"op": "value", "testID": f"model-status-{pid}"},
    ]

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

write("j6a-vault-packs", "J6 (round 126, F456) on a fresh twin, Fast and Sharp not installed: the Extensions section, top to bottom. Instant's pack is included; Fast's and Sharp's show no Install or Import and read 'Install Fast first' / 'Install Sharp first', the size kept on the spec line.", [
    {"op": "deeplink", "url": "/vault?focus=embed-e5"},
    {"op": "sleep", "ms": 3500},
    {"op": "screenshot", "name": "J6-01-extensions-top"},
    {"op": "deeplink", "url": "/vault?focus=vision-qwen35-2b"},
    {"op": "sleep", "ms": 3500},
    {"op": "screenshot", "name": "J6-02-extensions-fast-pack"},
    {"op": "deeplink", "url": "/vault?focus=vision-qwen35-4b"},
    {"op": "sleep", "ms": 3500},
    {"op": "screenshot", "name": "J6-03-extensions-sharp-pack"},
    *[s for p in PACKS for s in read_pack(p)],
    {"op": "assertText", "text": "Included with the app", "testID": "model-status-vision-qwen35"},
    {"op": "assertText", "text": "Install Fast first", "testID": "model-status-vision-qwen35-2b"},
    {"op": "assertText", "text": "Install Sharp first", "testID": "model-status-vision-qwen35-4b"},
    {"op": "assertText", "text": "668 MB", "testID": "model-spec-vision-qwen35-2b"},
    {"op": "assertText", "text": "672 MB", "testID": "model-spec-vision-qwen35-4b"},
    *[{"op": "waitFor", "testID": f"{a}-{p}", "gone": True, "timeoutMs": 1000} for p in PACKS[1:] for a in ("install", "import")],
    {"op": "dump", "name": "vault-extensions-fresh"},
])

write("j5-documents", "J5 on Instant (round 126, F457): office-hours.txt attached; the matching answer's first line is the sentence with 555-0134, not a '[1] office-hours.txt · part 1' label, and the source chip shows under it; the non-matching one answers with 'Answered without them'.", [
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
    {"op": "assertText", "text": LABEL, "testID": "assistant-text", "absent": True},
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

write("j6b-fast-probe", "J6, second half, the probe: Fast from the model sheet; its progress read when it appears and 60 s later. J6c runs only if that read shows 2 MB/s or more.", [
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
    {"op": "screenshot", "name": "J6-04-fast-60s"},
])

write("j6c-after-fast", "J6, second half: Fast installed (Use on the sheet, at most 12 min from the start), then the vault again: Fast's pack offers Install · 668 MB, Sharp's still reads 'Install Sharp first'.", [
    {"op": "waitFor", "testID": "model-sheet-use-fast", "timeoutMs": 640000},
    {"op": "value", "testID": "model-sheet-use-fast"},
    {"op": "screenshot", "name": "J6-05-fast-installed"},
    {"op": "deeplink", "url": "/vault?focus=vision-qwen35-2b"},
    {"op": "sleep", "ms": 3500},
    {"op": "screenshot", "name": "J6-06-fast-pack-after-fast"},
    {"op": "deeplink", "url": "/vault?focus=vision-qwen35-4b"},
    {"op": "sleep", "ms": 3500},
    {"op": "screenshot", "name": "J6-07-sharp-pack-after-fast"},
    *[s for p in PACKS for s in read_pack(p)],
    {"op": "value", "testID": "install-vision-qwen35-2b"},
    {"op": "assertText", "text": "668 MB", "testID": "install-vision-qwen35-2b"},
    {"op": "assertText", "text": "Install Fast first", "testID": "model-card-vision-qwen35-2b", "absent": True},
    {"op": "assertText", "text": "Install Sharp first", "testID": "model-status-vision-qwen35-4b"},
    {"op": "waitFor", "testID": "install-vision-qwen35-4b", "gone": True, "timeoutMs": 1000},
    {"op": "assertText", "text": "Included with the app", "testID": "model-status-vision-qwen35"},
    {"op": "dump", "name": "vault-extensions-after-fast"},
])
