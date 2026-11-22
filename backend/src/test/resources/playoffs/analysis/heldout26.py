import json
from sim import Lg
from modelb import MB
P=json.load(open('/home/honeycke/code/rzs-stats/backend/src/test/resources/playoffs/sim2026-partial.json'))
DIVS={'AFC East':'BUF MIA NE NYJ','AFC North':'BAL CIN CLE PIT','AFC South':'HOU IND JAX TEN','AFC West':'DEN KC LV LAC',
'NFC East':'DAL NYG PHI WAS','NFC North':'CHI DET GB MIN','NFC South':'ATL CAR NO TB','NFC West':'AZ LAR SF SEA'}
teams={t:{'conf':d[:3],'div':d,'id':0} for d,ts in DIVS.items() for t in ts.split()}
games=set()
for t,rows in P['schedules'].items():
    for wk,ha,o,pf,pa in rows:
        h,a,hs,as_=(t,o,pf,pa) if ha=='H' else (o,t,pa,pf)
        games.add((wk,h,a,hs,as_))
lg=Lg({'id':'SIM26','teams':teams,'games':sorted(games),'seeds':{}})
L2=['H2H','DIV','COM','CONF','SOV','SOS','NET']
base=dict(L2=L2,L2div=L2,post2=['H2H','CONF','COM4','SOV','SOS','NET'],RL=['H2HINV','DIV','CONF','COM','SOV','SOS','NET'],mode='tiered',sel='then_order',post_after_multi=False)
variants={'reduce FIRST (current 33/34)':dict(LM=['SWEEPL','PCTINV_HALF','COM','CONF','DIV','SOV','SOS','NET'],red='first'),
          'reduce AFTER sweep-loser step':dict(LM=['SWEEPL','REDUCE','PCTINV_HALF','COM','CONF','DIV','SOV','SOS','NET'],red='none')}
cases=[('North division title',['GB','DET','CHI'],'div',None,['GB']),
       ('Division winners 2-4',['ATL','LAR','GB'],'dw',None,['ATL','LAR','GB']),
       ('Wild cards 6-7 (2 spots)',['DET','PHI','CHI'],'wc',2,['DET','PHI'])]
for vn,v in variants.items():
    m=MB(**{**base,**v}); print(vn)
    for name,G,ctx,k,want in cases:
        r=m.rank(lg,G,ctx)
        got=r[:1] if ctx=='div' else (m.rank(lg,r[:k],ctx) if k else r)
        print(f"   {name:26} model {got}  madden {want}  {'OK' if got==want else 'FAIL'}")
