import sys,os,itertools,pickle,collections; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from m4 import *
TWO={'nfl':dict(two_mode='nfl'),'div':dict(two_list=DIVLIST),'div_confcom':dict(two_list=['H2H','DIV','CONF','COM','SOV','SOS','NET']),'conf_div':dict(two_list=['H2H','CONF','DIV','COM','SOV','SOS','NET'])}
TAIL={'nfl':dict(tail_mode='nfl'),'div':dict(tail_mode='fixed',multi_list=DIVLIST)}
GRID=dict(two=list(TWO),tail=list(TAIL),h2h_dir=['nfl','desc','asc','skip'],h2h_nogames=[0.5,0.0,1.0],lost_all=['strict','nowins','none'],
          beat_all=['advance_strict','none','eliminate','advance'],reduce=['first','after_lostall','none'],reduce_h2h=['desc','asc','none'],com_scope=['fresh','orig'],select=['take','then_order'])
NFLV=dict(two='nfl',tail='nfl',h2h_dir='nfl',h2h_nogames=0.5,lost_all='strict',beat_all='advance_strict',reduce='first',reduce_h2h='desc',com_scope='fresh',select='take')
CONFS=[(lg.id,c) for lg in LEAGUES for c in ('AFC','NFC')]
def build(p):
    kw={k:v for k,v in p.items() if k not in ('two','tail')}; kw.update(TWO[p['two']]); kw.update(TAIL[p['tail']]); return Engine(**kw)
def vec(e):
    v=[]
    for lg in LEAGUES:
        for c in ('AFC','NFC'): v.append(e.seeds(lg,c) in lg.seeds[c])
    h=[]
    for name,G,ctx,k,want in HELD_CASES:
        r=e.rank(HELD,G,ctx); h.append((r[:1] if ctx=='div' else (r[:k] if k else r))==want)
    return v,h
if __name__=='__main__':
    keys=list(GRID); res=[]
    for combo in itertools.product(*[GRID[k] for k in keys]):
        p=dict(zip(keys,combo))
        if p['reduce']=='none' and p['reduce_h2h']!='desc': continue
        if p['h2h_dir'] in ('nfl','skip') and p['h2h_nogames']!=0.5: continue
        v,h=vec(build(p)); dev=sum(p[k]!=NFLV[k] for k in keys)
        res.append((p,v,h,dev))
    pickle.dump(res,open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'m4_family.pkl'),'wb')); print('models',len(res))
