# Generates the two simulator scripts (en, then pt-BR on the same install) for the QA bridge (scripts/ios-qa.mjs).
import json

j1 = json.load(open("../../ios-build-45/scripts/sim/j1-onboard.json"))["steps"]
onboard = [s for s in j1[: next(i for i, s in enumerate(j1) if s.get("op") == "type")] if s.get("testID") != "model-source-fast"]

def answer(text, name):
    return [
        {"op": "type", "testID": "composer-input", "text": text}, {"op": "send"}, {"op": "sleep", "ms": 2500},
        {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 300000}, {"op": "sleep", "ms": 2000},
        {"op": "screenshot", "name": name}, {"op": "dump", "name": name},
    ]

def surfaces(p):
    return [
        *answer("What can you do?" if p == "en" else "O que você pode fazer?", f"{p}-01-capabilities"),
        {"op": "press", "testID": "model-chip"}, {"op": "waitFor", "testID": "model-sheet", "timeoutMs": 10000}, {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": f"{p}-02-model-sheet"}, {"op": "dump", "name": f"{p}-02-model-sheet"},
        {"op": "press", "testID": "model-sheet-close"}, {"op": "sleep", "ms": 1500},
        {"op": "press", "testID": "open-chats"}, {"op": "waitFor", "testID": "close-chats", "timeoutMs": 10000}, {"op": "sleep", "ms": 1500},
        {"op": "press", "testID": "new-chat"}, {"op": "waitFor", "testID": "new-chat-sheet", "timeoutMs": 10000}, {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": f"{p}-03-new-chat-sheet"}, {"op": "dump", "name": f"{p}-03-new-chat-sheet"},
        {"op": "press", "testID": "new-chat-sheet-close"}, {"op": "sleep", "ms": 1500},
        {"op": "press", "testID": "open-personas"}, {"op": "waitFor", "testID": "persona-add", "timeoutMs": 10000}, {"op": "press", "testID": "persona-add"},
        {"op": "waitFor", "testID": "persona-icon-spark", "timeoutMs": 10000}, {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": f"{p}-04-persona-icons"}, {"op": "dump", "name": f"{p}-04-persona-icons"},
        {"op": "press", "testID": "personas-sheet-close"}, {"op": "sleep", "ms": 1500},
        {"op": "deeplink", "url": "/settings"}, {"op": "waitFor", "testID": "row-about", "timeoutMs": 15000}, {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": f"{p}-05-settings"}, {"op": "dump", "name": f"{p}-05-settings"},
        {"op": "deeplink", "url": "/proof"}, {"op": "waitFor", "testID": "proof", "timeoutMs": 15000}, {"op": "sleep", "ms": 1500},
        {"op": "value", "testID": "proof-delivery-builtin"}, {"op": "value", "testID": "perm-network"},
        {"op": "screenshot", "name": f"{p}-06-proof"}, {"op": "dump", "name": f"{p}-06-proof"},
        {"op": "scrollTo", "testID": "perm-network"}, {"op": "sleep", "ms": 1000}, {"op": "screenshot", "name": f"{p}-07-proof-permissions"},
        {"op": "deeplink", "url": "/settings/about"}, {"op": "waitFor", "testID": "about", "timeoutMs": 15000}, {"op": "sleep", "ms": 1500},
        {"op": "screenshot", "name": f"{p}-08-about"}, {"op": "dump", "name": f"{p}-08-about"},
        {"op": "deeplink", "url": "/"}, {"op": "waitFor", "testID": "composer-input", "timeoutMs": 15000}, {"op": "sleep", "ms": 1500},
    ]

en = onboard + surfaces("en")
pt = [{"op": "deeplink", "url": "/settings/language"}, {"op": "waitFor", "testID": "lang-pt-BR", "timeoutMs": 15000}, {"op": "press", "testID": "lang-pt-BR"},
      {"op": "sleep", "ms": 2000}, {"op": "deeplink", "url": "/"}, {"op": "waitFor", "testID": "composer-input", "timeoutMs": 15000}, {"op": "sleep", "ms": 1500}] + surfaces("pt")
for name, steps in (("a11y-en", en), ("a11y-pt", pt)):
    json.dump({"_": f"a11y-i18n-43 {name}", "steps": steps}, open(f"{name}.json", "w"), ensure_ascii=False, indent=1)
