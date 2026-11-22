import pickle,collections,sys,os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__))); os.chdir(os.path.dirname(os.path.abspath(__file__)))
from m4_family import CONFS,NFLV
res=pickle.load(open('m4_family.pkl','rb'))
N=len(CONFS)
tot=[sum(v) for p,v,h,d in res]
print("== In-sample (all 34 used for fitting)")
best=max(tot); print("best fit",best,"/34; models at best:",tot.count(best),"; at 33:",tot.count(33))
by=collections.Counter(d for (p,v,h,d),t in zip(res,tot) if t==best); print("defect counts among best:",dict(sorted(by.items())))
mind=min(d for (p,v,h,d),t in zip(res,tot) if t==best)
print(f"min defects at {best}/34:",mind)
for (p,v,h,d),t in zip(res,tot):
    if t==best and d==mind: print("  ",{k:x for k,x in p.items() if x!=NFLV[k]},"held",sum(h))
for k in range(0,8):
    b=max([t for (p,v,h,d),t in zip(res,tot) if d==k] or [0]); print(f"  best fit with exactly {k} deviations from NFL: {b}/34")
def cv(groups,label):
    print(f"== {label}: model chosen on the other folds by max training fit, ties -> fewest deviations")
    agg=0; aggfrac=0; n=0; rows=[]
    for gname,idx in groups.items():
        tr=[i for i in range(N) if i not in idx]
        sc=[(sum(v[i] for i in tr),-d) for p,v,h,d in res]
        top=max(sc); sel=[r for r,s in zip(res,sc) if s==top]
        fold=[sum(r[1][i] for i in idx) for r in sel]
        frac=sum(f==len(idx) for f in fold)/len(sel)
        # does the fold even discriminate? fraction of ALL models in family that get the fold right
        base=sum(all(r[1][i] for i in idx) for r in res)/len(res)
        nfl=[r for r in res if r[3]==0][0]; nflok=all(nfl[1][i] for i in idx)
        rows.append((gname,len(idx),top[0],-top[1],len(sel),frac,base,nflok))
        aggfrac+=sum(fold)/len(sel); n+=len(idx)
    for g,k,trn,dev,ns,frac,base,nflok in rows:
        print(f"  {g:10} confs {k}  train {trn}/{N-k}  dev {dev}  selected models {ns:4}  fold fully right {frac:5.0%}   (family base rate {base:4.0%}; NFL right: {nflok})")
    print(f"  held-out conferences predicted correctly (averaged over tied selections): {aggfrac:.1f}/{n}")
seasons=collections.OrderedDict()
for i,(lid,c) in enumerate(CONFS): seasons.setdefault(lid,[]).append(i)
cv(seasons,"Leave-one-season-out (17 folds)")
leagues=collections.OrderedDict()
for i,(lid,c) in enumerate(CONFS): leagues.setdefault(lid.rsplit('-',1)[0],[]).append(i)
cv(leagues,f"Leave-one-league-out ({len(leagues)} folds)")
# partial 2026 season as an extra fold never used for selection
sc=[(sum(v),-d) for p,v,h,d in res]; top=max(sc); sel=[r for r,s in zip(res,sc) if s==top]
print("== Partial 2026 sim (3 groups), model chosen on all 34:",f"{len(sel)} selected; mean held-out {sum(sum(r[2]) for r in sel)/len(sel):.2f}/3; all-3-right in {sum(sum(r[2])==3 for r in sel)}/{len(sel)}")
