import json,glob,math,sys
SP=sys.argv[1]
keys=json.load(open(f'{SP}/embed-probe-keys.json')); M=json.load(open(f'{SP}/mac-vectors.json'))
fx=json.load(open('./packages/core/test/fixtures/rag/one-term-e5.json'))
K={k:i for i,k in enumerate(keys)}
c=lambda a,b: sum(x*y for x,y in zip(a,b))/math.sqrt(sum(x*x for x in a)*sum(y*y for y in b))
for d in sys.argv[2:]:
  f=sorted(glob.glob(f'{SP}/{d}/result-*.json'))[0]
  V=[x for x in json.load(open(f))['steps'] if x['op']=='embedProbe'][0]['value']['props']['vectors']
  self_=[c(V[i],M[i]) for i in range(4,len(keys))]
  shifts=[]
  for doc in fx['docs']:
    for i,q in enumerate(doc['questions']):
      a=K[f"q:{doc['id']}:{i}"]; b=K['doc:'+doc['id']]
      shifts.append(abs(c(V[a],V[b])-c(M[a],M[b])))
  print(f"{d}: twice passage {c(V[0],V[1]):.4f} question {c(V[2],V[3]):.4f} | to-Mac min {min(self_):.4f} mean {sum(self_)/len(self_):.4f} | 38 pair cosines vs Mac: max shift {max(shifts):.4f} mean {sum(shifts)/len(shifts):.4f}, >0.001: {sum(s>0.001 for s in shifts)}")
