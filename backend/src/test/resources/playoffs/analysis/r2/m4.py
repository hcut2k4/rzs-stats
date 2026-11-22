import sys,os,json,collections
HERE=os.path.dirname(os.path.abspath(__file__)); A=os.path.dirname(HERE); sys.path.insert(0,A)
_cwd=os.getcwd(); os.chdir(A)
from sim import Lg,LEAGUES,EPS
os.chdir(_cwd)
def load_heldout():
    P=json.load(open(os.path.join(os.path.dirname(A),'sim2026-partial.json')))
    DIVS={'AFC East':'BUF MIA NE NYJ','AFC North':'BAL CIN CLE PIT','AFC South':'HOU IND JAX TEN','AFC West':'DEN KC LV LAC','NFC East':'DAL NYG PHI WAS','NFC North':'CHI DET GB MIN','NFC South':'ATL CAR NO TB','NFC West':'AZ LAR SF SEA'}
    teams={t:{'conf':d[:3],'div':d,'id':0} for d,ts in DIVS.items() for t in ts.split()}
    games=set()
    for t,rows in P['schedules'].items():
        for wk,ha,o,pf,pa in rows:
            games.add((wk,t,o,pf,pa) if ha=='H' else (wk,o,t,pa,pf))
    return Lg({'id':'SIM26','teams':teams,'games':sorted(games),'seeds':{}})
HELD=load_heldout()
HELD_CASES=[('div',['GB','DET','CHI'],'div',None,['GB']),('dw',['ATL','LAR','GB'],'dw',None,['ATL','LAR','GB']),('wc',['DET','PHI','CHI'],'wc',2,['DET','PHI'])]
DIVLIST=['H2H','DIV','COM','CONF','SOV','SOS','NET']
WCLIST=['H2H','CONF','COM4','SOV','SOS','NET']
def tiers(vals):
    ts=sorted({round(v,9) for v in vals.values()},reverse=True)
    return [sorted(t for t in vals if abs(round(vals[t],9)-v)<EPS) for v in ts]
