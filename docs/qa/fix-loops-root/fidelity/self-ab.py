# DRY and legitimate repetition INSIDE the answer (the prompt never contains the repeated text), llama-server.
import json, sys, re, urllib.request, subprocess, tempfile, os, concurrent.futures as cf
PORTS = {"instant": 8957, "fast": 8958}
SYS = "You are a helpful assistant. Answer in the language of the user's message."
def name_consistency(t):
    m = re.search(r"\*\*([^*\n]{8,60})\*\*", t) or re.search(r"\b((?:[A-Z][\w&'-]+\s){2,5}(?:[A-Z][\w&'-]+))", t)
    if not m: return 0.0
    n = m.group(1).strip(); mentions = t.count(n)
    return min(mentions, 4) / 4
def py_ok(t):
    m = re.search(r"```(?:python)?\n(.*?)```", t, re.S); code = m.group(1) if m else t
    try: compile(code, "x.py", "exec"); ok = 1
    except Exception: ok = 0
    return (ok + min(code.count("self.logger.info("), 3) / 3 + min(code.count("self.items"), 3) / 3) / 3
def ids(t):
    got = re.findall(r"\bORD-2024-\d{6}\b", t); return min(len(set(got)), 5) / 5
def he_name(t):
    return min(t.count("רחוב הנביאים 12, ירושלים") , 3) / 3
def ja_term(t):
    return min(t.count("国立研究開発法人"), 3) / 3
TASKS = {
  "self-name": ("Invent a fictional company with a long, unusual four-word name and write it in bold the first time. Then write four sentences about it, using the company's full name in every sentence.", name_consistency),
  "py-class": ("Write a Python class InventoryManager with methods add_item, remove_item and get_count. Every method must log its call with self.logger.info and read or update self.items. Only the code.", py_ok),
  "order-ids": ("Make a table of 5 orders. Each has an order ID in the format ORD-2024-000123 (six digits, increasing), a customer name and a total.", ids),
  "he-address": ("כתוב שלוש הודעות קצרות ללקוחות. בכל הודעה חייבת להופיע הכתובת המלאה: רחוב הנביאים 12, ירושלים.", he_name),
  "ja-term": ("「国立研究開発法人」という言葉を三回使って、短い説明文を書いてください。", ja_term),
}
BASE = dict(temperature=0.7, top_p=0.9, repeat_penalty=1.1, repeat_last_n=64)
DRY = dict(dry_multiplier=0.8, dry_base=1.75, dry_allowed_length=2, dry_penalty_last_n=4096, dry_sequence_breakers=["\n", ":", "\"", "*"])
PF = dict(presence_penalty=0.15, frequency_penalty=0.05)
SETTINGS = {"none (r97)": {}, "DRY+pres/freq (r107)": {**DRY, **PF}, "DRY only": DRY, "pres/freq only": PF}
def run(model, task, setting, seed):
    body = {"messages": [{"role": "system", "content": SYS}, {"role": "user", "content": TASKS[task][0]}], "max_tokens": 600, "seed": seed,
            "chat_template_kwargs": {"enable_thinking": False}, **BASE, **SETTINGS[setting]}
    req = urllib.request.Request(f"http://127.0.0.1:{PORTS[model]}/v1/chat/completions", json.dumps(body).encode(), {"content-type": "application/json"})
    t = json.load(urllib.request.urlopen(req, timeout=300))["choices"][0]["message"]["content"]
    return dict(model=model, task=task, setting=setting, seed=seed, score=TASKS[task][1](t), text=t)
SEEDS = range(1, 7)
def by_model(m): return [run(m, k, s, sd) for k in TASKS for s in SETTINGS for sd in SEEDS]
with cf.ThreadPoolExecutor(2) as ex: rows = [r for part in ex.map(by_model, PORTS) for r in part]
json.dump(rows, open(sys.argv[1], "w"), ensure_ascii=False, indent=1)
for m in PORTS:
    print(f"\n{m}: mean score over {len(SEEDS)} seeds (1.0 = every repeat exact)")
    print("| task | " + " | ".join(SETTINGS) + " |")
    for k in TASKS:
        print(f"| {k} | " + " | ".join(f"{sum(v)/len(v):.2f}" for v in ([r['score'] for r in rows if r['model']==m and r['task']==k and r['setting']==s] for s in SETTINGS)) + " |")
