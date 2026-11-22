from modelb import *
import collections
L2=['H2H','DIV','COM','CONF','SOV','SOS','NET']
def make(**kw):
    d=dict(L2=L2,L2div=L2,post2=['H2H','CONF','COM4','SOV','SOS','NET'],RL=['H2HINV','DIV','CONF','COM','SOV','SOS','NET'],
           LM=['SWEEPL','PCTINV_HALF','COM','CONF','DIV','SOV','SOS','NET'],red='first',mode='tiered',sel='then_order',post_after_multi=False)
    d.update(kw); return MB(**d)
def seeds(m,lg,conf):
    teams=[t for t in lg.T if lg.T[t]['conf']==conf]; divs=collections.defaultdict(list)
    for t in teams: divs[lg.T[t]['div']].append(t)
    dws=[]
    for d,ts in divs.items():
        top=max(lg.pct[t] for t in ts); G=[t for t in ts if abs(lg.pct[t]-top)<EPS]
        dws.append(m.rank(lg,G,'div')[0] if len(G)>1 else G[0])
    def order(group,ctx,slots=None):
        out=[]
        for p in sorted({round(lg.pct[t],9) for t in group},reverse=True):
            G=[t for t in group if abs(lg.pct[t]-p)<EPS]
            if slots is not None and len(out)<slots<len(out)+len(G):
                k=slots-len(out); r=m.rank(lg,G,ctx)
                out+=(m.rank(lg,r[:k],ctx) if m.sel=='then_order' else r[:k])+r[k:]
            else: out+=m.rank(lg,G,ctx)
        return out
    return order(dws,'dw')+order([t for t in teams if t not in dws],'wc',3)[:3]
def full(m,verbose=True):
    ok=0;fails=[]
    for lg in LEAGUES:
        for c in ('AFC','NFC'):
            s=seeds(m,lg,c)
            if s in lg.seeds[c]: ok+=1
            else: fails.append((lg.id,c,s,lg.seeds[c]))
    if verbose:
        for f in fails: print("   FAIL",f[0],f[1],"model",f[2],"madden",f[3])
    return ok
if __name__=='__main__':
    m=make()
    print("multi fails:",[d[0]+' '+d[1] for d in MULTI if not check(m,d)])
    print("two-team fails:",[d[0]+' '+d[1]+' '+d[2] for d in TWO if not check2(m,d)])
    print("FULL:",full(m),"/",2*len(LEAGUES))
