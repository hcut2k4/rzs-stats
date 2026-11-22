import json,collections,itertools,sys
EPS=1e-9
IDX={n:i for i,n in enumerate("SF CHI CIN BUF DEN CLE TB AZ LAC KC IND WAS DAL MIA PHI ATL NYG JAX NYJ DET GB CAR NE LV LAR BAL NO SEA PIT HOU TEN MIN".split())}
DATA=json.load(open('dataset.json'))
class St:
    def __init__(s,teams,games):
        s.T=teams; s.rec=collections.defaultdict(list)
        for w,h,a,hs,as_ in games:
            r=1.0 if hs>as_ else 0.0 if hs<as_ else .5
            s.rec[h].append((a,r,hs,as_)); s.rec[a].append((h,1-r,as_,hs))
        s.W={t:sum(x[1] for x in s.rec[t]) for t in teams}; s.N={t:len(s.rec[t]) for t in teams}
        s.pct={t:(s.W[t]/s.N[t] if s.N[t] else 0.0) for t in teams}
        s.pf={t:sum(x[2] for x in s.rec[t]) for t in teams}; s.pa={t:sum(x[3] for x in s.rec[t]) for t in teams}
    def wp(s,l): return sum(x[1] for x in l)/len(l) if l else None
    def val(s,st,a,b):
        """returns (va,vb) for pairwise step, or None if not applicable"""
        ra,rb=s.rec[a],s.rec[b]
        if st=='H2H':
            g=[x for x in ra if x[0]==b]
            return (s.wp(g),1-s.wp(g)) if g else None
        if st=='DIV':
            x=s.wp([x for x in ra if s.T[x[0]]['div']==s.T[a]['div']]); y=s.wp([x for x in rb if s.T[x[0]]['div']==s.T[b]['div']])
            return None if x is None or y is None else (x,y)
        if st=='CONF':
            x=s.wp([x for x in ra if s.T[x[0]]['conf']==s.T[a]['conf']]); y=s.wp([x for x in rb if s.T[x[0]]['conf']==s.T[b]['conf']])
            return None if x is None or y is None else (x,y)
        if st in ('COM','COM4'):
            c=({x[0] for x in ra}&{x[0] for x in rb})-{a,b}
            ga=[x for x in ra if x[0] in c]; gb=[x for x in rb if x[0] in c]
            if not ga or (st=='COM4' and len(ga)<4) or (st=='COM4' and len(gb)<4): return None
            return (s.wp(ga),s.wp(gb))
        if st=='SOV':
            f=lambda r:(lambda w:(sum(s.W[x[0]] for x in w)/sum(s.N[x[0]] for x in w)) if w else 0)([x for x in r if x[1]==1.0])
            return (f(ra),f(rb))
        if st=='SOS':
            f=lambda r:sum(s.W[x[0]] for x in r)/sum(s.N[x[0]] for x in r) if r else 0
            return (f(ra),f(rb))
        if st=='NET': return (s.pf[a]-s.pa[a],s.pf[b]-s.pa[b])
        if st=='NETCOM':
            c=({x[0] for x in ra}&{x[0] for x in rb})-{a,b}
            if not c: return None
            return (sum(x[2]-x[3] for x in ra if x[0] in c),sum(x[2]-x[3] for x in rb if x[0] in c))
        raise ValueError(st)
def make_cmp(s,L,dw=None):
    def cmp(a,b):   # negative => a ranks ahead of b
        if dw is not None:
            da,db=a in dw,b in dw
            if da!=db: return -1 if da else 1
        if abs(s.pct[a]-s.pct[b])>EPS: return -1 if s.pct[a]>s.pct[b] else 1
        for st in L:
            v=s.val(st,a,b)
            if v is None or v[0] is None or v[1] is None or abs(v[0]-v[1])<EPS: continue
            return -1 if v[0]>v[1] else 1
        return 0
    return cmp
def insertion(arr,cmp):
    a=list(arr)
    for i in range(1,len(a)):
        x=a[i]; j=i-1
        while j>=0 and cmp(x,a[j])<0:
            a[j+1]=a[j]; j-=1
        a[j+1]=x
    return a
def bubble(arr,cmp):
    a=list(arr); n=len(a)
    for i in range(n):
        for j in range(n-1-i):
            if cmp(a[j+1],a[j])<0: a[j],a[j+1]=a[j+1],a[j]
    return a
def selection(arr,cmp):
    a=list(arr); out=[]
    while a:
        b=a[0]
        for x in a[1:]:
            if cmp(x,b)<0: b=x
        out.append(b); a.remove(b)
    return out
ALGS={'insertion':insertion,'bubble':bubble,'selection':selection}
def seeds(d,L,alg,init,weekly,conf_scope):
    teams=d['teams']; games=d['games']
    weeks=sorted({g[0] for g in games}) if weekly else [None]
    confs={c:[t for t in teams if teams[t]['conf']==c] for c in ('AFC','NFC')}
    order0=lambda ts:sorted(ts,key=lambda t:IDX[t]) if init=='idx' else (sorted(ts) if init=='alpha' else sorted(ts,key=lambda t:-IDX[t]))
    divorder={}; conforder={}
    for c,ts in confs.items():
        for dv in {teams[t]['div'] for t in ts}: divorder[dv]=order0([t for t in ts if teams[t]['div']==dv])
        conforder[c]=order0(ts)
    for wk in weeks:
        s=St(teams,[g for g in games if wk is None or g[0]<=wk])
        for dv in divorder: divorder[dv]=alg(divorder[dv],make_cmp(s,L))
        dws={v[0] for v in divorder.values()}
        for c in conforder:
            if conf_scope=='all': conforder[c]=alg(conforder[c],make_cmp(s,L,dws))
            else:
                dw=alg([t for t in conforder[c] if t in dws],make_cmp(s,L)); wc=alg([t for t in conforder[c] if t not in dws],make_cmp(s,L))
                conforder[c]=dw+wc
    return {c:conforder[c][:7] for c in conforder}
def score(L,alg,init,weekly,scope,verbose=False):
    ok=0; fails=[]
    for d in DATA:
        S=seeds(d,L,ALGS[alg],init,weekly,scope)
        for c in ('AFC','NFC'):
            if S[c] in d['seeds'][c]: ok+=1
            else: fails.append(f"{d['id']} {c}")
    return ok,fails
if __name__=='__main__':
    lists=[['H2H','DIV','COM','CONF','SOV','SOS','NETCOM','NET'],['H2H','DIV','CONF','COM','SOV','SOS','NET'],
           ['H2H','DIV','COM4','CONF','SOV','SOS','NET'],['H2H','DIV','CONF','COM4','SOV','SOS','NET']]
    res=[]
    for L in lists:
        for alg in ALGS:
            for init in ('idx','alpha','idxrev'):
                for weekly in (False,True):
                    for scope in ('all','split'):
                        ok,f=score(L,alg,init,weekly,scope); res.append((ok,L[:4],alg,init,weekly,scope,f))
    res.sort(key=lambda r:-r[0])
    for r in res[:15]: print(r[0],r[1:6],r[6] if r[0]>=28 else '')
