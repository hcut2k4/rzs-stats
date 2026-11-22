import collections
exec(open('evalb.py').read().split("if __name__=='__main__':")[0])
# variant: in the wild-card reduction, a division that already has a qualified wild card (higher seed, selected earlier)
# orders its tied teams with the normal division list instead of the inverted one.
class MB2(MB):
    def reduce(m,lg,G):
        by=collections.defaultdict(list)
        for t in G: by[lg.T[t]['div']].append(t)
        keep=[]
        for d,ts in by.items():
            if len(ts)==1: keep.append(ts[0]); continue
            L=m.RL_normal if d in m.divs_with_wc else m.RL
            keep.append(m.two(lg,ts[0],ts[1],L) if len(ts)==2 else sorted(ts)[0])
        return [t for t in G if t in keep]
def seeds2(m,lg,conf):
    teams=[t for t in lg.T if lg.T[t]['conf']==conf]; divs=collections.defaultdict(list)
    for t in teams: divs[lg.T[t]['div']].append(t)
    dws=[]
    for d,ts in divs.items():
        top=max(lg.pct[t] for t in ts); G=[t for t in ts if abs(lg.pct[t]-top)<EPS]
        dws.append(m.rank(lg,G,'div')[0] if len(G)>1 else G[0])
    dwo=[]
    for p in sorted({round(lg.pct[t],9) for t in dws},reverse=True):
        dwo+=m.rank(lg,[t for t in dws if abs(lg.pct[t]-p)<EPS],'dw')
    out=[]; m.divs_with_wc=set()
    wcs=[t for t in teams if t not in dws]
    for p in sorted({round(lg.pct[t],9) for t in wcs},reverse=True):
        if len(out)>=3: break
        G=[t for t in wcs if abs(lg.pct[t]-p)<EPS]
        if len(out)+len(G)>3:
            k=3-len(out); r=m.rank(lg,G,'wc'); out+=m.rank(lg,r[:k],'wc')
        else: out+=m.rank(lg,G,'wc')
        m.divs_with_wc|={lg.T[t]['div'] for t in out}
    return dwo+out[:3]
L2=['H2H','DIV','COM','CONF','SOV','SOS','NET']
m=MB2(L2=L2,L2div=L2,post2=['H2H','CONF','COM4','SOV','SOS','NET'],RL=['H2HINV','DIV','CONF','COM','SOV','SOS','NET'],RL_normal=['H2H','DIV','CONF','COM','SOV','SOS','NET'],
      LM=['SWEEPL','REDUCE','PCTINV_HALF','COM','CONF','DIV','SOV','SOS','NET'],red='none',mode='tiered',sel='then_order',post_after_multi=False)
ok=0
for lg in LEAGUES:
    for c in ('AFC','NFC'):
        s=seeds2(m,lg,c)
        if s in lg.seeds[c]: ok+=1
        else: print("  FAIL",lg.id,c,s,lg.seeds[c])
print("division-already-has-wild-card variant:",ok,"/34")
