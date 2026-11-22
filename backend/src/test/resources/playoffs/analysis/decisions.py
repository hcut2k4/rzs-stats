from sim import *
def decisions(lg,cand_index=None):
    out=[]   # (ctx, group, kind, data)  kind: 'order' full order of group, 'member' (inset, outset)
    for c in ('AFC','NFC'):
        cands=lg.seeds[c] if cand_index is None else [lg.seeds[c][cand_index]]
        if len(cands)>1: continue
        S=cands[0]; teams=[t for t in lg.T if lg.T[t]['conf']==c]; dws=S[:4]
        divs=collections.defaultdict(list)
        for t in teams: divs[lg.T[t]['div']].append(t)
        for d,ts in divs.items():
            top=max(lg.pct[t] for t in ts); G=[t for t in ts if abs(lg.pct[t]-top)<EPS]
            if len(G)>1:
                w=[t for t in G if t in dws]; out.append((lg.id,c,'div',G,'member',(w,[t for t in G if t not in w])))
        for p in {round(lg.pct[t],9) for t in dws}:
            G=[t for t in dws if abs(lg.pct[t]-p)<EPS]
            if len(G)>1: out.append((lg.id,c,'dw',sorted(G,key=S.index),'order',None))
        wcs=[t for t in teams if t not in dws]; inn=S[4:]
        for p in {round(lg.pct[t],9) for t in wcs}:
            G=[t for t in wcs if abs(lg.pct[t]-p)<EPS]
            if len(G)<2: continue
            i=[t for t in G if t in inn]
            if not i: continue
            if len(i)==len(G): out.append((lg.id,c,'wc',sorted(G,key=S.index),'order',None))
            else: out.append((lg.id,c,'wc',sorted(i,key=S.index)+[t for t in G if t not in i],'cut',len(i)))
    return out
ALL=[d for lg in LEAGUES for d in decisions(lg)]
if __name__=='__main__':
    cnt=collections.Counter((d[2],len(d[3]),d[4]) for d in ALL)
    for k,v in sorted(cnt.items()): print(k,v)
