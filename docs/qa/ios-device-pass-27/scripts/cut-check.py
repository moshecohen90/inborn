#!/usr/bin/env python3
"""Pass 23's addition to analyze.py: is each seam the guard made clean on screen?

usage: cut-check.py <dir with result-l0*.json> -> one row per run, writes cut-check.json next to the results.
A seam is where a snapshot was taken back or where the guard's own "[chat] loop retry: kept N chars" line says it
kept N characters (a silent retry, even one no snapshot saw), or where the final answer ends under a notice (a cut).
Flags, judged on the text the phone showed last:
- bare-number: the kept text ends a line with only an item number ("18." / "18)" / "- ").
- open-bold: the line holding the seam has an odd number of "**".
- half-item: the retry's text goes on inside the same line the kept text left mid-sentence (no sentence end, no line break).
- list-to-prose: the kept text ended in a list and the text after a retry's seam holds no list item.
- renumbered: anywhere in the final answer, a numbered item directly follows one with the same or a higher number
  ("22. Sponges" then "10. Sponges"), the mark a retry leaves when it restarts the list.
"""
import glob, json, os, re, sys

ITEM = re.compile(r"^\s*(?:[-*+•]|\d{1,3}[.)、．])\s+\S")
BARE = re.compile(r"(?:^|\n)\s*(?:[-*+•]|\d{1,3}[.)、．])\s*$")
END = re.compile(r"[.!?。！？:：)\]」』”\"*`|]\s*$")


def snaps_of(r):
    out = []
    for st in r["steps"]:
        v = st.get("value")
        if st["op"] == "value" and v and isinstance(v.get("props", {}).get("source"), str):
            out.append(v["props"]["source"])
    return out


def seam_flags(kept, after, retry):
    flags = []
    last_line = kept.split("\n")[-1]
    if BARE.search(kept):
        flags.append("bare-number")
    line_at_seam = last_line + after.split("\n")[0]
    if line_at_seam.count("**") % 2:
        flags.append("open-bold")
    if retry and last_line.strip() and not END.search(last_line) and after and not after.startswith("\n"):
        flags.append("half-item")
    kept_lines = [l for l in kept.split("\n") if l.strip()]
    if retry and kept_lines and ITEM.match(kept_lines[-1]) or (retry and len(kept_lines) > 1 and ITEM.match(kept_lines[-2]) and not last_line.strip()):
        rest = [l for l in after.split("\n") if l.strip()]
        if rest and not any(ITEM.match(l) for l in rest):
            flags.append("list-to-prose")
    return flags


NUM = re.compile(r"^\s*(\d{1,3})[.)]\s+\S")


def renumbered(text):
    out, prev = [], None
    for line in text.split("\n"):
        if not line.strip():
            continue
        m = NUM.match(line)
        if m and prev is not None and int(m.group(1)) <= prev[0]:
            out.append(f"{prev[1].strip()[:40]} -> {line.strip()[:40]}")
        prev = (int(m.group(1)), line) if m else None
    return out


def utf16_index(text, n):
    """The guard counts JavaScript string length (UTF-16 units); this is the Python index of that many units."""
    units = 0
    for i, c in enumerate(text):
        if units >= n:
            return i
        units += 2 if ord(c) > 0xFFFF else 1
    return len(text)


def run_row(path):
    r = json.load(open(path))
    snaps = snaps_of(r)
    final = snaps[-1] if snaps else ""
    seams = []
    for a, b in zip(snaps, snaps[1:]):
        if not b.startswith(a):
            k = 0
            while k < min(len(a), len(b)) and a[k] == b[k]:
                k += 1
            kept, after = final[:k], final[k:]
            seams.append({"kind": "retry", "at": k, "takenBack": a[k:][:160], "keptTail": kept[-120:], "after": after[:200], "flags": seam_flags(kept, after, True)})
    seen = {x["at"] for x in seams}
    for e in r["errors"]:
        m = re.search(r"\[chat\] loop retry: kept (\d+) chars", e)
        if not m:
            continue
        k = utf16_index(final, int(m.group(1)))
        if k in seen or k >= len(final):
            continue
        kept, after = final[:k], final[k:]
        seams.append({"kind": "retry", "at": k, "takenBack": "", "keptTail": kept[-120:], "after": after[:200], "flags": seam_flags(kept, after, True)})
    notice = any(st["op"] == "waitFor" and not st["ok"] and "loop-notice" in (st.get("detail") or "") for st in r["steps"])
    cuts = [e for e in r["errors"] if "[chat] loop cut" in e]
    if notice or cuts:
        seams.append({"kind": "cut", "at": len(final), "keptTail": final[-160:], "after": "", "flags": seam_flags(final, "", False)})
    ren = renumbered(final)
    flags = sorted({f for s in seams for f in s["flags"]} | ({"renumbered"} if ren else set()))
    return {"run": os.path.basename(path)[len("result-"):-len(".json")], "seams": seams, "renumbered": ren, "flags": flags}


def main():
    d = sys.argv[1]
    rows = [run_row(p) for p in sorted(glob.glob(os.path.join(d, "result-l0*.json")))]
    json.dump(rows, open(os.path.join(d, "cut-check.json"), "w"), ensure_ascii=False, indent=1)
    for x in rows:
        print(f"{x['run']:34} seams {len(x['seams'])} flags {','.join(x['flags']) or '-'}")
        for r in x["renumbered"]:
            print(f"   renumbered {r!r}")
        for s in x["seams"]:
            print(f"   {s['kind']:5} kept …{s['keptTail'][-70:]!r} | after {s['after'][:70]!r} {s['flags']}")


if __name__ == "__main__":
    main()
