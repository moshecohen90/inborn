#!/usr/bin/env python3
"""Writes the device pass 23 bridge scripts (pass 22's set, unchanged): one script per answer, so each run's report holds that answer's loop lines."""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
STRESS = json.load(open(os.path.join(HERE, "../../fix-loops-root/stress-prompts.json")))
PROMPT = {p["id"]: p["user"] for p in STRESS}

# Looped at the source on Instant before round 107 (runs/before-instant*.json): the app's 0.7 first, then 0.2.
T07 = ["ja-nenji", "he-explain", "list30-animals", "es-list", "fr-list", "poem-refrainless", "list25-verbs-de", "math-long-div"]
T02 = ["he-list", "ko-list", "ja-list-cities", "es-list", "fr-list", "math-long-div", "list30-animals", "ja-nenji"]
SAMPLES = 45


def write(name, steps):
    with open(os.path.join(HERE, f"{name}.json"), "w") as f:
        json.dump({"steps": steps}, f, ensure_ascii=False, indent=1)


def new_chat(persona=None):
    s = [
        {"op": "deeplink", "url": "/chats"},
        {"op": "waitFor", "testID": "new-chat", "timeoutMs": 15000},
        {"op": "press", "testID": "new-chat"},
        {"op": "waitFor", "testID": "start-chat", "timeoutMs": 10000},
    ]
    if persona:
        s += [{"op": "press", "testID": f"persona-chip-{persona}"}, {"op": "sleep", "ms": 300}]
    s += [
        {"op": "press", "testID": "start-chat"},
        {"op": "waitFor", "testID": "composer-input", "timeoutMs": 30000},
        {"op": "sleep", "ms": 1500},
    ]
    return s


def ask(text, shot, sample=True):
    s = [{"op": "type", "testID": "composer-input", "text": text}, {"op": "send"}, {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 240000}]
    if sample:
        for _ in range(SAMPLES):
            s += [{"op": "value", "testID": "assistant-text"}, {"op": "sleep", "ms": 700}]
    s += [
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 400000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "assistant-text"},
        {"op": "screenshot", "name": shot},
        {"op": "waitFor", "testID": "loop-notice", "gone": True, "timeoutMs": 500},
    ]
    return s


def ledger(pro=False):
    s = [
        {"op": "press", "testID": "ledger-toggle"},
        {"op": "sleep", "ms": 800},
        {"op": "value", "testID": "ledger-model"},
        {"op": "value", "testID": "ledger-msPerToken"},
        {"op": "value", "testID": "ledger-context"},
    ]
    if pro:
        s += [
            {"op": "setTier", "tier": "pro"},
            {"op": "sleep", "ms": 1200},
            {"op": "value", "testID": "ledger-tokPerSec"},
            {"op": "value", "testID": "ledger-ttft"},
            {"op": "value", "testID": "ledger-tokens"},
            {"op": "value", "testID": "ledger-time"},
            {"op": "screenshot", "name": "A02-ledger-detailed"},
            {"op": "setTier", "tier": "free"},
            {"op": "sleep", "ms": 800},
        ]
    return s


