#!/usr/bin/env python3
"""J2's seam check: for each Stop + Continue run, the stopped text, the continued text, whether the continued text
starts with the stopped one byte for byte, the join (last 60 chars before, first 60 after), a word said twice across
the seam (case-folded, marks stripped), and a restatement of the stopped sentence's last clause in the continuation's
first sentence (its last 4+ words found again). Usage: seam28.py <raw dir> -> JSON on stdout."""
import json, re, sys, glob, os

def values(path):
    r = json.load(open(path))
    return [s["value"]["text"] for s in r["steps"] if s["op"] == "value" and s.get("value") and s["ok"]]

def words(s):
    return [w for w in re.split(r"\s+", re.sub(r"[^\w\s'’-]", " ", s.lower())) if w]

out = []
for path in sorted(glob.glob(os.path.join(sys.argv[1], "result-j2-continue-*.json"))):
    v = values(path)
    if len(v) < 2:
        out.append({"run": os.path.basename(path), "error": "fewer than two values"}); continue
    stopped, cont = v[0], v[-1]
    starts = cont.startswith(stopped)
    added = cont[len(stopped):] if starts else None
    rec = {"run": os.path.basename(path), "stoppedChars": len(stopped), "continuedChars": len(cont), "startsWithStopped": starts,
           "stopped": stopped, "continued": cont}
    if added is not None:
        rec["join"] = stopped[-60:] + " ⟂ " + added[:60]
        before, after = words(stopped[-80:]), words(added[:80])
        rec["wordTwiceAtSeam"] = bool(before and after and before[-1] == after[0])
        last_sentence = re.split(r"(?<=[.!?])\s+", stopped.strip())[-1]
        tail = words(last_sentence)[-4:]
        first_sentence = re.split(r"(?<=[.!?])\s+", added.strip())[0] if added.strip() else ""
        fw = words(first_sentence)
        rec["stoppedClauseTail"] = " ".join(tail)
        rec["restatesStoppedClause"] = len(tail) >= 4 and any(fw[i:i + 4] == tail for i in range(len(fw) - 3))
        rec["commaFullStopJoin"] = bool(re.search(r"[,;]\s*\.", stopped[-3:] + added[:3]))
    out.append(rec)
print(json.dumps(out, indent=1, ensure_ascii=False))
