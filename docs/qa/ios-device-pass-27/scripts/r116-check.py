#!/usr/bin/env python3
"""Pass 27's addition to analyze.py, cut-check.py, extra-check.py, end-check.py and r115-check.py (all unchanged): what round 116 claims.

usage: r116-check.py <dir with result-*.json> -> one row per run, writes r116-check.json next to the results.
Each check reads the final answer, and the ones marked (shown) also every snapshot, since a copy may be shown and taken back.
- nearItem (shown): two list items of 5+ words whose 5-letter word stems (lower case, no accents) match at 70% or more as a
  multiset. Round 116 cuts 6+ words at 80% with three more conditions, so this is wider.
- foldedHead (shown): two item heads (cut where round 114 cuts them) that differ as written but match once one leading
  article is dropped and each word loses a plural ending (-s, -es, -x, -ies, -en, Hebrew ים/ות, or a final vowel, as
  Italian i/e against o/a), leaving 4+ letters as round 116 does. Any number of words, so wider than round 116's 2.
- commaTwice (shown): a word or phrase said twice in one unnumbered inline list (a line with 4+ short parts between ",",
  "、", "，" or ";"), which the numbered-item rules do not read.
- inlineNoSep: two numbered items of one inline list with no separator between them ("15. 파 16. 오징어").
- listIntoProse: an inline list whose last part is a sentence at least twice as long as its longest item, with no full
  stop between them ("鳥取これらはすべて日本の主要都市です。"). The list needs 5+ inner parts of at most 15 code points.
"""
import glob, json, os, re, sys, unicodedata

ITEM = re.compile(r"^\s*(?:\*\*|__)?(?:\d{1,3}[.)．]|[-*+•])(?:\*\*|__)?\s+(\S.*)$")
HEAD_END = re.compile(r"\s*[(（\[［]|[:：](?=\s|$)|\s[–—-]\s|\s(?:→|->)\s|[,，](?=\s)|\s·|·\s")
DET = re.compile(r"^(?:l['’]\s*|(?:un|une|des|le|la|les|el|los|las|una|unos|unas|a|an|the|der|die|das|ein|eine|einen|il|lo|i|gli|o|os|as|um|uma)\s+)", re.I)
SEP = re.compile(r"[,，、;；]")
INLINE_NUM = re.compile(r"(?:^|[,，、;；]\s*|\s)(\d{1,3})[.)]\s")
END = re.compile(r"[.!?。！？]")


def snaps_of(r):
    return [st["value"]["props"]["source"] for st in r["steps"]
            if st["op"] == "value" and st.get("value") and isinstance(st["value"].get("props", {}).get("source"), str)]


def clean(s):
    return re.sub(r"\s+", " ", re.sub(r"\*\*|__|[*_`]", "", s)).strip()


def items(text):
    out = []
    for line in text.split("\n"):
        m = ITEM.match(line)
        if m:
            out.append(clean(m.group(1)))
    return out


def stems(s):
    words = re.findall(r"[\w'’]+", unicodedata.normalize("NFD", s.lower()))
    return ["".join(c for c in w if not unicodedata.combining(c))[:5] for w in words]


def near_items(text):
    its = [i for i in items(text) if len(stems(i)) >= 5]
    hits = []
    for j, b in enumerate(its):
        sb = stems(b)
        for a in its[:j]:
            sa = stems(a)
            if a == b:
                continue
            pool = list(sa)
            common = 0
            for w in sb:
                if w in pool:
                    pool.remove(w)
                    common += 1
            share = common / max(len(sa), len(sb))
            if share >= 0.7:
                hits.append({"first": a[:90], "again": b[:90], "share": round(share, 2)})
                break
    return hits


def head(s):
    m = HEAD_END.search(s)
    h = s[:m.start()] if m and m.start() > 0 else s
    return h.strip().rstrip(".!?。！？:：;,，、 ").lower()


def fold_word(w):
    for suf, rep in (("ies", "y"), ("es", ""), ("s", ""), ("x", ""), ("en", ""), ("ים", ""), ("ות", "")):
        if w.endswith(suf) and len(w) - len(suf) >= 4:
            return w[: len(w) - len(suf)] + rep
    if len(w) >= 5 and w[-1] in "ieoa":
        return w[:-1]
    return w


def folded(h):
    h = DET.sub("", h, count=1)
    return " ".join(fold_word(w) for w in h.split())


def folded_heads(text):
    hs = [head(i) for i in items(text)]
    hits = []
    for j, b in enumerate(hs):
        for a in hs[:j]:
            if a != b and a and b and folded(a) == folded(b):
                hits.append({"first": a[:80], "again": b[:80]})
                break
    return hits


def comma_twice(text):
    hits = []
    for line in text.split("\n"):
        if ITEM.match(line) and not SEP.search(line):
            continue
        parts = [clean(p).strip(" .。:：") for p in SEP.split(line)]
        short = [p for p in parts if p and len(p) <= 40 and len(p.split()) <= 5]
        if len(short) < 4:
            continue
        seen = {}
        for k, p in enumerate(parts):
            key = p.lower()
            if key in seen and len(key) >= 2:
                hits.append({"said": p, "at": [seen[key] + 1, k + 1], "line": line.strip()[:160]})
            seen.setdefault(key, k)
    return hits


def inline_no_sep(text):
    hits = []
    for line in text.split("\n"):
        nums = list(INLINE_NUM.finditer(line))
        if len(nums) < 3:
            continue
        for a, b in zip(nums, nums[1:]):
            between = line[a.end():b.start() + 1]
            if int(b.group(1)) == int(a.group(1)) + 1 and not SEP.search(between) and "\n" not in between:
                hits.append(line[max(0, a.start() - 10):b.end() + 12].strip())
    return hits


def list_into_prose(text):
    hits = []
    for line in text.split("\n"):
        parts = SEP.split(line)
        body = [p.strip() for p in parts[1:-1]]
        if len(body) < 5 or max(len(p) for p in body) > 15:
            continue
        last = parts[-1].strip()
        longest = max(len(p) for p in body)
        first_clause = END.split(last)[0]
        if len(first_clause) >= 2 * longest and len(first_clause) >= 8:
            hits.append(line.strip()[-120:])
    return hits


def union(snaps, fn, key):
    seen, out = set(), []
    for s in snaps:
        for h in fn(s):
            k = json.dumps(h[key] if isinstance(h, dict) and key else h, ensure_ascii=False)
            if k not in seen:
                seen.add(k)
                out.append(h)
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
        rows.append({
            "run": os.path.basename(p)[len("result-"):-len(".json")],
            "chars": len(final),
            "nearItem": near_items(final),
            "nearItemShown": union(snaps, near_items, "again"),
            "foldedHead": folded_heads(final),
            "foldedHeadShown": union(snaps, folded_heads, "again"),
            "commaTwice": comma_twice(final),
            "commaTwiceShown": union(snaps, comma_twice, "said"),
            "inlineNoSep": inline_no_sep(final),
            "listIntoProse": list_into_prose(final),
        })
    json.dump(rows, open(os.path.join(d, "r116-check.json"), "w"), ensure_ascii=False, indent=1)
    keys = ("nearItem", "nearItemShown", "foldedHead", "foldedHeadShown", "commaTwice", "commaTwiceShown", "inlineNoSep", "listIntoProse")
    for x in rows:
        flags = [k for k in keys if x[k]]
        print(f"{x['run']:34} {','.join(flags) or '-'}")
        for k in flags:
            print(f"   {k}: {json.dumps(x[k], ensure_ascii=False)[:400]}")


if __name__ == "__main__":
    main()
