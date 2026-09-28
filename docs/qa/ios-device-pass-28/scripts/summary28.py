#!/usr/bin/env python3
"""Pass 28's rows in one JSON: per result file, passed/failed, each step's clock, every value read, and the failures.
Usage: summary28.py <raw dir> -> JSON on stdout."""
import glob, json, os, sys

rows = {}
for path in sorted(glob.glob(os.path.join(sys.argv[1], "result-j*.json"))):
    r = json.load(open(path))
    steps = r["steps"]
    rows[os.path.basename(path)[7:-5]] = {
        "startedAt": r["startedAt"], "finishedAt": r["finishedAt"], "passed": r["passed"], "failed": r["failed"],
        "values": [{"i": s["i"], "text": s["value"]["text"]} for s in steps if s["op"] == "value" and s.get("value")],
        "slow": [{"i": s["i"], "op": s["op"], "ms": s["ms"], "detail": (s.get("detail") or "")[:80]} for s in steps if s["ms"] >= 3000],
        "errors": r["errors"],
    }
print(json.dumps(rows, indent=1, ensure_ascii=False))
