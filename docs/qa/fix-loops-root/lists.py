import json,re,sys,statistics
IDS=["list30-animals","list50-names","list40-tips","list25-verbs-de","countries-europe","ja-list-cities","zh-list","ko-list","he-list","es-list","fr-list","cont-list","json-users","math-fib","list-100-numbers"]
def items(t):
    n=len(re.findall(r'(?m)^\s*(?:\d{1,3}[.)、．]|[-*•])\s+\S',t))
    return n
for model in ("instant","fast"):
  for t in ("","-t0.2"):
    b=json.load(open(f"runs/before-{model}{t}.json"))["rows"]; a=json.load(open(f"runs/after-{model}{t}.json"))["rows"]
    tot_b=tot_a=0; row=[]
    for i in IDS:
        nb=[items(r['text']) for r in b if r['id']==i]; na=[items(r['now']['final']) for r in a if r['id']==i]
        cb=statistics.mean([len(r['text']) for r in b if r['id']==i]); ca=statistics.mean([len(r['now']['final']) for r in a if r['id']==i])
        row.append(f"{i}:{sum(nb)/3:.0f}->{sum(na)/3:.0f} ({cb:.0f}->{ca:.0f}ch)")
        tot_b+=sum(nb); tot_a+=sum(na)
    print(model, t or "0.7", "items", tot_b, "->", tot_a); print("  "+"\n  ".join(row))
