import json,sys,glob,math
SP=sys.argv[1]; label=sys.argv[2]
keys=json.load(open(f'{SP}/embed-probe-keys.json'))
res=json.load(open(sorted(glob.glob(f'{SP}/{label}/result-embed-probe-*.json'))[-1]))
step=[s for s in res['steps'] if s['op']=='embedProbe'][0]
V=step['value']['props']['vectors']; M=json.load(open(f'{SP}/mac-vectors.json'))
fx=json.load(open('./packages/core/test/fixtures/rag/one-term-e5.json'))
cos=lambda a,b: sum(x*y for x,y in zip(a,b))/math.sqrt(sum(x*x for x in a)*sum(y*y for y in b))
K={k:i for i,k in enumerate(keys)}
out=[f"# {label}: {step['detail']}"]
out.append(f"same passage twice: cos(1st,2nd)={cos(V[0],V[1]):.4f}   same question twice: cos(1st,2nd)={cos(V[2],V[3]):.4f}")
out.append(f"vs Mac: passage 1st {cos(V[0],M[0]):.4f} 2nd {cos(V[1],M[1]):.4f} · question 1st {cos(V[2],M[2]):.4f} 2nd {cos(V[3],M[3]):.4f}")
qs=[i for i,k in enumerate(keys) if k.startswith('q:')]
pair=[cos(V[a],V[b]) for n,a in enumerate(qs) for b in qs[n+1:]]
pm=[cos(M[a],M[b]) for n,a in enumerate(qs) for b in qs[n+1:]]
out.append(f"40 different questions, pairwise cosine: phone min {min(pair):.4f} mean {sum(pair)/len(pair):.4f} max {max(pair):.4f} · Mac min {min(pm):.4f} mean {sum(pm)/len(pm):.4f} max {max(pm):.4f}")
selfc=[cos(V[i],M[i]) for i in range(4,len(keys))]
out.append(f"phone vs Mac vector, same text (48 texts): min {min(selfc):.4f} mean {sum(selfc)/len(selfc):.4f}")
out.append("question | kind | fixture (Mac) | Mac now | phone | phone-fixture")
worst=0;n=0
for d in fx['docs']:
    for i,q in enumerate(d['questions']):
        a=K[f"q:{d['id']}:{i}"]; b=K['doc:'+d['id']]
        p=cos(V[a],V[b]); m=cos(M[a],M[b]); worst=max(worst,abs(p-q['cosine'])); n+=1
        out.append(f"{d['id']} {q['q']!r} | {q['kind']} | {q['cosine']:.4f} | {m:.4f} | {p:.4f} | {p-q['cosine']:+.4f}")
out.append(f"max |phone - fixture| over {n} pairs: {worst:.4f}")
print("\n".join(out))
