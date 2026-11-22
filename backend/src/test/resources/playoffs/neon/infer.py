import json,itertools,glob,collections
def candidates(conf_of,po,c,wp=None):
    g={w:[(h,a) for w2,h,a in po if w2==w and conf_of[h]==c] for w in (18,19,20)}
    inwc={t for p in g[18] for t in p}
    bye=[t for p in g[19] for t in p if t not in inwc][0]
    out=[]
    for dw in itertools.permutations([h for h,a in g[18]]):
        opp={h:a for h,a in g[18]}
        seeds=[bye,dw[0],dw[1],dw[2],opp[dw[2]],opp[dw[1]],opp[dw[0]]]
        sd={t:i+1 for i,t in enumerate(seeds)}
        ok=True
        alive=[t for p in g[19] for t in p]
        for h,a in g[19]:
            if sd[h]>sd[a]: ok=False
            if h==bye and sd[a]!=max(sd[t] for t in alive if t!=bye): ok=False
        for h,a in g[20]:
            if sd[h]>sd[a]: ok=False
        if ok and wp:
            if not (wp[seeds[1]]>=wp[seeds[2]]>=wp[seeds[3]] and wp[seeds[4]]>=wp[seeds[5]]>=wp[seeds[6]]): ok=False
        if ok: out.append(seeds)
    return out
def load_txt(f):
    conf={};po=[];G=[]
    for l in open(f):
        p=l.split()
        if p[0]=='T': conf[p[1]]=p[2]
        if p[0]=='P': po.append((int(p[1]),p[2],p[3]))
        if p[0]=='G': G.append((p[2],p[3],int(p[4]),int(p[5])))
    w=collections.Counter();n=collections.Counter()
    for h,a,hs,as_ in G:
        r=1 if hs>as_ else 0 if hs<as_ else .5; w[h]+=r;w[a]+=1-r;n[h]+=1;n[a]+=1
    return conf,po,{t:w[t]/n[t] for t in n}
# validation: RZS 103/104 from Neon + screenshots
d=json.load(open('RZS-data.json'))
shots={0:{'AFC':['BUF','JAX','DEN','BAL','HOU','CIN','IND'],'NFC':['TB','SF','GB','WAS','NYG','CHI','LAR']},
       1:{'AFC':['BUF','IND','CLE','KC','HOU','LV','PIT'],'NFC':['ATL','NYG','CHI','SF','NO','PHI','DET']}}
for s in (0,1):
    gs=d['seasons'][str(s)]; conf={}
    for g in gs:
        for t in (g['home'],g['away']): conf[t['abbrName']]=t['conferenceName']
    po=[(g['week'],g['home']['abbrName'],g['away']['abbrName']) for g in gs if g['stage']==1 and g['week']>=18 and g['status']>=2]
    for c,true in shots[s].items():
        cs=candidates(conf,po,c)
        print(f"VALIDATE {s+103} {c}: {len(cs)} candidate(s), true seeds among them: {true in cs}, unique&correct: {cs==[true]}")
print()
tot=collections.Counter()
for f in sorted(glob.glob('seasons/*bracket.txt')):
    conf,po,wp=load_txt(f)
    for c in ('AFC','NFC'):
        a=candidates(conf,po,c); b=candidates(conf,po,c,wp)
        tot[len(a)]+=1; tot['wp'+str(len(b))]+=1
        print(f"{f.split('/')[-1][:-12]:9} {c}: {len(a)} orderings from playoff games; {len(b)} also respecting win% order -> {b if len(b)==1 else ''}")
print(tot)
