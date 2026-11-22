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

import json,sys,collections
N='../neon/'
out=[]
def from_neon(L,s,seeds=None):
    d=json.load(open(f'{N}{L}-data.json')); gs=d['seasons'][str(s)]
    teams={}
    for g in gs:
        for t in (g['home'],g['away']): teams[t['abbrName']]={'conf':t['conferenceName'],'div':t['divName'],'id':t['teamId']}
    reg=[g for g in gs if g['stage']==1 and g['week']<18 and g['status']>=2]
    assert len(reg)==272,(L,s,len(reg))
    games=[(g['week'],g['home']['abbrName'],g['away']['abbrName'],g['homeScore'],g['awayScore']) for g in reg]
    po=[(g['week'],g['home']['abbrName'],g['away']['abbrName']) for g in gs if g['stage']==1 and g['week']>=18 and g['status']>=2]
    w=collections.Counter();n=collections.Counter()
    for _,h,a,hs,as_ in games:
        r=1 if hs>as_ else 0 if hs<as_ else .5; w[h]+=r;w[a]+=1-r;n[h]+=1;n[a]+=1
    wp={t:w[t]/n[t] for t in n}
    conf_of={t:v['conf'] for t,v in teams.items()}
    S={}
    for c in ('AFC','NFC'):
        S[c]=[seeds[c]] if seeds else candidates(conf_of,po,c,wp)
        if seeds: assert seeds[c] in candidates(conf_of,po,c,wp),(L,s,c)
    out.append({'id':f'{L}-{2026+s}','teams':teams,'games':games,'seeds':S})
shots={0:{'AFC':['BUF','JAX','DEN','BAL','HOU','CIN','IND'],'NFC':['TB','SF','GB','WAS','NYG','CHI','LAR']},
       1:{'AFC':['BUF','IND','CLE','KC','HOU','LV','PIT'],'NFC':['ATL','NYG','CHI','SF','NO','PHI','DET']}}
from_neon('RZS',0,shots[0]); from_neon('RZS',1,shots[1])
F=json.load(open('/home/honeycke/code/rzs-stats/backend/src/test/resources/playoffs/sim-full-season.json'))
out.append({'id':'SIMFULL','teams':{t['abbr']:{'conf':t['conference'],'div':t['division'],'id':i} for i,t in enumerate(F['teams'])},
            'games':[(g['week'],g['home'],g['away'],g['homeScore'],g['awayScore']) for g in F['games']],'seeds':{c:[s] for c,s in F['maddenSeeds'].items()}})
for L,ss in {'UFL':(0,1),'SML':(0,1),'DM2':(0,1),'SMLP':(0,1),'SFL':(0,),'ALS27':(0,),'MSS':(0,1),'MMGA6':(0,1)}.items():
    for s in ss: from_neon(L,s)
json.dump(out,open('dataset.json','w'))
print(len(out),"seasons;",sum(len(v) for d in out for v in d['seeds'].values()),"conference candidate lists;",
      sum(1 for d in out for v in d['seeds'].values() if len(v)>1),"ambiguous")
