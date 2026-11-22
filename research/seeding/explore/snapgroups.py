import json, glob, collections, os
SNAP = '/home/honeycke/code/rzs-stats/research/seeding/data/snapshots'

def load():
    idx = json.load(open(os.path.join(SNAP, '_index.json')))
    out = []
    for f in sorted(glob.glob(os.path.join(SNAP, '*-s*-w*.json'))):
        name = os.path.basename(f)
        if idx.get(name, {}).get('status') != 'accepted':
            continue
        d = json.load(open(f))
        if d['league']['week'] < 18:
            continue
        out.append(season(d, name))
    return out

def season(d, name):
    st = {t['abbrName']: t for t in d['standings']}
    teams = {a: dict(conf=t['conferenceName'], div=t['divName'], id=t['teamId'], seed=t['seed'], status=t['playoffStatus'],
                     rec=(t['totalWins'], t['totalLosses'], t['totalTies'])) for a, t in st.items()}
    W = collections.Counter(); L = collections.Counter(); T = collections.Counter()
    pf = collections.Counter(); pa = collections.Counter(); cnet = collections.Counter()
    opp = collections.defaultdict(list)
    for g in d['games']:
        if g['status'] < 2 or g.get('is_superseded') or not 0 <= g['weekIndex'] <= 17:
            continue
        h, a = g['homeTeam']['abbrName'], g['awayTeam']['abbrName']
        hs, as_ = g['homeScore'], g['awayScore']
        tie = g['status'] == 4 or hs == as_
        if tie:
            T[(h, a)] += 1; T[(a, h)] += 1
        elif hs > as_:
            W[(h, a)] += 1; L[(a, h)] += 1
        else:
            W[(a, h)] += 1; L[(h, a)] += 1
        pf[h] += hs; pa[h] += as_; pf[a] += as_; pa[a] += hs
        if teams[h]['conf'] == teams[a]['conf']:
            cnet[h] += hs - as_; cnet[a] += as_ - hs
        opp[h].append(a); opp[a].append(h)
    return dict(name=name, league=d['league']['abbrev'], teams=teams, W=W, L=L, T=T, pf=pf, pa=pa, cnet=cnet, opp=opp)

def pct(w, l, t):
    g = w + l + t
    return (w + t / 2) / g if g else 0.0

def rec_vs(s, t, others):
    w = sum(s['W'][(t, o)] for o in others); l = sum(s['L'][(t, o)] for o in others); tt = sum(s['T'][(t, o)] for o in others)
    return w, l, tt

def overall(s, t):
    return rec_vs(s, t, [o for o in s['teams'] if o != t])

def div_pct(s, t):
    return pct(*rec_vs(s, t, [o for o in s['teams'] if o != t and s['teams'][o]['div'] == s['teams'][t]['div']]))

def conf_pct(s, t):
    return pct(*rec_vs(s, t, [o for o in s['teams'] if o != t and s['teams'][o]['conf'] == s['teams'][t]['conf']]))

def common_pct(s, group, minimum=0):
    common = None
    for t in group:
        o = set(s['opp'][t]) - set(group)
        common = o if common is None else common & o
    vals = {}
    for t in group:
        w, l, tt = rec_vs(s, t, common)
        if w + l + tt < minimum:
            return None
        vals[t] = pct(w, l, tt)
    return vals

def win_pct_team(s, t):
    return pct(*overall(s, t))

def sov(s, t):
    beaten = []
    for o in s['teams']:
        beaten += [o] * s['W'][(t, o)]
    return sum(win_pct_team(s, o) for o in beaten) / len(beaten) if beaten else 0.0

def sos(s, t):
    return sum(win_pct_team(s, o) for o in s['opp'][t]) / len(s['opp'][t])

def groups(s):
    out = []
    for conf in ('AFC', 'NFC'):
        ts = [a for a, v in s['teams'].items() if v['conf'] == conf]
        dw = [a for a in ts if s['teams'][a]['seed'] <= 4]
        rest = [a for a in ts if a not in dw]
        for pool, kind in ((dw, 'DW'), (rest, 'NONDW')):
            by = collections.defaultdict(list)
            for a in pool:
                w, l, t = s['teams'][a]['rec']
                by[round((w + t / 2) / (w + l + t), 9)].append(a)
            for rec, g in by.items():
                if len(g) < 2:
                    continue
                order = tuple(sorted(g, key=lambda a: s['teams'][a]['seed']))
                seeds = [s['teams'][a]['seed'] for a in order]
                zone = kind
                if kind == 'NONDW':
                    zone = 'cut' if min(seeds) <= 7 < max(seeds) else ('wc' if max(seeds) <= 7 else 'np')
                out.append(dict(season=s, conf=conf, kind=kind, zone=zone, order=order, size=len(g)))
    return out
