#!/usr/bin/env python3
"""Measures every snapshot of each loop run's answer with a yardstick independent of the guard (after fix-loops-root/stress.test.ts).

usage: analyze.py <dir with result-*.json> -> prints one row per run and writes loop-rows.json next to the results.
A snapshot is the answer's raw Markdown (`props.source`) as the bridge read it, about once a second while it streamed, plus the final.
"""
import glob, json, os, re, sys, unicodedata

WIDE = re.compile(r"[぀-ヿ㐀-鿿가-힯]")
MARK = re.compile(r"^\s*(?:[-*+•]|\d{1,3}[.)、．])\s*")


def has_letter(s):
    return any(unicodedata.category(c).startswith("L") for c in s)


def back_to_back(text, allowed=1):
    """Any unit of 12+ code points (6+ CJK) twice in a row, or 4-11 with a letter three times: the worst one."""
    s = list(re.sub(r"```[\s\S]*?(?:```|$)", "\0", text).replace("\t", " "))
    s = list(re.sub(r" +", " ", "".join(s)))
    n = len(s)
    worst = None
    for p in range(4, min(400, n // 2) + 1):
        j = 0
        while j + p < n:
            if s[j] != s[j + p]:
                j += 1
                continue
            a = j
            while j + p < n and s[j] == s[j + p]:
                j += 1
            copies = (j - a + p) // p
            unit = "".join(s[a:a + p])
            if not has_letter(unit) or "\0" in unit:
                continue
            if any(p % q == 0 and unit == "".join(s[a + q:a + q + p]) for q in range(1, p)):
                continue
            wide = len(WIDE.findall(unit))
            long_ = p >= 12 or (p >= 6 and wide >= 3)
            if (long_ and copies > allowed) or (not long_ and copies >= max(3, allowed + 1)):
                cand = {"unit": unit.strip(), "copies": copies, "kind": "long" if long_ else "short"}
                if not worst or copies > worst["copies"] or (copies == worst["copies"] and len(cand["unit"]) > len(worst["unit"])):
                    worst = cand
    return worst


def norm(line):
    line = MARK.sub("", line)
    line = re.sub(r"[*_`#>]", "", line)
    line = re.sub(r"\s+", " ", line).strip().lower()
    return line.rstrip(".!?。！？:：;,，、 ")


def sentences(text):
    out = []
    for line in text.split("\n"):
        if not line.strip() or line.strip().startswith("|"):
            continue
        for part in re.split(r"(?<=[.!?。！？])\s+|(?<=[。！？])", line):
            k = norm(part)
            if len(k) >= 24 and has_letter(k):
                out.append(k)
    return out


def repeated_sentences(text):
    seen, rep = {}, {}
    for k in sentences(text):
        seen[k] = seen.get(k, 0) + 1
        if seen[k] > 1:
            rep[k] = seen[k]
    return rep


def list_items(text):
    return [norm(l) for l in text.split("\n") if MARK.match(l) and norm(l)]


def duplicate_items(text):
    seen, dup = {}, {}
    for k in list_items(text):
        seen[k] = seen.get(k, 0) + 1
        if seen[k] > 1:
            dup[k] = seen[k]
    return dup


def repeated_block(text, least=3):
    """The longest run of 3+ list items said again later in the same order, whatever their numbers: the loop a numbered list makes."""
    items = list_items(text)
    best = None
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            k = 0
            while j + k < len(items) and i + k < j and items[i + k] == items[j + k]:
                k += 1
            if k >= least and (not best or k > best["items"]):
                best = {"items": k, "first": i + 1, "again": j + 1, "block": items[i:i + k]}
    return best


def run_row(path):
    r = json.load(open(path))
    snaps = []
    for st in r["steps"]:
        v = st.get("value")
        if st["op"] == "value" and v and isinstance(v.get("props", {}).get("source"), str):
            snaps.append(v["props"]["source"])
    total = len(snaps)
    # Text that was on screen and then taken back (a retry's trim): characters past the common prefix with the next snapshot.
    taken = 0
    for a, b in zip(snaps, snaps[1:]):
        if not b.startswith(a):
            k = 0
            while k < min(len(a), len(b)) and a[k] == b[k]:
                k += 1
            taken = max(taken, len(a) - k)
    final = snaps[-1] if snaps else ""
    # A repeat in a snapshot stays in any longer text that starts with it, so only a snapshot the next one does not extend is measured.
    snaps = [x for i, x in enumerate(snaps) if i == len(snaps) - 1 or not snaps[i + 1].startswith(x)]
    worst_b2b, sent_max, sent_unit, dup_max, dup_unit, block = None, 1, None, 1, None, None
    for s in snaps:
        b = back_to_back(s)
        bare = back_to_back(re.sub(r"\*\*|__|(?<!\w)[*_](?!\s)|`", "", s))
        if bare and (not b or bare["copies"] > b["copies"]):
            b = dict(bare, kind=bare["kind"] + " (bold markers removed)")
        if b and (not worst_b2b or b["copies"] > worst_b2b["copies"]):
            worst_b2b = b
        for k, c in repeated_sentences(s).items():
            if c > sent_max:
                sent_max, sent_unit = c, k
        blk = repeated_block(s)
        if blk and (not block or blk["items"] > block["items"]):
            block = blk
        for k, c in duplicate_items(s).items():
            if c > dup_max:
                dup_max, dup_unit = c, k
    notice = any(st["op"] == "waitFor" and not st["ok"] and "loop-notice" in (st.get("detail") or "") for st in r["steps"])
    retries = [e for e in r["errors"] if "[chat] loop retry" in e]
    cuts = [e for e in r["errors"] if "[chat] loop cut" in e]
    return {
        "run": os.path.basename(path)[len("result-"):-len(".json")],
        "snapshots": total,
        "chars": len(final),
        "backToBack": worst_b2b,
        "sentenceRepeat": {"unit": sent_unit, "copies": sent_max} if sent_unit else None,
        "duplicateItem": {"unit": dup_unit, "copies": dup_max} if dup_unit else None,
        "repeatedBlock": block,
        "takenBack": taken,
        "silentRetries": len(retries),
        "cuts": len(cuts),
        "notice": notice,
        "loopLines": retries + cuts,
        "stepsOk": r["passed"],
        "stepsFailed": r["failed"],
        "final": final,
    }


def main():
    d = sys.argv[1]
    rows = [run_row(p) for p in sorted(glob.glob(os.path.join(d, "result-l0*.json")))]
    json.dump(rows, open(os.path.join(d, "loop-rows.json"), "w"), ensure_ascii=False, indent=1)
    print(f"{'run':34} {'snaps':>5} {'chars':>6} {'b2b':>4} {'sent':>4} {'block':>5} {'dupItem':>7} {'taken':>5} {'retry':>5} {'cut':>3} notice")
    for x in rows:
        b = x["backToBack"]["copies"] if x["backToBack"] else 0
        s = x["sentenceRepeat"]["copies"] if x["sentenceRepeat"] else 0
        di = x["duplicateItem"]["copies"] if x["duplicateItem"] else 0
        bl = x["repeatedBlock"]["items"] if x["repeatedBlock"] else 0
        print(f"{x['run']:34} {x['snapshots']:>5} {x['chars']:>6} {b:>4} {s:>4} {bl:>5} {di:>7} {x['takenBack']:>5} {x['silentRetries']:>5} {x['cuts']:>3} {x['notice']}")


if __name__ == "__main__":
    main()
