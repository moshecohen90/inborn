import json, urllib.request
P = ["Escribe 30 frases motivadoras cortas.", "הסבר לי בפירוט מה זה פוטוסינתזה.", "年次報告書の書き方を詳しく教えてください。", "Make a table of 5 orders. Each has an order ID in the format ORD-2024-000123 (six digits, increasing), a customer name and a total."]
BASE = dict(temperature=0.7, top_p=0.9, repeat_penalty=1.1, repeat_last_n=64, max_tokens=500, chat_template_kwargs={"enable_thinking": False})
ZERO = dict(dry_multiplier=0, dry_base=1.75, dry_allowed_length=2, dry_penalty_last_n=4096, dry_sequence_breakers=["\n", ":", "\"", "*"], presence_penalty=0, frequency_penalty=0)
same = total = 0
for port in (8957, 8958):
    for q in P:
        for seed in (1, 2, 3):
            out = []
            for extra in ({}, ZERO):
                body = {"messages": [{"role": "user", "content": q}], "seed": seed, **BASE, **extra}
                r = urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{port}/v1/chat/completions", json.dumps(body).encode(), {"content-type": "application/json"}), timeout=300)
                out.append(json.load(r)["choices"][0]["message"]["content"])
            total += 1; same += out[0] == out[1]
print(f"byte-identical answers, r97 request vs r107 answer request (explicit zeros): {same} of {total}")