def main(persona02=None):
    # (a) onboarding on the fresh twin, first answer, the ledger.
    write("a-first-answer", [
        {"op": "waitFor", "testID": "onboarding-welcome", "timeoutMs": 120000},
        {"op": "sleep", "ms": 1500},
        {"op": "press", "testID": "onboarding-continue"},
        {"op": "waitFor", "testID": "onboarding-model", "timeoutMs": 30000},
        {"op": "sleep", "ms": 2500},
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
        *ask("In two sentences, what is a lighthouse for?", "A01-first-answer", sample=False),
        *ledger(pro=True),
    ])
    # (b) the loop guard: the app's own temperature, two tries per prompt.
    for pid in T07:
        for n in (1, 2):
            write(f"l07-{pid}-{n}", new_chat() + ask(PROMPT[pid], f"L07-{pid}-{n}"))
    # (b) the same guard under a custom persona at 0.2, where the model loops most (fix-loops-root/before.md).
    # Free keeps up to three custom personas, so the twin stays on Free like the runs above.
    write("p-persona-02", [
        {"op": "deeplink", "url": "/chats"},
        {"op": "waitFor", "testID": "open-personas", "timeoutMs": 15000},
        {"op": "press", "testID": "open-personas"},
        {"op": "waitFor", "testID": "persona-add", "timeoutMs": 10000},
        {"op": "press", "testID": "persona-add"},
        {"op": "waitFor", "testID": "persona-name", "timeoutMs": 10000},
        {"op": "type", "testID": "persona-name", "text": "Assistant 0.2"},
        {"op": "type", "testID": "persona-prompt", "text": "You are a helpful, concise assistant."},
        {"op": "type", "testID": "persona-temperature", "text": "0.2"},
        {"op": "press", "testID": "persona-save"},
        {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": "P01-persona-0.2"},
        {"op": "dump", "name": "personas"},
        {"op": "press", "testID": "personas-sheet-close"},
        {"op": "sleep", "ms": 800},
        {"op": "press", "testID": "new-chat"},
        {"op": "waitFor", "testID": "start-chat", "timeoutMs": 10000},
        {"op": "dump", "name": "new-chat-sheet"},
        {"op": "press", "testID": "new-chat-sheet-close"},
    ])
    if persona02:
        for pid in T02:
            write(f"l02-{pid}", new_chat(persona02) + [{"op": "value", "testID": "persona-line"}] + ask(PROMPT[pid], f"L02-{pid}"))
    # (c) repetition the user asked for: three tries, each in a new chat (pass 22 ran them as c-asked-repeat + c2).
    fox = "Repeat exactly this sentence five times, each on its own line: The quick brown fox jumps over the lazy dog."
    write("c-asked-repeat", sum((new_chat() + ask(fox, f"C0{n}-asked-repeat", sample=False) for n in (1, 2, 3)), []))
    # (d) Continue after Stop.
    write("d-continue", new_chat() + [
        {"op": "type", "testID": "composer-input", "text": "Write a long, detailed history of the spice trade between Asia and Europe, in at least eight paragraphs."},
        {"op": "send"},
        {"op": "waitFor", "testID": "assistant-text", "timeoutMs": 240000},
        {"op": "sleep", "ms": 7000},
        {"op": "press", "testID": "stop"},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "assistant-text"},
        {"op": "screenshot", "name": "K01-stopped"},
        {"op": "waitFor", "testID": "continue", "timeoutMs": 10000},
        {"op": "press", "testID": "continue"},
        {"op": "sleep", "ms": 1500},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 400000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "assistant-text"},
        {"op": "screenshot", "name": "K02-continued"},
    ])
    # (f) one .txt attached, then Privacy & storage.
    write("f-documents", new_chat() + [
        {"op": "devPrompt", "lines": ["attach: greenhouse-notes.txt"]},
        {"op": "waitFor", "testID": "attached-docs", "timeoutMs": 30000},
        {"op": "sleep", "ms": 3000},
        {"op": "value", "testID": "attached-docs"},
        {"op": "deeplink", "url": "/documents"},
        {"op": "waitFor", "testID": "documents-screen", "timeoutMs": 15000},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "documents-screen"},
        {"op": "screenshot", "name": "F01-documents-screen"},
        {"op": "deeplink", "url": "/settings/storage"},
        {"op": "waitFor", "testID": "storage", "timeoutMs": 10000},
        {"op": "sleep", "ms": 2000},
        {"op": "value", "testID": "storage-chats"},
        {"op": "value", "testID": "storage-documents"},
        {"op": "value", "testID": "storage-models"},
        {"op": "screenshot", "name": "F02-privacy-storage"},
        {"op": "assertText", "text": "0 B", "testID": "storage-documents", "absent": True},
        {"op": "assertText", "text": "253 B", "testID": "storage-documents"},
    ])
    # (e) Delete everything, then a cold relaunch.
    write("e-delete-everything", [
        {"op": "deeplink", "url": "/settings/storage"},
        {"op": "waitFor", "testID": "storage", "timeoutMs": 10000},
        {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "storage-chats"},
        {"op": "value", "testID": "storage-documents"},
        {"op": "screenshot", "name": "E01-before-delete"},
        {"op": "press", "testID": "storage-delete-all"},
        {"op": "waitFor", "testID": "wipe-sheet", "timeoutMs": 10000},
        {"op": "value", "testID": "wipe-models"},
        {"op": "press", "testID": "wipe-step1"},
        {"op": "waitFor", "testID": "wipe-step2", "timeoutMs": 5000},
        {"op": "sleep", "ms": 500},
        {"op": "press", "testID": "wipe-step2"},
        {"op": "sleep", "ms": 10000},
        {"op": "screenshot", "name": "E02-after-delete"},
        {"op": "waitFor", "testID": "onboarding-welcome", "timeoutMs": 30000},
        {"op": "assertText", "text": "could not be opened", "absent": True},
        {"op": "waitFor", "testID": "banner-repair", "gone": True, "timeoutMs": 3000},
    ])
    write("e2-cold-relaunch", [
        {"op": "waitFor", "testID": "onboarding-welcome", "timeoutMs": 120000},
        {"op": "sleep", "ms": 3000},
        {"op": "screenshot", "name": "E03-cold-relaunch"},
        {"op": "value", "testID": "onboarding-welcome"},
        {"op": "assertText", "text": "could not be opened", "absent": True},
        {"op": "waitFor", "testID": "banner-repair", "gone": True, "timeoutMs": 3000},
        {"op": "cleanup"},
    ])


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
