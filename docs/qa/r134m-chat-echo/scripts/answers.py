import json, sys, glob, os
"""Prints, per dump, the last user message and the last assistant answer of a probe run."""
for tag in sys.argv[2:]:
    r = sorted(glob.glob(f"{sys.argv[1]}/result-m3-probe-{tag}-*.json"), key=os.path.getmtime)[-1]
    d = json.load(open(r))
    print(f"=== {tag} ({os.path.basename(r)})")
    for e in d.get("errors", []):
        if "rule-echo" in e: print("   LOG", e)
    for s in d["steps"]:
        if s["op"] != "dump": continue
        users = [n["text"] for n in s["nodes"] if n.get("testID") == "user-message"]
        ans = [n["text"] for n in s["nodes"] if n.get("testID") == "assistant-text"]
        print(f"--- {s['detail']}  Q: {users[-1] if users else '?'}")
        print(ans[-1] if ans else "(no answer)")
