from decisions import *
import itertools,sys
LG={lg.id:lg for lg in LEAGUES}
MULTI=[d for d in ALL if len(d[3])>2]
# MSS-2027 AFC ambiguous wc order: either candidate
MSS=('MSS-2027','AFC','wc',['DEN','BUF','JAX'],'order_any',[['DEN','BUF','JAX'],['DEN','JAX','BUF']])
MULTI.append(MSS)
# strict sweep variants: patch Model.step
_orig=Model.step
def step(m,lg,G,st,ctx):
    if st in ('SWEEPS','SWEEPXS','SWEEPLS'):   # strict: won/lost ALL meetings vs each other club
        beat=[];lost=[]
        for t in G:
            b=l=True
            for o in G:
                if o==t: continue
                g=[x for x in lg.rec[t] if x[0]==o]
                b&=bool(g) and all(x[1]==1.0 for x in g); l&=bool(g) and all(x[1]==0.0 for x in g)
            if b: beat.append(t)
            if l: lost.append(t)
        if st=='SWEEPS':
            if len(beat)==1: return [beat,[t for t in G if t not in beat]]
            if len(lost)==1: return [[t for t in G if t not in lost],lost]
            return None
        if st=='SWEEPXS':
            out=[t for t in G if t in beat or t in lost]
            return [[t for t in G if t not in out],out] if out and len(out)<len(G) else None
        if len(lost)==1: return [[t for t in G if t not in lost],lost]
        return None
    return _orig(m,lg,G,st,ctx)
Model.step=step
def check(m,dec):
    lid,c,ctx,G,kind,x=dec; lg=LG[lid]
    if kind=='order': return m.rank(lg,G,ctx)==G
    if kind=='order_any': return m.rank(lg,G,ctx) in x
    k=x; r=m.rank(lg,G,ctx)
    if set(r[:k])!=set(G[:k]): return False
    sel=m.rank(lg,r[:k],ctx) if m.select=='then_order' else r[:k]
    return sel==G[:k]
