# Appends human grades to overrides.json. Lines: "<set> <model> <id> <sample> <grade> <reason>"
import json, sys, os
p = os.path.join(os.path.dirname(__file__), "overrides.json")
o = json.load(open(p)) if os.path.exists(p) else {}
for line in sys.stdin:
    line = line.strip()
    if not line or line.startswith("#"): continue
    s, m, i, n, g, why = line.split(" ", 5)
    for k in n.split(","):
        o[f"{s}|{m}|{i}|{k}"] = [int(g), why]
json.dump(o, open(p, "w"), ensure_ascii=False, indent=0, sort_keys=True)
print(len(o), "overrides")
