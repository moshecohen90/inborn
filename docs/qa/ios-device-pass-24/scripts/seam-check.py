#!/usr/bin/env python3
"""Row (d): does the text Continue added restate the stopped clause?

usage: seam-check.py <result-d-*.json>... -> one row per Stop/Continue pair, writes continue-seams.json next to the first.
For each pair the stopped text is the snapshot read right after Stop and the continued text the snapshot read after
Continue ended. It reports whether the continued text starts with the stopped text byte for byte, the join, and the
longest run of words of the stopped sentence's end found again in the continuation's first sentence (round 113 drops
5 words or 24 code points).
"""
import json, os, re, sys


def pairs(r):
    vals = [st["value"]["props"]["source"] for st in r["steps"]
            if st["op"] == "value" and st.get("value") and isinstance(st["value"].get("props", {}).get("source"), str)]
    return [(vals[i], vals[i + 1]) for i in range(0, len(vals) - 1, 2)]


def words(s):
    return re.findall(r"[\w'’-]+", s.lower())


def restated(stopped, added):
    last = re.split(r"(?<=[.!?])\s+", stopped.strip())[-1]
    first = re.split(r"(?<=[.!?])\s+", added.strip(), maxsplit=1)[0]
    a, b = words(last), words(first)
    best = []
    for n in range(len(a), 0, -1):
        tail = a[-n:]
        if any(b[i:i + n] == tail for i in range(len(b) - n + 1)):
            best = tail
            break
    return " ".join(best)


def main():
    rows = []
    for p in sys.argv[1:]:
        r = json.load(open(p))
        for stopped, final in pairs(r):
            k = 0
            while k < min(len(stopped), len(final)) and stopped[k] == final[k]:
                k += 1
            added = final[k:]
            over = restated(stopped[:k], added)
            rows.append({
                "run": os.path.basename(p)[len("result-"):-len(".json")],
                "startsWithStopped": final.startswith(stopped),
                "stoppedTail": stopped[-110:],
                "addedHead": added[:220],
                "restatedWords": over,
                "restated": len(over.split()) >= 5 or len(over) >= 24,
            })
    json.dump(rows, open(os.path.join(os.path.dirname(sys.argv[1]), "continue-seams.json"), "w"), ensure_ascii=False, indent=1)
    for x in rows:
        print(f"{x['run']:24} starts-with-stopped={x['startsWithStopped']} restated={x['restated']} ({x['restatedWords']!r})")
        print(f"   …{x['stoppedTail'][-80:]!r} + {x['addedHead'][:120]!r}")


if __name__ == "__main__":
    main()
