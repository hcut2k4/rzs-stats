import json,collections
EPS=1e-9
class Lg:
    def __init__(s,d):
        s.id=d['id']; s.T=d['teams']; s.seeds=d['seeds']; s.rec=collections.defaultdict(list)
        for w,h,a,hs,as_ in d['games']:
            r=1.0 if hs>as_ else 0.0 if hs<as_ else .5
            s.rec[h].append((a,r,hs,as_)); s.rec[a].append((h,1-r,as_,hs))
        s.pct={t:s.wp(v) for t,v in s.rec.items()}
        s.pf={t:sum(x[2] for x in v) for t,v in s.rec.items()}; s.pa={t:sum(x[3] for x in v) for t,v in s.rec.items()}
        s.W={t:sum(x[1] for x in v) for t,v in s.rec.items()}; s.N={t:len(v) for t,v in s.rec.items()}
        s.cache={}
        s.home=collections.defaultdict(list); s.road=collections.defaultdict(list)
        for w,h,a,hs,as_ in d['games']:
            r=1.0 if hs>as_ else 0.0 if hs<as_ else .5
            s.home[h].append((a,r)); s.road[a].append((h,1-r))
    @staticmethod
    def wp(l): return sum(x[1] for x in l)/len(l) if l else None
    def sameconf(s,a,b): return s.T[a]['conf']==s.T[b]['conf']
    def samediv(s,a,b): return s.T[a]['div']==s.T[b]['div']
    def m_conf(s,t): return s.wp([x for x in s.rec[t] if s.sameconf(x[0],t)])
    def m_div(s,t): return s.wp([x for x in s.rec[t] if s.samediv(x[0],t)])
    def m_sov(s,t):
        w=[x for x in s.rec[t] if x[1]==1.0]; n=sum(s.N[x[0]] for x in w); return sum(s.W[x[0]] for x in w)/n if n else 0
    def m_sos(s,t):
        n=sum(s.N[x[0]] for x in s.rec[t]); return sum(s.W[x[0]] for x in s.rec[t])/n
    def m_net(s,t): return s.pf[t]-s.pa[t]
    def m_netconf(s,t): return sum(x[2]-x[3] for x in s.rec[t] if s.sameconf(x[0],t))
    def rank(s,t,conf_only):
        pool=[u for u in s.T if (not conf_only) or s.sameconf(u,t)]
        return -(2+sum(s.pf[u]>s.pf[t] for u in pool)+sum(s.pa[u]<s.pa[t] for u in pool))
    def common(s,G):
        c=None
        for t in G:
            o={x[0] for x in s.rec[t]}; c=o if c is None else c&o
        return c-set(G)
METRIC={'DIV':Lg.m_div,'CONF':Lg.m_conf,'SOV':Lg.m_sov,'SOS':Lg.m_sos,'NET':Lg.m_net,'NETCONF':Lg.m_netconf,
        'RANKC':lambda s,t:s.rank(t,True),'RANKA':lambda s,t:s.rank(t,False),'PF':lambda s,t:s.pf[t],'HOME':lambda s,t:s.wp(s.home[t]),'ROAD':lambda s,t:s.wp(s.road[t]),'HOMEW':lambda s,t:sum(x[1] for x in s.home[t]),'ROADW':lambda s,t:sum(x[1] for x in s.road[t]),'PA':lambda s,t:-s.pa[t]}
def tiers(vals):
    ts=sorted(set(round(v,9) for v in vals.values()),reverse=True)
    return [sorted(t for t in vals if abs(round(vals[t],9)-v)<EPS) for v in ts]
