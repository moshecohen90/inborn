#!/usr/bin/env python3
"""Pass 26's addition to analyze.py, cut-check.py, extra-check.py and end-check.py (all unchanged): what round 115 claims.

usage: r115-check.py <dir with result-*.json> -> one row per run, writes r115-check.json next to the results.
- fence: per fenced block of the final answer, the line (not a rule like "--------", not blank) said most often and its count,
  the longest back-to-back run of one unit of 1 to 3 lines (a number line between copies may change), and whether
  "```" closes the block on its own line. fenceShown adds the same for every snapshot, since a copy may be shown and
  taken back.
- retryInFence: a loop retry fired while the text it kept held an open fence (round 115 sends no retry into a block).
- misspelt: two list items whose heads have 2+ words and differ in one word by one substitution, insertion or deletion
  of a code point. It reads every list and any word, so it is wider than round 115's rule (a shared word, 5+ heads).
- join: ",." ";." "，。" or "；。" anywhere in the final answer, with its context (round 115's Continue seam).
- noticeNoLoop: the loop notice is on screen but the guard logged no retry and no cut.
"""
import glob, json, os, re, sys

NUMBER_LINE = re.compile(r"^[-+−]?\s*\d[\d\s.,]*$")
ITEM = re.compile(r"^\s*(?:\*\*|__)?(?:\d{1,3}[.)．]|[-*+•])(?:\*\*|__)?\s+(\S.*)$")
HEAD_END = re.compile(r"\s*[(（\[［]|[:：](?=\s|$)|\s[–—-]\s|\s(?:→|->)\s|[,，](?=\s)|\s·|·\s")
JOIN = re.compile(r"[,;，；][ \t]*[.。]")
RULE = re.compile(r"^[-=_~*+|]+$")


def snaps_of(r):
    return [st["value"]["props"]["source"] for st in r["steps"]
            if st["op"] == "value" and st.get("value") and isinstance(st["value"].get("props", {}).get("source"), str)]


def blocks(text):
    """Each fenced block: its lines and whether a closing ``` line ends it."""
    out, cur, open_ = [], None, False
    for line in text.split("\n"):
        if line.strip().startswith("```"):
            if open_:
                out.append((cur, True))
                cur, open_ = None, False
            else:
                cur, open_ = [], True
            continue
        if open_:
            cur.append(line)
    if open_:
        out.append((cur, False))
    return out


def run_of(lines):
    """Longest back-to-back run of a 1-3 line unit; a number line may change between copies."""
    best = (0, "")
    norm = [("#" if NUMBER_LINE.match(l.strip()) else l.strip()) for l in lines]
    for size in (1, 2, 3, 4):
        for i in range(len(norm)):
            unit = norm[i:i + size]
            if len(unit) < size or all(u in ("", "#") for u in unit):
                continue
            n, j = 1, i + size
            while norm[j:j + size] == unit:
                n, j = n + 1, j + size
            if n > best[0]:
                best = (n, " / ".join(lines[i:i + size]).strip())
    return best


def fence_rows(text):
    rows = []
    for lines, closed in blocks(text):
        counts = {}
        for l in lines:
            s = l.strip()
            if s and not RULE.match(s):
                counts[s] = counts.get(s, 0) + 1
        top = max(counts.items(), key=lambda kv: kv[1]) if counts else ("", 0)
        n, unit = run_of(lines)
        rows.append({"lines": len(lines), "closed": closed, "mostSaidLine": top[0], "mostSaidCount": top[1],
                     "backToBack": n, "unit": unit[:80]})
    return rows


def head(words):
    words = re.sub(r"\*\*|__|[*_`]", "", words).strip()
    m = HEAD_END.search(words)
    h = words[:m.start()] if m and m.start() > 0 else words
    return re.sub(r"\s+", " ", h).strip().rstrip(".!?。！？:：;,，、 ").lower()


def one_edit(a, b):
    if a == b or abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b)) == 1
    if len(a) > len(b):
        a, b = b, a
    i = 0
    while i < len(a) and a[i] == b[i]:
        i += 1
    return a[i:] == b[i + 1:]


def misspelt(text):
    heads = []
    for line in text.split("\n"):
        m = ITEM.match(line)
        if m:
            heads.append((head(m.group(1)), line.strip()[:60]))
    hits = []
    for j, (h, line) in enumerate(heads):
        w = h.split()
        if len(w) < 2:
            continue
        for h0, line0 in heads[:j]:
            w0 = h0.split()
            if len(w0) != len(w):
                continue
            diff = [k for k in range(len(w)) if w[k] != w0[k]]
            if len(diff) == 1 and one_edit(w[diff[0]], w0[diff[0]]):
                hits.append({"first": line0, "again": line})
                break
    return hits


def kept_open_fence(r, snaps):
    out = []
    for e in r["errors"]:
        m = re.search(r"\[chat\] loop retry: kept (\d+) chars", e)
        if not m:
            continue
        n = int(m.group(1))
        src = next((s for s in snaps if len(s) >= n), snaps[-1] if snaps else "")
        kept = src[:n]
        if sum(1 for l in kept.split("\n") if l.strip().startswith("```")) % 2:
            out.append(n)
    return out


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
        shown = 0
        for s in snaps:
            for b in fence_rows(s):
                shown = max(shown, b["mostSaidCount"])
        rows.append({
            "run": os.path.basename(p)[len("result-"):-len(".json")],
            "chars": len(final),
            "retries": len(retries),
            "cuts": len(cuts),
            "cutLines": cuts,
            "notice": notice,
            "fence": fence_rows(final),
            "fenceShownMax": shown,
            "retryInFence": kept_open_fence(r, snaps),
            "misspelt": misspelt(final),
            "join": [final[max(0, m.start() - 40):m.end() + 40] for m in JOIN.finditer(final)],
            "noticeNoLoop": notice and not retries and not cuts,
        })
    json.dump(rows, open(os.path.join(d, "r115-check.json"), "w"), ensure_ascii=False, indent=1)
    for x in rows:
        flags = [k for k in ("fence", "retryInFence", "misspelt", "join", "noticeNoLoop") if x[k]]
        print(f"{x['run']:34} retry {x['retries']} cut {x['cuts']} notice {'yes' if x['notice'] else '-':3} {','.join(flags) or '-'}")
        for k in flags:
            print(f"   {k}: {json.dumps(x[k], ensure_ascii=False)[:400]}")
        if x["fence"]:
            print(f"   fenceShownMax (any snapshot): {x['fenceShownMax']}")


if __name__ == "__main__":
    main()
