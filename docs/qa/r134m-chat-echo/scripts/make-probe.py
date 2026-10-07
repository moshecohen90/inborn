"""Writes m3-probe-<tag>.json: the J7 general questions plus "tell me about yourself" and "what can you do?" (round 134M)."""
import json, sys

# One question per chat: the bridge's dump reports the first node of each testID, so a chat holds the one answer read.
CHATS = [[q] for q in [
    "hey! what is this app?", "what's the weather like today?", "give me a pancake recipe", "how long do pancakes keep in the fridge?",
    "who won the last football World Cup?", "my 4 year old won't sleep, any tips?", "suggestion-draft", "tell me about yourself", "what can you do?",
]]

def probe(tag):
    steps = [{"op": "deeplink", "url": "/vault"}, {"op": "sleep", "ms": 10000}]
    n = 0
    for chat in CHATS:
        steps += [{"op": "deeplink", "url": "/chats"}, {"op": "waitFor", "testID": "new-chat", "timeoutMs": 15000}, {"op": "press", "testID": "new-chat"},
                  {"op": "waitFor", "testID": "start-chat", "timeoutMs": 10000}, {"op": "press", "testID": "start-chat"},
                  {"op": "waitFor", "testID": "composer-input", "timeoutMs": 30000}, {"op": "waitFor", "text": "Loading", "gone": True, "timeoutMs": 180000},
                  {"op": "sleep", "ms": 1500}, {"op": "value", "testID": "model-chip"}]
        for q in chat:
            n += 1
            if q.startswith("suggestion-"):
                steps += [{"op": "press", "testID": q}, {"op": "sleep", "ms": 1500}, {"op": "send"}]
            else:
                steps += [{"op": "type", "testID": "composer-input", "text": q}, {"op": "send"}]
            steps += [{"op": "sleep", "ms": 2500}, {"op": "waitFor", "testID": "stop", "gone": True, "timeoutMs": 600000}, {"op": "sleep", "ms": 2000},
                      {"op": "screenshot", "name": f"{tag}-{n:02d}"}, {"op": "dump", "name": f"{tag}-{n:02d}"}]
    return {"runId": f"m3-probe-{tag}", "_": "Round 134M: the J7 general questions + 'tell me about yourself' / 'what can you do?'. The shell writes `use <model>` to dev-vault.txt first.", "steps": steps}

for tag in sys.argv[1:]:
    json.dump(probe(tag), open(f"m3-probe-{tag}.json", "w"), indent=2)