class Model:
    def __init__(m,**kw):
        m.L2=kw['L2']; m.LM=kw['LM']; m.L2div=kw.get('L2div',kw['L2']); m.LMdiv=kw.get('LMdiv',kw['LM'])
        m.mode=kw.get('mode','nfl'); m.select=kw.get('select','take'); m.restart2=kw.get('restart2',True)
        m.reduce=kw.get('reduce','first'); m.reduce_order=kw.get('reduce_order','div'); m.fallback=kw.get('fallback','alpha')
    # ---- one step -> tiers (list of lists) or None if not applicable/no separation
    def step(m,lg,G,st,ctx):
        if st=='H2H' or st=='H2HINV':
            if len(G)!=2: return None
            a,b=G; g=[x for x in lg.rec[a] if x[0]==b]
            if not g: return None
            v=lg.wp(g)-.5
            if st=='H2HINV': v=-v
            if abs(v)<EPS: return None
            return [[a],[b]] if v>0 else [[b],[a]]
        if st.startswith('PCT'):          # PCT[INV]_{NA|HALF|ZERO}
            inv='INV' in st; pol=st.split('_')[1]; vals={}
            for t in G:
                g=[x for x in lg.rec[t] if x[0] in G and x[0]!=t]
                if not g:
                    if pol=='NA': return None
                    vals[t]=.5 if pol=='HALF' else 0.0
                else: vals[t]=lg.wp(g)
            if inv: vals={t:-v for t,v in vals.items()}
            T=tiers(vals); return T if len(T)>1 else None
        if st in ('SWEEP','SWEEPX','SWEEPL'):
            beat=[];lost=[]
            for t in G:
                b=l=True
                for o in G:
                    if o==t: continue
                    g=[x for x in lg.rec[t] if x[0]==o]
                    b&=any(x[1]==1.0 for x in g); l&=any(x[1]==0.0 for x in g)
                if b: beat.append(t)
                if l: lost.append(t)
            if st=='SWEEP':
                if len(beat)==1: return [beat,[t for t in G if t not in beat]]
                if len(lost)==1: return [[t for t in G if t not in lost],lost]
                return None
            if st=='SWEEPX':   # any sweep, either direction -> eliminated
                out=[t for t in G if t in beat or t in lost]
                if out and len(out)<len(G): return [[t for t in G if t not in out],out]
                return None
            if st=='SWEEPL':   # only lost-to-all eliminated
                if len(lost)==1: return [[t for t in G if t not in lost],lost]
                return None
        if st.startswith('COM'):
            mn=int(st[3:] or 0); c=lg.common(G); vals={}
            for t in G:
                g=[x for x in lg.rec[t] if x[0] in c]
                if len(g)<max(mn,1): return None
                vals[t]=lg.wp(g)
            T=tiers(vals); return T if len(T)>1 else None
        if st=='NETCOM':
            c=lg.common(G); vals={t:sum(x[2]-x[3] for x in lg.rec[t] if x[0] in c) for t in G}
            if not c: return None
            T=tiers(vals); return T if len(T)>1 else None
        if st=='REDUCE':
            if ctx!='wc': return None
            keep=m.reduced(lg,G)
            if len(keep)==len(G): return None
            return [keep,[t for t in G if t not in keep]]
        vals={t:METRIC[st](lg,t) for t in G}
        T=tiers(vals); return T if len(T)>1 else None
    def reduced(m,lg,G):
        bydiv=collections.defaultdict(list)
        for t in G: bydiv[lg.T[t]['div']].append(t)
        keep=[]
        for d,ts in bydiv.items():
            if len(ts)==1: keep.append(ts[0]); continue
            if m.reduce_order=='div': keep.append(m.rank(lg,ts,'div')[0])
            else: keep.append(m.rank(lg,ts,'wcinv')[0])
        return [t for t in G if t in keep]
    def lists(m,G,ctx):
        if ctx=='div': return m.L2div if len(G)==2 else m.LMdiv
        if ctx=='wcinv':
            L=m.L2div if len(G)==2 else m.LMdiv
            return [('H2HINV' if x=='H2H' else x) for x in L]
        return m.L2 if len(G)==2 else m.LM
    def fb(m,lg,G):
        return sorted(G) if m.fallback=='alpha' else sorted(G,key=lambda t:lg.T[t].get('id',0))
    def best(m,lg,G,ctx,steps=None):
        if len(G)==1: return G[0]
        L=steps if steps is not None else m.lists(G,ctx)
        if ctx=='wc' and m.reduce=='first' and len(G)>2 and steps is None:
            k=m.reduced(lg,G)
            if len(k)<len(G): return m.best(lg,k,ctx)
        for i,st in enumerate(L):
            T=m.step(lg,G,st,ctx)
            if T is None: continue
            top=T[0]
            if len(top)==1: return top[0]
            if m.restart2 or len(top)>2: return m.best(lg,top,ctx)
            return m.best(lg,top,ctx,steps=L[i+1:])
        return m.fb(lg,G)[0]
    def rank(m,lg,G,ctx):
        G=list(G)
        if len(G)<=1: return G
        if m.mode=='tiered': return m.rank_tiered(lg,G,ctx,None)
        b=m.best(lg,G,ctx); return [b]+m.rank(lg,[t for t in G if t!=b],ctx)
    def rank_tiered(m,lg,G,ctx,steps):
        if len(G)<=1: return G
        L=steps if steps is not None else m.lists(G,ctx)
        if ctx=='wc' and m.reduce=='first' and len(G)>2 and steps is None:
            k=m.reduced(lg,G)
            if len(k)<len(G): return m.rank_tiered(lg,k,ctx,None)+m.rank_tiered(lg,[t for t in G if t not in k],ctx,None)
        for i,st in enumerate(L):
            T=m.step(lg,G,st,ctx)
            if T is None: continue
            out=[]
            for t in T:
                out+=m.rank_tiered(lg,t,ctx,None if (m.restart2 or len(t)>2) else L[i+1:])
            return out
        return m.fb(lg,G)
    def seeds(m,lg,conf):
        teams=[t for t in lg.T if lg.T[t]['conf']==conf]
        divs=collections.defaultdict(list)
        for t in teams: divs[lg.T[t]['div']].append(t)
        dws=[]
        for d,ts in divs.items():
            top=max(lg.pct[t] for t in ts); G=[t for t in ts if abs(lg.pct[t]-top)<EPS]
            dws.append(m.rank(lg,G,'div')[0] if len(G)>1 else G[0])
        def order(group,ctx,slots=None):
            out=[]
            for p in sorted({round(lg.pct[t],9) for t in group},reverse=True):
                G=[t for t in group if abs(lg.pct[t]-p)<EPS]
                if slots is not None and len(out)+len(G)>slots and len(out)<slots:
                    k=slots-len(out); r=m.rank(lg,G,ctx)
                    if m.select=='then_order': out+=m.rank(lg,r[:k],ctx)+r[k:]
                    else: out+=r
                else: out+=m.rank(lg,G,ctx)
            return out
        return order(dws,'dw')+order([t for t in teams if t not in dws],'wc',3)[:3]
def evaluate(model,leagues,verbose=False):
    ok=0;fails=[]
    for lg in leagues:
        for c in ('AFC','NFC'):
            s=model.seeds(lg,c)
            if s in lg.seeds[c]: ok+=1
            else: fails.append((lg.id,c,s,lg.seeds[c]))
    if verbose:
        for f in fails: print("  FAIL",f[0],f[1],"model",f[2],"madden",f[3][0] if len(f[3])==1 else f[3])
    return ok,fails
LEAGUES=[Lg(d) for d in json.load(open('dataset.json'))]
NFL=Model(L2=['H2H','CONF','COM4','SOV','SOS','RANKC','RANKA','NETCONF','NET'],
          LM=['SWEEP','CONF','COM4','SOV','SOS','RANKC','RANKA','NETCONF','NET'],
          L2div=['H2H','DIV','COM','CONF','SOV','SOS','RANKC','RANKA','NETCOM','NET'],
          LMdiv=['PCT_NA','DIV','COM','CONF','SOV','SOS','RANKC','RANKA','NETCOM','NET'],mode='nfl',reduce='first')
if __name__=='__main__':
    ok,f=evaluate(NFL,LEAGUES,True); print("NFL",ok,"/",2*len(LEAGUES))
