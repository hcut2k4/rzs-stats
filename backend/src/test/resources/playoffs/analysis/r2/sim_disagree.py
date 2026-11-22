import sys,json,random,collections,math,os
R=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,R)
sys.argv_saved=['x']
exec(open(R+'/predict.py').read().split("def run(d):")[0])
D=json.load(open(os.path.join(os.path.dirname(R),'dataset.json')))
random.seed(int(sys.argv[1]) if len(sys.argv)>1 else 1)
N=int(sys.argv[2]) if len(sys.argv)>2 else 1500
pairs=[('M3','M4'),('M4','M4 alt: ascending net W-L'),('NFL','M4')]
cnt=collections.Counter(); ex=collections.defaultdict(list); confs=0
for i in range(N):
    base=D[i%len(D)]; s={t:random.gauss(0,1) for t in base['teams']}
    games=[]
    for w,h,a,_,_ in base['games']:
        p=1/(1+math.exp(-(s[h]-s[a]+0.1)))
        hw=random.random()<p; ws=random.randint(17,38); ls=random.randint(3,ws-1)
        games.append([w,h,a,ws if hw else ls, ls if hw else ws])
    d={'id':f"R{i}",'teams':base['teams'],'games':games,'seeds':{'AFC':[],'NFC':[]}}; lg=Lg(d)
    for c in ('AFC','NFC'):
        confs+=1; out={n:MODELS[n](lg,c) for n in ('NFL','M3','M4','M4 alt: ascending net W-L')}
        for a,b in pairs:
            if out[a]!=out[b]:
                cnt[(a,b)]+=1
                if len(ex[(a,b)])<40: ex[(a,b)].append((d,c,out[a],out[b]))
print(f"{confs} simulated conferences")
for k in pairs: print(f"  {k[0]} vs {k[1]}: differ in {cnt[k]} ({cnt[k]/confs:.1%})")