class Engine:
    """Defaults = candidate M4. Each flag is one code-level choice."""
    def __init__(e,**k):
        e.two_list=k.get('two_list',DIVLIST)          # D1: division list reused for every 2-team tie
        e.two_mode=k.get('two_mode','fixed')          # fixed (use two_list everywhere) | nfl (division list in div ctx, WC list otherwise)
        e.tail_mode=k.get('tail_mode','fixed')        # fixed (multi_list) | nfl (div ctx: division list; else WC list)
        e.multi_list=k.get('multi_list',DIVLIST)      # steps after H2H% for 3+ ties
        e.h2h_dir=k.get('h2h_dir','asc')              # D3: 'asc' = sorted the wrong way
        e.h2h_nogames=k.get('h2h_nogames',0.5)
        e.h2h_qty=k.get('h2h_qty','pct')              # pct | wins | losses | net
        e.lost_all=k.get('lost_all','nowins')         # D2: 'nowins' (vacuous) | 'strict' | 'none'
        e.beat_all=k.get('beat_all','none')           # none | 'advance' | 'eliminate'  (vacuous no-loss)
        e.reduce=k.get('reduce','after_lostall')      # after_lostall | first | none
        e.reduce_h2h=k.get('reduce_h2h','asc')        # how same-division pairs are ordered in the reduction
        e.com_scope=k.get('com_scope','orig')         # D4: 'orig' = common opponents of the original tie group
        e.multi_mode=k.get('multi_mode','tiered')     # tiered | composite
        e.select=k.get('select','then_order')               # take | then_order
        e.lost_ctx=k.get('lost_ctx','all')            # contexts where the no-wins step runs
        e.lost_mode=k.get('lost_mode','unique')       # unique | all | played
    # ---------- metrics
    def h2h_val(e,lg,t,G):
        g=[x for x in lg.rec[t] if x[0] in G and x[0]!=t]
        if not g: return e.h2h_nogames if e.h2h_qty=='pct' else 0.0
        w=sum(x[1] for x in g); n=len(g)
        return {'pct':w/n,'wins':w,'losses':-(n-w),'net':w-(n-w)}[e.h2h_qty]
    def metric_tiers(e,lg,G,st):
        if st=='H2H':
            if len(G)!=2: return None
            a,b=G; g=[x for x in lg.rec[a] if x[0]==b]
            if not g: return None
            v=lg.wp(g)-.5
            if abs(v)<EPS: return None
            return [[a],[b]] if v>0 else [[b],[a]]
        if st.startswith('COM'):
            mn=int(st[3:] or 0); c=lg.common(e.orig if e.com_scope=='orig' else G); vals={}
            for t in G:
                g=[x for x in lg.rec[t] if x[0] in c]
                if len(g)<max(mn,1): return None
                vals[t]=lg.wp(g)
        else:
            f={'DIV':lg.m_div,'CONF':lg.m_conf,'SOV':lg.m_sov,'SOS':lg.m_sos,'NET':lg.m_net}[st]; vals={t:f(t) for t in G}
        T=tiers(vals); return T if len(T)>1 else None
    # ---------- two-team
    def two(e,lg,G,L=None,ctx=None):
        if L is None and e.two_mode=='nfl': L=DIVLIST if ctx=='div' else WCLIST
        for st in (L or e.two_list):
            T=e.metric_tiers(lg,list(G),st)
            if T: return [T[0][0],T[1][0]]
        return sorted(G)
    # ---------- reduction ordering of a same-division subgroup
    def div_order(e,lg,ts):
        if len(ts)==1: return ts
        if e.reduce_h2h in ('asc','desc'):
            vals={t:e.h2h_val(lg,t,ts) for t in ts}
            if e.reduce_h2h=='asc': vals={t:-v for t,v in vals.items()}
            T=tiers(vals)
            if len(T)>1: return [x for t in T for x in e.div_order(lg,t)]
        for st in e.multi_list[1:]:
            T=e.metric_tiers(lg,ts,st)
            if T: return [x for t in T for x in e.div_order(lg,t)]
        return sorted(ts)
    # ---------- multi-team
    def resolve(e,lg,G,ctx):
        G=list(G)
        if len(G)<=1: return G
        if len(G)==2: return e.two(lg,G,ctx=ctx)
        others=lambda t:[x for x in lg.rec[t] if x[0] in G and x[0]!=t]
        if e.beat_all!='none':
            b=[t for t in G if all(x[1]==1.0 for x in others(t))]
            if e.beat_all=='advance_strict':
                b=[t for t in G if all(any(x[0]==o and x[1]==1.0 for x in lg.rec[t]) for o in G if o!=t)]
            if len(b)==1:
                rest=[t for t in G if t not in b]
                return b+e.resolve(lg,rest,ctx) if e.beat_all.startswith('advance') else e.resolve(lg,rest,ctx)+b
        if e.reduce=='first' and ctx=='wc':
            r=e.reduction(lg,G,ctx)
            if r: return r
        if e.lost_all!='none' and (e.lost_ctx=='all' or ctx==e.lost_ctx):
            if e.lost_all=='nowins': l=[t for t in G if all(x[1]==0.0 for x in others(t))]
            elif e.lost_all=='anyloss': l=[t for t in G if all(any(x[0]==o and x[1]==0.0 for x in lg.rec[t]) for o in G if o!=t and any(x[0]==o for x in lg.rec[t]))]
            else: l=[t for t in G if all(any(x[0]==o and x[1]==0.0 for x in lg.rec[t]) for o in G if o!=t)]
            if e.lost_mode=='played': l=[t for t in l if others(t)]
            if e.lost_mode=='all' and 0<len(l)<len(G): return e.resolve(lg,[t for t in G if t not in l],ctx)+e.resolve(lg,l,ctx)
            if len(l)==1: return e.resolve(lg,[t for t in G if t not in l],ctx)+l
        if e.reduce=='after_lostall' and ctx=='wc':
            r=e.reduction(lg,G,ctx)
            if r: return r
        vals={t:e.h2h_val(lg,t,G) for t in G}
        hd=e.h2h_dir if e.h2h_dir!='nfl' else ('desc' if ctx=='div' else 'skip')
        if hd=='asc': vals={t:-v for t,v in vals.items()}
        if hd!='skip':
            T=tiers(vals)
            if len(T)>1: return e.split(lg,T,ctx)
        tail=e.multi_list[1:] if e.tail_mode=='fixed' else (DIVLIST[1:] if ctx=='div' else WCLIST[1:])
        for st in tail:
            T=e.metric_tiers(lg,G,st)
            if T: return e.split(lg,T,ctx)
        return sorted(G)
    def split(e,lg,T,ctx):
        return [x for t in T for x in e.resolve(lg,t,ctx)]
    def reduction(e,lg,G,ctx):
        by=collections.defaultdict(list)
        for t in G: by[lg.T[t]['div']].append(t)
        if all(len(v)==1 for v in by.values()): return None
        keep=[e.div_order(lg,ts)[0] for ts in by.values()]
        keep=[t for t in G if t in keep]; rest=[t for t in G if t not in keep]
        return e.resolve(lg,keep,ctx)+e.resolve(lg,rest,ctx)
    def rank(e,lg,G,ctx):
        e.orig=list(G); return e.resolve(lg,G,ctx)
    # ---------- seeding
    def seeds(e,lg,conf):
        teams=[t for t in lg.T if lg.T[t]['conf']==conf]; divs=collections.defaultdict(list)
        for t in teams: divs[lg.T[t]['div']].append(t)
        dws=[]
        for d,ts in divs.items():
            top=max(lg.pct[t] for t in ts); G=[t for t in ts if abs(lg.pct[t]-top)<EPS]
            dws.append(e.rank(lg,G,'div')[0])
        def order(group,ctx,slots=None):
            out=[]
            for p in sorted({round(lg.pct[t],9) for t in group},reverse=True):
                if slots is not None and len(out)>=slots: break
                G=[t for t in group if abs(lg.pct[t]-p)<EPS]; r=e.rank(lg,G,ctx)
                if slots is not None and len(out)+len(G)>slots and e.select=='then_order':
                    k=slots-len(out); r=e.rank(lg,r[:k],ctx)+r[k:]
                out+=r
            return out
        return order(dws,'dw')+order([t for t in teams if t not in dws],'wc',3)[:3]
def score(e,verbose=False):
    ok=0; fails=[]
    for lg in LEAGUES:
        for c in ('AFC','NFC'):
            s=e.seeds(lg,c)
            if s in lg.seeds[c]: ok+=1
            else: fails.append(f"{lg.id} {c}")
    held=0
    for name,G,ctx,k,want in HELD_CASES:
        r=e.rank(HELD,G,ctx); got=r[:1] if ctx=='div' else (r[:k] if k else r); held+=got==want
    return ok,held,fails
if __name__=='__main__':
    print('M4',score(Engine()))
    print('NFL-ish 2-team WC list',score(Engine(two_list=WCLIST)))
