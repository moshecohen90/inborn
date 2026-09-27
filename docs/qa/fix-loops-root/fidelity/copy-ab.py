# Does DRY/presence penalize copying from the prompt? Copy-fidelity A/B on llama-server (same code as wllama).
import json, sys, urllib.request, difflib, re, concurrent.futures as cf
PORTS = {"instant": 8957, "fast": 8958}
SYS = "You are a helpful assistant. Answer in the language of the user's message."
QA = open(sys.argv[1] + "/quote-ja.txt").read()
QE = open(sys.argv[1] + "/quote-en.txt").read()
CODE_BUG = "function sumEven(numbers) {\n  let total = 0;\n  for (let i = 0; i <= numbers.length; i++) {\n    if (numbers[i] % 2 === 0) {\n      total += numbers[i];\n    }\n  }\n  return total;\n}"
CODE_OK = CODE_BUG.replace("i <= numbers.length", "i < numbers.length")
PARA_BAD = "The comittee met on Tuesday to discuss the new budjet for the library. After a long debate, they agreed to increase funding for childrens books by fifteen percent and to extend opening hours on weekends."
PARA_OK = "The committee met on Tuesday to discuss the new budget for the library. After a long debate, they agreed to increase funding for children's books by fifteen percent and to extend opening hours on weekends."
INV = 'Document:\n"Invoice INV-2024-00871 was issued by Kestrel Maritime Logistics GmbH to Oyelaran-Whitfield Consulting on 14 March 2024 for 12,480.50 EUR. It was signed by Dr. Margarethe Oyelaran-Whitfield."\n\nWhat is the invoice number, who issued it, and who signed it?'
HE = 'מסמך:\n"חברת אורנים טכנולוגיות בע״מ נוסדה בשנת 1987 בחיפה על ידי ד״ר יהודית בן־צבי. בחברה עובדים 214 עובדים."\n\nמי ייסדה את החברה, באיזו שנה, וכמה עובדים יש בה? צטט את המשפט מהמסמך.'
def sim(a, b): return round(difflib.SequenceMatcher(None, a, b).ratio(), 3)
def code_of(t):
    m = re.search(r"```[a-z]*\n(.*?)```", t, re.S); return (m.group(1) if m else t).strip()
TASKS = {
  "code-fix": ("Fix the bug in this function and return the whole corrected function:\n```js\n" + CODE_BUG + "\n```", lambda t: sim(code_of(t), CODE_OK)),
  "proofread": ("Fix the spelling mistakes in this paragraph and return only the corrected paragraph:\n\n" + PARA_BAD, lambda t: sim(t.strip().strip('"'), PARA_OK)),
  "quote-ja": (QA, lambda t: sum(x in t for x in ("青葉商事", "三百八十二名", "一九六二年")) / 3),
  "quote-en": (QE, lambda t: sum(x in t for x in ("three hundred and eighty-two", "1962")) / 2),
  "invoice": (INV, lambda t: sum(x in t for x in ("INV-2024-00871", "Kestrel Maritime Logistics GmbH", "Margarethe Oyelaran-Whitfield")) / 3),
  "he-quote": (HE, lambda t: sum(x in t for x in ("אורנים טכנולוגיות", "1987", "יהודית בן", "214")) / 4),
}
BASE = dict(temperature=0.7, top_p=0.9, repeat_penalty=1.1, repeat_last_n=64)
DRY = dict(dry_multiplier=0.8, dry_base=1.75, dry_allowed_length=2, dry_penalty_last_n=4096, dry_sequence_breakers=["\n", ":", "\"", "*"])
PF = dict(presence_penalty=0.15, frequency_penalty=0.05)
SETTINGS = {"none (r97)": {}, "DRY+pres/freq (r107)": {**DRY, **PF}, "DRY only": DRY, "pres/freq only": PF}
def run(model, task, setting, seed):
    body = {"messages": [{"role": "system", "content": SYS}, {"role": "user", "content": TASKS[task][0]}], "max_tokens": 400, "seed": seed,
            "chat_template_kwargs": {"enable_thinking": False}, **BASE, **SETTINGS[setting]}
    req = urllib.request.Request(f"http://127.0.0.1:{PORTS[model]}/v1/chat/completions", json.dumps(body).encode(), {"content-type": "application/json"})
    t = json.load(urllib.request.urlopen(req, timeout=300))["choices"][0]["message"]["content"]
    return dict(model=model, task=task, setting=setting, seed=seed, score=TASKS[task][1](t), text=t)
SEEDS = range(1, 7)
jobs = [(m, k, s, sd) for m in PORTS for k in TASKS for s in SETTINGS for sd in SEEDS]
rows = []
with cf.ThreadPoolExecutor(2) as ex:
    futs = {}
    for m in PORTS:
        pass
    rows = list(ex.map(lambda j: run(*j), jobs))
json.dump(rows, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
for m in PORTS:
    print(f"\n{m}: mean fidelity over {len(SEEDS)} seeds (1.0 = exact copy)")
    print("| task | " + " | ".join(SETTINGS) + " |")
    for k in TASKS:
        cells = []
        for s in SETTINGS:
            v = [r["score"] for r in rows if r["model"] == m and r["task"] == k and r["setting"] == s]
            cells.append(f"{sum(v)/len(v):.2f}")
        print(f"| {k} | " + " | ".join(cells) + " |")
