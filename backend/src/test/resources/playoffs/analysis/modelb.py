import itertools,collections,json,pickle,sys
from sim import Lg,Model,LEAGUES,EPS
from multi import MULTI,LG
from decisions import ALL
BASE=Model(L2=[],LM=[])          # reuse step() implementations (incl. strict sweeps via multi patch)
def run_list(lg,G,L,ctx='wc'):
    """NFL-style: apply steps until one club identified; restart rules handled by caller. returns tiers of first separating step"""
    for st in L:
        T=BASE.step(lg,G,st,ctx)
        if T: return T
    return [sorted(G)]
class MB:
    def __init__(m,**k): m.__dict__.update(k)
    def two(m,lg,a,b,L):
        T=run_list(lg,[a,b],L); return T[0][0] if len(T)>1 else sorted([a,b])[0]
    def best_multi(m,lg,G,ctx,k=None):
        """returns ordered list of best clubs (full ranking of G)"""
        G=list(G)
        if len(G)==1: return G
        if len(G)==2:
            b=m.two(lg,G[0],G[1],m.L2 if ctx!='post' else m.post2)
            return [b,[t for t in G if t!=b][0]]
        # multi
        if ctx=='wc' and m.red=='first':
            keep=m.reduce(lg,G)
            if len(keep)<len(G):
                rest=[t for t in G if t not in keep]
                return m.rank_after_reduce(lg,keep)+m.best_multi(lg,rest,'wc')
        for st in m.LM:
            if st=='REDUCE':
                if ctx!='wc': continue
                keep=m.reduce(lg,G)
                if len(keep)<len(G):
                    rest=[t for t in G if t not in keep]
                    return m.rank_after_reduce(lg,keep)+m.best_multi(lg,rest,'wc')
                continue
            T=BASE.step(lg,G,st,ctx)
            if not T: continue
            if m.mode=='tiered':
                out=[]
                for t in T: out+=m.best_multi(lg,t,ctx if len(t)>2 else ('post' if (ctx=='post' or m.post_after_multi) else ctx))
                return out
            top=T[0]
            first=top[0] if len(top)==1 else m.best_multi(lg,top,ctx if len(top)>2 else ('post' if m.post_after_multi else ctx))[0]
            return [first]+m.best_multi(lg,[t for t in G if t!=first],ctx)
        return sorted(G)
    def rank_after_reduce(m,lg,keep):
        if len(keep)==1: return keep
        if len(keep)==2:
            b=m.two(lg,keep[0],keep[1],m.post2); return [b,[t for t in keep if t!=b][0]]
        return m.best_multi(lg,keep,'post')
    def reduce(m,lg,G):
        by=collections.defaultdict(list)
        for t in G: by[lg.T[t]['div']].append(t)
        keep=[]
        for d,ts in by.items():
            if len(ts)==1: keep.append(ts[0]); continue
            if len(ts)==2: keep.append(m.two(lg,ts[0],ts[1],m.RL))
            else: keep.append(sorted(ts)[0])  # rare
        return [t for t in G if t in keep]
    def rank(m,lg,G,ctx): return m.best_multi(lg,G,ctx)
def check(m,dec):
    lid,c,ctx,G,kind,x=dec; lg=LG[lid]
    r=m.rank(lg,G,ctx)
    if kind=='order': return r==G
    if kind=='order_any': return r in x
    if set(r[:x])!=set(G[:x]): return False
    sel=m.rank(lg,r[:x],ctx) if m.sel=='then_order' else r[:x]
    return sel==G[:x]
TWO=[d for d in ALL if len(d[3])==2]
def check2(m,dec):
    lid,c,ctx,G,kind,x=dec; lg=LG[lid]
    if kind=='member': a,b=x[0][0],x[1][0]
    else: a,b=G[0],G[1]
    L=m.L2div if ctx=='div' else m.L2
    return m.two(lg,a,b,L)==a
if __name__=='__main__':
    L2s={'divCOM':['H2H','DIV','COM','CONF','SOV','SOS','NET'],'divCONF':['H2H','DIV','CONF','COM','SOV','SOS','NET']}
    POST={'wc':['H2H','CONF','COM4','SOV','SOS','NET'],'wcCOM':['H2H','CONF','COM','SOV','SOS','NET'],'div':['H2H','DIV','COM','CONF','SOV','SOS','NET'],'divCONF':['H2H','DIV','CONF','COM','SOV','SOS','NET'],'comconf':['COM','CONF','SOV','SOS','NET']}
    RLs={'divCOM':['H2H','DIV','COM','CONF','SOV','SOS','NET'],'divCONF':['H2H','DIV','CONF','COM','SOV','SOS','NET'],'invCOM':['H2HINV','DIV','COM','CONF','SOV','SOS','NET'],'invCONF':['H2HINV','DIV','CONF','COM','SOV','SOS','NET']}
    res=[]
    for l2n,l2 in L2s.items():
     for pn,p2 in POST.items():
      for rn,rl in RLs.items():
       for sw in (None,'SWEEPL','SWEEPLS','SWEEP','SWEEPS','SWEEPX','SWEEPXS'):
        for pc in (None,'PCTINV_HALF','PCTINV_ZERO','PCTINV_NA','PCT_HALF','PCT_NA'):
         for red in ('first','after_sweep','after_pct','none'):
          for a,b in (('COM','CONF'),('CONF','COM'),('COM','DIV'),('DIV','COM'),('CONF','DIV'),('COM4','CONF'),('CONF','COM4')):
           LM=[]
           if red=='after_sweep': LM=([sw] if sw else [])+['REDUCE']+([pc] if pc else [])
           elif red=='after_pct': LM=[x for x in (sw,pc) if x]+['REDUCE']
           else: LM=[x for x in (sw,pc) if x]
           LM+=[a,b]+[s for s in ['DIV','COM','CONF','SOV','SOS','NET'] if s not in (a,b)]
           for mode in ('nfl','tiered'):
            for sel in ('take','then_order'):
             for pam in (True,False):
              m=MB(L2=l2,L2div=l2,post2=p2,RL=rl,LM=LM,red=red,mode=mode,sel=sel,post_after_multi=pam)
              ok=sum(check(m,d) for d in MULTI)
              res.append((ok,l2n,pn,rn,sw,pc,red,a,b,mode,sel,pam))
    res.sort(key=lambda r:-r[0])
    print("multi decisions",len(MULTI),"models",len(res))
    for r in res[:12]: print(r)
    print("count at 17:",sum(1 for r in res if r[0]==17),"at 16:",sum(1 for r in res if r[0]==16))
    pickle.dump(res,open('modelb.pkl','wb'))
