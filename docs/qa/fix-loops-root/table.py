"""Builds the before/after tables from runs/*.json (F413-F415). Usage: python3 table.py before|after"""
import json, sys, statistics, glob, os, re
DATA = re.compile(r'^\s*[\[{|<]|"[^"\n]*"\s*:|[;{\[(]\s*$|^\s*(?:"[^"\n]*"|[\d.+-]+|true|false|null)\s*,\s*$')
BULLET = re.compile(r'^\s*(?:[-*+•]|\d{1,3}[.)、．])\s+')
TAIL = re.compile(r'[\s.!?。！？．…]+$')
SEG = re.compile(r"(?<=[\n.!?。！？])")
def segments(text):
    """A sentence or line of 24+ code points said twice in one answer, even with other text between."""
    code = re.sub(r"```[\s\S]*?(?:```|$)", "", text or "")
    segs = [TAIL.sub('', BULLET.sub('', x.strip())).strip() for x in SEG.split(code)]
    segs = [x for x in segs if len(x) >= 24 and re.search(r"[^\W\d_]", x) and not DATA.search(x)]
    worst = None
    for x in set(segs):
        c = segs.count(x)
        if c > 1 and (not worst or c > worst["copies"]):
            worst = {"kind": "segment", "copies": c, "unit": x}
    return worst
def merge(a, b):
    if not a: return b
    if not b: return a
    return a if a["copies"] >= b["copies"] else b
D = os.path.dirname(os.path.abspath(__file__))
phase = sys.argv[1]
def fmt(x):
    return f"{x['kind']} x{x['copies']} `{x['unit'][:36].replace(chr(10), '⏎').replace('|', '¦')}`" if x else "–"
out = []
files = sorted(glob.glob(f"{D}/runs/{phase}-*.json"), key=lambda f: ("fast" in f, "t0.2" in f))
out.append("| Model | Temp | Runs | Loops at the source | Runs with a repeat on screen | Most copies on screen | Cut by the guard | Silent retries | Notices | tok/s (median) |")
out.append("|---|---|---|---|---|---|---|---|---|---|")
detail = []
for f in files:
    d = json.load(open(f)); rows = d["rows"]; model = d["model"]; t = d.get("temperature", 0.7)
    for r in rows:
        if r["kind"] == "asked-repeat":
            continue
        r["source"] = merge(r["source"], segments(r["text"]))
        if phase == "before":
            if not r["old"]["cut"]: r["old"]["shownMax"] = merge(r["old"]["shownMax"], segments(r["text"]))
        else:
            r["now"]["shownMax"] = merge(r["now"]["shownMax"], segments(r["now"]["final"]))
    src = [r for r in rows if r["source"]]
    if phase == "before":
        vis = [r for r in rows if r["old"]["shownMax"]]
        most = max([r["old"]["shownMax"]["copies"] for r in vis], default=0)
        cut = sum(r["old"]["cut"] for r in rows); retries = "–"; notices = cut
    else:
        vis = [r for r in rows if r["now"]["shownMax"]]
        most = max([r["now"]["shownMax"]["copies"] for r in vis], default=0)
        retries = sum(r["now"]["retries"] for r in rows); notices = sum(r["now"]["cut"] for r in rows)
        cut = sum(1 for r in rows if r["now"]["retries"] or r["now"]["cut"])
    tps = statistics.median([r["tps"] for r in rows if r["tps"]])
    out.append(f"| {model} | {t} | {len(rows)} | {len(src)} | {len(vis)} | {most} | {cut} | {retries} | {notices} | {tps:.0f} |")
    for r in rows:
        shown = r["old"]["shownMax"] if phase == "before" else r["now"]["shownMax"]
        extra = "" if phase == "before" else f" · retries {r['now']['retries']}{' · notice' if r['now']['cut'] else ''}"
        if r["source"] or shown or (phase != "before" and (r["now"]["retries"] or r["now"]["cut"])):
            detail.append(f"| {model} | {t} | {r['id']} #{r['seed']} | {fmt(r['source'])} | {fmt(shown)}{' (then cut)' if phase == 'before' and r['old']['cut'] else ''}{extra} |")
print("\n".join(out))
print()
print("| Model | Temp | Prompt #seed | Repetition in the raw answer | What reached the screen |")
print("|---|---|---|---|---|")
print("\n".join(detail))
