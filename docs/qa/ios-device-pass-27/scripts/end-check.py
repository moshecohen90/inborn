#!/usr/bin/env python3
"""Pass 25's addition to analyze.py, cut-check.py and extra-check.py (all unchanged): what round 114 claims.

usage: end-check.py <dir with result-*.json> -> one row per run, writes end-check.json next to the results.
- bareEnd: the final answer ends on a bare list marker, a lone number or a lone dash on its last line ("…\n21",
  "…\n-", "…\n**6.**"); round 114 trims it quietly.
- quietTrim: text shown and then taken back in a stress run (one answer per run) that logged no loop retry; the
  budget-end trim writes no log line.
- notice / retries / cuts: the loop notice on screen at the end, and the guard's own log lines.
- head114Twice: an item head said twice within one run of items, the head cut where round 114 cuts it: before the
  first " (", ": ", " – ", " — ", " - ", " → ", ", " or "·". A run is the items of one kind (numbered or bullet) at one
  indent, with blank and deeper lines between; any other line starts a new run. Items of an inline numbered list
  ("1. 간장, 2. 김치, …") are items of their own run. A head of a sub-list parent ("1. sein – present" followed by
  deeper lines) is a category and not counted.
"""
import glob, json, os, re, sys

BARE_END = re.compile(r"\n[ \t]*(?:\*\*|__)?(?:\d{1,3}[.)．]?|[-*•+])(?:\*\*|__)?[ \t]*$")
ITEM = re.compile(r"^([ \t]*)(?:(\d{1,3})[.)．]|([-*+•]))[ \t]+(\S.*)$")
HEAD_END = re.compile(r"\s*[(（\[［]|[:：](?=\s|$)|\s[–—-]\s|\s(?:→|->)\s|[,，](?=\s)|\s·|·\s")
INLINE = re.compile(r"(?:^|[,，、;；]\s*)(\d{1,3})[.)]\s*([^,，、;；\n]+)")


def snaps_of(r):
    return [st["value"]["props"]["source"] for st in r["steps"]
            if st["op"] == "value" and st.get("value") and isinstance(st["value"].get("props", {}).get("source"), str)]


def key(s):
    s = re.sub(r"\*\*|__|[*_`]", "", s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s.rstrip(".!?。！？:：;,，、 ")


def head(words):
    m = HEAD_END.search(words)
    h = words[:m.start()] if m and m.start() > 0 else words
    return key(h)


def runs(text):
    out, cur, kind = [], [], None
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if not line.strip():
            continue
        m = ITEM.match(line)
        inline = INLINE.findall(line) if m and m.group(2) else []
        if len(inline) >= 3:
            if cur:
                out.append(cur)
            out.append([(head(w), f"{n}. {w.strip()}"[:60], False) for n, w in inline])
            cur, kind = [], None
            continue
        if m:
            k = ("num" if m.group(2) else "bul", len(m.group(1).expandtabs(4)))
            if kind and (k[0] != kind[0] or k[1] < kind[1]) and k[1] <= kind[1]:
                out.append(cur)
                cur = []
            if kind and k[1] > kind[1]:
                if cur:
                    cur[-1] = (cur[-1][0], cur[-1][1], True)
                continue
            nxt = next((l for l in lines[i + 1:] if l.strip()), "")
            nm = ITEM.match(nxt)
            parent = bool(nm and len(nm.group(1).expandtabs(4)) > k[1])
            cur.append((head(m.group(4)), line.strip()[:60], parent))
            kind = k
        elif kind and line.startswith((" ", "\t")):
            continue
        else:
            if cur:
                out.append(cur)
            cur, kind = [], None
    if cur:
        out.append(cur)
    return out


def heads_twice(text):
    dup = []
    for run in runs(text):
        seen = {}
        for h, line, parent in run:
            if not h or parent:
                continue
            if h in seen:
                dup.append({"head": h, "first": seen[h], "again": line})
            else:
                seen[h] = line
    return dup


def main():
    d = sys.argv[1]
    rows = []
    for p in sorted(glob.glob(os.path.join(d, "result-*.json"))):
        r = json.load(open(p))
        snaps = snaps_of(r)
        if not snaps:
            continue
        final = snaps[-1]
        retries = [e for e in r["errors"] if "[chat] loop retry" in e]
        cuts = [e for e in r["errors"] if "[chat] loop cut" in e]
        notice = any(st["op"] == "waitFor" and not st["ok"] and "loop-notice" in (st.get("detail") or "") for st in r["steps"])
        trims = []
        if not retries and os.path.basename(p).startswith("result-l0"):
            for a, b in zip(snaps, snaps[1:]):
                if not b.startswith(a):
                    k = 0
                    while k < min(len(a), len(b)) and a[k] == b[k]:
                        k += 1
                    trims.append(a[k:][:80])
        m = BARE_END.search(final)
        rows.append({
            "run": os.path.basename(p)[len("result-"):-len(".json")],
            "chars": len(final),
            "bareEnd": m.group(0).strip() if m else "",
            "lastLine": final.rstrip().split("\n")[-1][-80:],
            "quietTrim": trims,
            "notice": notice,
            "retries": len(retries),
            "cuts": len(cuts),
            "head114Twice": heads_twice(final),
        })
    json.dump(rows, open(os.path.join(d, "end-check.json"), "w"), ensure_ascii=False, indent=1)
    for x in rows:
        flags = [k for k in ("bareEnd", "quietTrim", "head114Twice") if x[k]]
        print(f"{x['run']:34} retry {x['retries']} cut {x['cuts']} notice {'yes' if x['notice'] else '-':3} {','.join(flags) or '-'}  …{x['lastLine'][-40:]!r}")
        for k in flags:
            print(f"   {k}: {json.dumps(x[k], ensure_ascii=False)[:300]}")


if __name__ == "__main__":
    main()
