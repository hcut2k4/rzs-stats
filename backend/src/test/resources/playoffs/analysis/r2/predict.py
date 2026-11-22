"""Usage: python3 predict.py <season.json>   (same shape as one dataset.json entry: id, teams, games; seeds optional)
Prints NFL / M3 / M4 / M4-variant seeds per conference and the tie groups where they disagree."""
import sys,os,json,collections
R=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,R)
from m4 import Engine,Lg,EPS,WCLIST
A=os.path.dirname(R)
cwd=os.getcwd(); os.chdir(A); sys.argv_saved=sys.argv; 
exec(open('divwc.py').read().split("L2=['H2H','DIV','COM','CONF','SOV','SOS','NET']")[0])
os.chdir(cwd)
L2=['H2H','DIV','COM','CONF','SOV','SOS','NET']
M3=MB2(L2=L2,L2div=L2,post2=['H2H','CONF','COM4','SOV','SOS','NET'],RL=['H2HINV','DIV','CONF','COM','SOV','SOS','NET'],RL_normal=['H2H','DIV','CONF','COM','SOV','SOS','NET'],
      LM=['SWEEPL','REDUCE','PCTINV_HALF','COM','CONF','DIV','SOV','SOS','NET'],red='none',mode='tiered',sel='then_order',post_after_multi=False)
NFL=dict(two_mode='nfl',tail_mode='nfl',h2h_dir='nfl',lost_all='strict',beat_all='advance_strict',reduce='first',reduce_h2h='desc',com_scope='fresh',select='take')
MODELS={'NFL':lambda lg,c:Engine(**NFL).seeds(lg,c),'M3':lambda lg,c:seeds2(M3,lg,c),'M4':lambda lg,c:Engine().seeds(lg,c),
        'M4 alt: CONF>COM inner pairs, fresh common':None,'M4 alt: ascending net W-L':lambda lg,c:Engine(h2h_qty='net').seeds(lg,c)}
del MODELS['M4 alt: CONF>COM inner pairs, fresh common']
def run(d):
    d.setdefault('seeds',{'AFC':[],'NFC':[]}); lg=Lg(d)
    for c in ('AFC','NFC'):
        out={n:f(lg,c) for n,f in MODELS.items()}
        print(f"== {d['id']} {c}")
        for n,s in out.items(): print(f"   {n:26} {' '.join(s)}" + ("   <- matches Madden" if d['seeds'].get(c) and s in d['seeds'][c] else ""))
        if len({tuple(s) for s in out.values()})>1: print("   ** models disagree: this conference discriminates between them")
if __name__=='__main__':
    d=json.load(open(sys.argv_saved[1])); [run(x) for x in (d if isinstance(d,list) else [d])]
