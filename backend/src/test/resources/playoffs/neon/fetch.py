import json,urllib.request,time,os,sys
B="https://neonsportz.com/api/leagues/"
def get(url):
    for i in range(3):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
            return json.load(urllib.request.urlopen(req,timeout=60))
        except Exception as e: print("retry",url,e,file=sys.stderr); time.sleep(3)
    raise SystemExit("failed "+url)
def slim_team(t): return {k:t.get(k) for k in ('teamId','abbrName','displayName','conferenceName','divName')}
for L in sys.argv[1:]:
    lg=json.load(open(f'{L}-league.json')); cur=lg['season']
    out={'league':L,'currentSeason':cur,'week':lg['week'],'seasons':{}}
    for s in range(0,cur+1):
        url=f"{B}{L}/games/?seasonIndex={s}&size=100"; games=[]
        while url:
            d=get(url); games+=d['results']; url=d['next']; time.sleep(0.5)
        out['seasons'][s]=[{'week':g['weekIndex'],'stage':g['stageIndex'],'status':g['status'],'home':slim_team(g['homeTeam']),'away':slim_team(g['awayTeam']),'homeScore':g['homeScore'],'awayScore':g['awayScore'],'gameId':g['gameId']} for g in games]
        print(L,s,len(games),flush=True)
    st=get(f"{B}{L}/standings/"); time.sleep(0.5)
    out['standings']=[{k:t.get(k) for k in ('teamId','abbrName','conferenceName','divName','seasonIndex','weekIndex','stageIndex','seed','rank','playoffStatus','totalWins','totalLosses','totalTies','confWins','confLosses','divWins','divLosses','ptsFor','ptsAgainst')} for t in st]
    json.dump(out,open(f'{L}-data.json','w'))
