import json,collections
exec(open('divwc.py').read().split("L2=['H2H','DIV','COM','CONF','SOV','SOS','NET']")[0])
exec(open('heldout26.py').read().split("L2=['H2H'")[0])
L2=['H2H','DIV','COM','CONF','SOV','SOS','NET']; WC2=['H2H','CONF','COM4','SOV','SOS','NET']
BASE=dict(L2=L2,L2div=L2,post2=WC2,RL=['H2HINV','DIV','CONF','COM','SOV','SOS','NET'],RL_normal=['H2H','DIV','CONF','COM','SOV','SOS','NET'],
      LM=['SWEEPL','REDUCE','PCTINV_HALF','COM','CONF','DIV','SOV','SOS','NET'],red='none',mode='tiered',sel='then_order',post_after_multi=False)
def score(kw,exc=True):
    m=MB2(**{**BASE,**kw}); ok=0; fails=[]
    for lgx in LEAGUES:
        for c in ('AFC','NFC'):
            if not exc: m.divs_with_wc=set()
            s=seeds2(m,lgx,c) if exc else seeds_noexc(m,lgx,c)
            if s in lgx.seeds[c]: ok+=1
            else: fails.append(f"{lgx.id} {c}")
    held=0
    m.divs_with_wc=set()
    for name,G,ctx,k,want in [('div',['GB','DET','CHI'],'div',None,['GB']),('dw',['ATL','LAR','GB'],'dw',None,['ATL','LAR','GB']),('wc',['DET','PHI','CHI'],'wc',2,['DET','PHI'])]:
        r=m.rank(lg,G,ctx); got=r[:1] if ctx=='div' else (m.rank(lg,r[:k],ctx) if k else r); held+=got==want
    return ok,held,fails
def seeds_noexc(m,lgx,c):
    m.RL_normal=m.RL; return seeds2(m,lgx,c)
rows=[("FULL MODEL",{}),
 ("2-team ties use NFL wild-card list instead of division list",{'L2':WC2}),
 ("no sweep-loser elimination",{'LM':['REDUCE','PCTINV_HALF','COM','CONF','DIV','SOV','SOS','NET']}),
 ("no one-per-division reduction",{'LM':['SWEEPL','PCTINV_HALF','COM','CONF','DIV','SOV','SOS','NET']}),
 ("reduction before sweep step",{'LM':['SWEEPL','PCTINV_HALF','COM','CONF','DIV','SOV','SOS','NET'],'red':'first'}),
 ("reduction uses normal H2H",{'RL':['H2H','DIV','CONF','COM','SOV','SOS','NET']}),
 ("multi-team H2H% normal (not inverted)",{'LM':['SWEEPL','REDUCE','PCT_HALF','COM','CONF','DIV','SOV','SOS','NET']}),
 ("no-games counts 0 (not 0.5)",{'LM':['SWEEPL','REDUCE','PCTINV_ZERO','COM','CONF','DIV','SOV','SOS','NET']}),
 ("no-games => H2H step not applicable",{'LM':['SWEEPL','REDUCE','PCTINV_NA','COM','CONF','DIV','SOV','SOS','NET']}),
 ("conference before common games after H2H",{'LM':['SWEEPL','REDUCE','PCTINV_HALF','CONF','COM','DIV','SOV','SOS','NET']}),
 ("after reduction 2 teams use division list",{'post2':L2}),
 ("cutoff: take ranking order (no select-then-order)",{'sel':'take'}),
 ("NFL one-at-a-time ranking (not tiered)",{'mode':'nfl'}),
]
for name,kw in rows:
    ok,held,f=score(kw); print(f"{ok:2}/34  held-out {held}/3  {name}  {('fails: '+', '.join(f)) if f and ok>=28 else ''}")
ok,held,f=score({},exc=False); print(f"{ok:2}/34  held-out {held}/3  without 'division already has a wild card' exception  fails: {', '.join(f)}")
