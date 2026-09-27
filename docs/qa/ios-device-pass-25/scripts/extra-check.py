#!/usr/bin/env python3
"""Pass 24's addition to analyze.py and cut-check.py (both unchanged): what round 113 claims to fix that they do not measure.

usage: extra-check.py <dir with result-*.json> -> one row per run, writes extra-check.json next to the results.
- echo: four words in a row of the retry/Continue instruction in any snapshot (on screen, even if taken back later).
- restart: a numbered list whose numbers go down across other lines ("8. …" / "Voici une autre sélection…" / "1. …"),
  with the lines between; cut-check's "renumbered" only sees two items back to back.
- itemHead: an item said again once its parenthesis or its gloss after a colon is dropped ("Dolphin" and "Dolphin
  (multiple species)", "sein (to be)" and "sein (to exist/remain)", "sein: zu begehren" and "sein: zu führen").
- inlineTwice: an item of an inline numbered list ("1. 간장, 2. 김치, …" on one line) said again; analyze.py reads
  only line items.
- suffixBlock: 3+ list items in a row that are earlier items in the same order with the same few characters added
  ("11. תל אביב-המערב" … after "1. תל אביב" …).
- itemExtended: an item that says an earlier item of 3+ words whole and adds a tail ("4. Un gadget portable
  (smartwatch, bracelet) pour suivre vos passions." then "11. … pour suivre vos passions et les événements importants.").
- tailProse: the guard cut (or showed its notice) and the answer ends in a line that is not an item right after a list
  item (fr-list's restarted intro, ko-list's "다음은 다음 단계입니다." in pass 23).
"""
import glob, json, os, re, sys

INSTRUCTION = "Continue exactly where you stopped. Do not repeat what you already wrote."
WORDS = re.findall(r"[a-z]+", INSTRUCTION.lower())
GRAMS = {" ".join(WORDS[i:i + 4]) for i in range(len(WORDS) - 3)}
NUM = re.compile(r"^\s*(\d{1,3})[.)]\s+(\S.*)$")
MARK = re.compile(r"^\s*(?:[-*+•]|\d{1,3}[.)、．])\s+")


def snaps_of(r):
    return [st["value"]["props"]["source"] for st in r["steps"]
            if st["op"] == "value" and st.get("value") and isinstance(st["value"].get("props", {}).get("source"), str)]


def echo(text):
    w = re.findall(r"[a-z]+", text.lower())
    return sorted({" ".join(w[i:i + 4]) for i in range(len(w) - 3)} & GRAMS)


def restarts(text):
    out, prev, between = [], None, []
    for line in text.split("\n"):
        if not line.strip():
            continue
        m = NUM.match(line)
        if m:
            n = int(m.group(1))
            if prev and n <= prev[0]:
                out.append({"from": prev[1][:50], "to": line.strip()[:50], "between": [b[:80] for b in between]})
            prev, between = (n, line.strip()), []
        elif prev and not line.startswith((" ", "\t")):
            between.append(line.strip())
    return out


def head(line):
    s = MARK.sub("", line)
    s = re.sub(r"[*_`]", "", s)
    s = re.sub(r"\s*[(（].*$", "", s).strip().lower()
    head_ = re.split(r"\s*[:：]\s", s, maxsplit=1)[0]
    if head_ != s and len(head_.split()) <= 3:
        s = head_
    return s.rstrip(".!?。！？:：;,，、 ")


def item_heads(text):
    seen, dup = {}, {}
    for line in text.split("\n"):
        if MARK.match(line):
            h = head(line)
            if h:
                seen[h] = seen.get(h, 0) + 1
                if seen[h] > 1:
                    dup[h] = seen[h]
    return dup


INLINE = re.compile(r"(?:^|[,，、;]\s*)\d{1,3}[.)]\s*([^,，、;\n]+)")


def inline_twice(text):
    seen, dup = {}, {}
    for line in text.split("\n"):
        items = [head(x) for x in INLINE.findall(line)]
        if len(items) < 3:
            continue
        for h in items:
            if h:
                seen[h] = seen.get(h, 0) + 1
                if seen[h] > 1:
                    dup[h] = seen[h]
    return dup


def suffix_block(text):
    items = [head(l) for l in text.split("\n") if MARK.match(l)]
    best = None
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            k, add = 0, None
            while j + k < len(items) and i + k < j:
                a, b = items[i + k], items[j + k]
                extra = b[len(a):] if b.startswith(a) and len(b) > len(a) else b[:len(b) - len(a)] if b.endswith(a) and len(b) > len(a) else None
                if not a or extra is None or len(extra) > 12 or (add is not None and extra != add):
                    break
                add, k = extra, k + 1
            if k >= 3 and (not best or k > best["items"]):
                best = {"items": k, "first": i + 1, "again": j + 1, "added": add}
    return best


def item_extended(text):
    items = [re.sub(r"\s+", " ", re.sub(r"[*_`]", "", MARK.sub("", l))).strip().lower().rstrip(".!?。！？ ")
             for l in text.split("\n") if MARK.match(l)]
    out = []
    for j, b in enumerate(items):
        for i in range(j):
            a = items[i]
            if len(a.split()) >= 3 and b != a and b.startswith(a):
                out.append({"item": i + 1, "again": j + 1, "text": a[:70]})
                break
    return out


def tail_prose(text):
    lines = [l for l in text.split("\n") if l.strip()]
    tail = []
    while lines and not MARK.match(lines[-1]) and not lines[-1].startswith((" ", "\t")):
        tail.insert(0, lines.pop().strip())
    return tail if lines and tail else []


def cut_or_notice(r):
    return any("[chat] loop cut" in e for e in r["errors"]) or any(
        st["op"] == "waitFor" and not st["ok"] and "loop-notice" in (st.get("detail") or "") for st in r["steps"])


def main():
    d = sys.argv[1]
    rows = []
    for p in sorted(glob.glob(os.path.join(d, "result-*.json"))):
        r = json.load(open(p))
        snaps = snaps_of(r)
        if not snaps:
            continue
        final = snaps[-1]
        rows.append({
            "run": os.path.basename(p)[len("result-"):-len(".json")],
            "echoOnScreen": sorted({g for s in snaps for g in echo(s)}),
            "echoInFinal": echo(final),
            "restart": restarts(final),
            "itemHeadTwice": item_heads(final),
            "inlineTwice": inline_twice(final),
            "suffixBlock": suffix_block(final),
            "itemExtended": item_extended(final),
            "tailProse": [t[:80] for t in tail_prose(final)] if cut_or_notice(r) else [],
        })
    json.dump(rows, open(os.path.join(d, "extra-check.json"), "w"), ensure_ascii=False, indent=1)
    for x in rows:
        flags = [k for k in ("echoOnScreen", "restart", "itemHeadTwice", "inlineTwice", "suffixBlock", "itemExtended", "tailProse") if x[k]]
        print(f"{x['run']:34} {','.join(flags) or '-'}")
        for k in flags:
            print(f"   {k}: {json.dumps(x[k], ensure_ascii=False)[:240]}")


if __name__ == "__main__":
    main()
