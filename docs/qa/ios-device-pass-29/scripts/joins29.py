#!/usr/bin/env python3
"""Writes raw/j2-joins.txt from the three J2 result files, in the format of docs/qa/continue-prefill/joins.txt.
Run from docs/qa/ios-device-pass-29. 'stopped' is the first assistant-text value (after Stop), 'final' the second
(after Continue); kept = final starts with stopped exactly."""
import json, sys

RUNS = [(1, "tack", "Explain in 8 sentences how a sailing ship tacks against the wind."),
        (2, "habits", "Write a 10-item list of study habits."),
        (3, "knight", "Tell a short story about a knight who fears the dark."),
        (4, "tack2", "Explain in 8 sentences how a sailing ship tacks against the wind.")]

head = sys.argv[1] if len(sys.argv) > 1 else ""
lines = [head,
         "Each run: new chat (Chats, new-chat, start-chat), ask, Stop 1.0 s after the answer text appeared, Continue, wait until the answer ended.",
         '"stopped" is the answer text on screen after Stop; "final" is the answer text on screen after Continue; ⟦…⟧ marks where the continuation starts.',
         '"kept" is whether the final text starts with the stopped text exactly (the stopped text unchanged on screen).',
         '"console": the twin is a Release build (__DEV__ false) and llamaRn.ts logs no continue line, so the bridge exposes no llama.rn console line; the ledger of the resumed turn is given instead (the ledger\'s prompt tokens are llama.rn\'s tokens_evaluated).',
         ""]
summary = []
for n, key, prompt in RUNS:
    r = json.load(open(f"raw/result-j2-continue-{n}.json"))
    steps = json.load(open(f"scripts/j2-continue-{n}.json"))["steps"]
    got = {s["i"]: s for s in r["steps"]}
    reads = [(i, st["testID"]) for i, st in enumerate(steps) if st["op"] == "value"]
    def val(i):
        s = got.get(i)
        return s["value"]["text"] if s and s.get("ok") and s.get("value") else None
    chip = val(reads[0][0]) or "?"
    texts = [i for i, t in reads if t == "assistant-text"]
    stopped, final = val(texts[0]) or "", val(texts[1]) or ""
    led = [f"{t.replace('ledger-', '')} {val(i)}" for i, t in reads if t.startswith("ledger-")]
    kept = final.startswith(stopped)
    cont = final[len(stopped):] if kept else None
    first8 = " ".join(cont.split()[:8]) if cont is not None else "(not computed: the final text does not start with the stopped text)"
    lines.append(f"=== r{n}-{key} · {prompt}")
    lines.append(f"kept: {'true' if kept else 'false'} · new chat by: new-chat button · chip: {chip.strip()}")
    lines.append(f"first 8 words after the cut: {first8}")
    lines.append(f"console: not exposed · ledger of the resumed turn: {' · '.join(x.strip() for x in led)}")
    lines.append(f"--- stopped ({len(stopped)} chars)")
    lines.append(stopped)
    lines.append(f"--- final ({len(final)} chars)")
    lines.append(stopped + "⟦" + cont + "⟧" if kept else final)
    lines.append("")
    summary.append({"run": n, "key": key, "kept": kept, "stoppedChars": len(stopped), "finalChars": len(final),
                    "stoppedTail": stopped[-60:], "continuationHead": (cont or "")[:80], "first8": first8, "ledger": led,
                    "ok": r.get("ok"), "failed": r.get("failed"), "errors": r.get("errors")})
open("raw/j2-joins.txt", "w").write("\n".join(lines).rstrip("\n") + "\n")
json.dump(summary, open("raw/j2-joins.json", "w"), indent=1, ensure_ascii=False)
for s in summary:
    print(json.dumps(s, ensure_ascii=False))
