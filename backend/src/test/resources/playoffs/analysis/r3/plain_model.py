"""Plain-rules model of Madden's playoff tiebreakers. Run: python3 plain_model.py"""
import os,sys,json,collections
HERE=os.path.dirname(os.path.abspath(__file__)); A=os.path.dirname(HERE); sys.path.insert(0,A)
cwd=os.getcwd(); os.chdir(A)
from sim import Lg,LEAGUES,EPS
os.chdir(cwd)
CHECKLIST=['H2H','DIV','COM','CONF','SOV','SOS','NET']   # NFL division-race checklist

def tiers(vals):
    ks=sorted({round(v,9) for v in vals.values()},reverse=True)
    return [sorted(t for t in vals if abs(round(vals[t],9)-k)<EPS) for k in ks]

def step(lg,G,st):
    if st=='H2H':
        g=[x[1] for x in lg.rec[G[0]] if x[0]==G[1]]
        if not g or abs(sum(g)/len(g)-.5)<EPS: return None
        return [[G[0]],[G[1]]] if sum(g)/len(g)>.5 else [[G[1]],[G[0]]]
    if st=='COM':
        c=lg.common(G); vals={}
        for t in G:
            g=[x for x in lg.rec[t] if x[0] in c]
            if not g: return None
            vals[t]=lg.wp(g)
    else:
        f={'DIV':lg.m_div,'CONF':lg.m_conf,'SOV':lg.m_sov,'SOS':lg.m_sos,'NET':lg.m_net}[st]; vals={t:f(t) for t in G}
    T=tiers(vals); return T if len(T)>1 else None

def two(lg,G):                       # Rule 1: two teams, any situation
    for st in CHECKLIST:
        T=step(lg,G,st)
        if T: return [T[0][0],T[1][0]]
    return sorted(G)

def division_title(lg,G):            # Rule 2: drop the worst team on the checklist, start over
    G=list(G)
    while len(G)>2:
        for st in CHECKLIST:
            if st=='H2H':
                vals={t:(lambda g:sum(g)/len(g) if g else .5)([x[1] for x in lg.rec[t] if x[0] in G and x[0]!=t]) for t in G}
                T=tiers(vals); T=T if len(T)>1 else None
            else: T=step(lg,G,st)
            if T: G=[t for t in G if t not in T[-1]] or G; break
        else: return sorted(G)[0]
    return two(lg,G)[0] if len(G)==2 else G[0]

def seeding(lg,G):                   # Rule 3: three or more teams tied for seeding or a wild card
    G=list(G)
    if len(G)<=2: return two(lg,G) if len(G)==2 else G
    nowin=[t for t in G if all(x[1]==0.0 for x in lg.rec[t] if x[0] in G and x[0]!=t)]
    if len(nowin)==1:                # 3a: the only team that beat none of the others goes last
        return seeding(lg,[t for t in G if t not in nowin])+nowin
    pct={}
    for t in G:                      # 3b: head-to-head record vs the others, read backwards (no games = .500)
        g=[x[1] for x in lg.rec[t] if x[0] in G and x[0]!=t]
        pct[t]=-(sum(g)/len(g)) if g else -.5
    T=tiers(pct)
    if len(T)==1:
        for st in CHECKLIST[1:]:
            T=step(lg,G,st)
            if T: break
        else: return sorted(G)
    return [x for t in T for x in seeding(lg,t)]

def seeds(lg,conf):
    teams=[t for t in lg.T if lg.T[t]['conf']==conf]; divs=collections.defaultdict(list)
    for t in teams: divs[lg.T[t]['div']].append(t)
    winners=[]
    for ts in divs.values():
        top=max(lg.pct[t] for t in ts); G=[t for t in ts if abs(lg.pct[t]-top)<EPS]
        winners.append(G[0] if len(G)==1 else (two(lg,G)[0] if len(G)==2 else division_title(lg,G)))
    def order(group,slots):
        out=[]
        for p in sorted({round(lg.pct[t],9) for t in group},reverse=True):
            if len(out)>=slots: break
            G=[t for t in group if abs(lg.pct[t]-p)<EPS]; r=seeding(lg,G)
            if len(out)+len(G)>slots:  # Rule 4: decide who gets in, then seed those teams against each other
                k=slots-len(out); r=seeding(lg,r[:k])
            out+=r
        return out[:slots]
    return order(winners,4)+order([t for t in teams if t not in winners],3)

if __name__=='__main__':
    leagues=LEAGUES+[Lg(json.load(open(os.path.join(HERE,'madden26_2025.json'))))]
    ok=0
    for lg in leagues:
        for c in ('AFC','NFC'):
            s=seeds(lg,c); hit=s in lg.seeds[c]; ok+=hit
            if not hit: print(f"MISS {lg.id} {c}: model {' '.join(s)}  Madden {' '.join(lg.seeds[c][0])}")
    print(f"{ok}/{2*len(leagues)} conferences match Madden")
