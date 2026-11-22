import sys, collections
sys.path.insert(0, '/home/honeycke/code/rzs-stats/research/seeding')
from corpus import load_corpus
from observe import observe

def to_s(season):
    teams = {a: dict(conf=v['conf'], div=v['div'], id=v.get('teamId')) for a, v in season['teams'].items()}
    W = collections.Counter(); L = collections.Counter(); T = collections.Counter()
    pf = collections.Counter(); pa = collections.Counter(); cnet = collections.Counter(); opp = collections.defaultdict(list)
    for g in season['games']:
        if not 0 <= g['weekIndex'] <= 17: continue
        h, a, hs, as_ = g['home'], g['away'], g['homeScore'], g['awayScore']
        if g.get('status') == 4 or hs == as_:
            T[(h, a)] += 1; T[(a, h)] += 1
        elif hs > as_:
            W[(h, a)] += 1; L[(a, h)] += 1
        else:
            W[(a, h)] += 1; L[(h, a)] += 1
        pf[h] += hs; pa[h] += as_; pf[a] += as_; pa[a] += hs
        if teams[h]['conf'] == teams[a]['conf']:
            cnet[h] += hs - as_; cnet[a] += as_ - hs
        opp[h].append(a); opp[a].append(h)
    for t in teams:
        w = sum(W[(t, o)] for o in teams); l = sum(L[(t, o)] for o in teams); tt = sum(T[(t, o)] for o in teams)
        teams[t]['rec'] = (w, l, tt)
    return dict(name=season['id'], league=season['league'], teams=teams, W=W, L=L, T=T, pf=pf, pa=pa, cnet=cnet, opp=opp)

def pctrec(r):
    w, l, t = r; g = w + l + t
    return (w + t / 2) / g if g else 0

def run(rank_fn, seasons=None, want=('DIV2', 'DIV3P', 'WC2', 'WC3P', 'DSEED', 'WSEED'), misses=None):
    seasons = seasons if seasons is not None else load_corpus()
    assert all(x['split'] != 'fresh' for x in seasons)
    c = collections.Counter(); n = collections.Counter()
    for season in seasons:
        o = observe(season); s = to_s(season)
        conf_info = o['conferences']
        for d in o['decisions']:
            if d.category not in want: continue
            info = conf_info[d.conference]
            dws = set(info['division_winners']) if info.get('division_winners') else set()
            if len(dws) != 4:
                ms = season.get('madden_seeds', {}).get(d.conference) or (season.get('snapshot_seeds') or {}).get(d.conference)
                if ms and isinstance(ms[0], (list, tuple)): ms = ms[0]
                dws = set(ms[:4]) if ms else dws
            g = list(d.tied_group)
            rec = round(pctrec(s['teams'][g[0]]['rec']), 9)
            members = [a for a, v in s['teams'].items() if v['conf'] == d.conference]
            if d.category.startswith('DIV'):
                div = s['teams'][g[0]]['div']
                full = [a for a in members if s['teams'][a]['div'] == div and round(pctrec(s['teams'][a]['rec']), 9) == rec]
            elif d.category in ('WC2', 'WC3P', 'WSEED'):
                full = [a for a in members if a not in dws and round(pctrec(s['teams'][a]['rec']), 9) == rec]
            else:
                full = sorted(set(g) | {a for a in members if a in dws and round(pctrec(s['teams'][a]['rec']), 9) == rec})
            order = rank_fn(s, full)
            if d.category.startswith('DIV'):
                ok = order[0] in d.outcome['qualified'] and len(d.outcome['qualified']) == 1
            elif d.category.startswith('WC'):
                k = len(d.outcome['qualified'])
                ok = set(order[:k] if set(g) == set(full) else [t for t in order if t in g][:k]) == set(d.outcome['qualified'])
            else:
                sub = [t for t in order if t in g]
                ok = any(tuple(sub) == tuple(t for t in cand if t in g) for cand in d.outcome['orders'])
            size = len(g)
            key = (d.category, '2' if size == 2 else '3' if size == 3 else '4+')
            n[key] += 1; c[key] += ok
            if not ok and misses is not None:
                misses.append((season['id'], d.conference, d.category, tuple(sorted(g)), tuple(full), tuple(order), d.outcome.get('qualified'), d.outcome.get('orders')))
    return c, n


def reference_seeds(s, conf):
    import ctop2
    rank = lambda g: ctop2.R(s, g, dict(tie_after='restart')) if len(g) > 1 else list(g)
    ts = [a for a, v in s['teams'].items() if v['conf'] == conf]
    pct = lambda a: round(pctrec(s['teams'][a]['rec']), 9)
    divisions = collections.defaultdict(list)
    for a in ts:
        divisions[s['teams'][a]['div']].append(a)
    winners = []
    for members in divisions.values():
        best = max(pct(a) for a in members)
        winners.append(rank([a for a in members if pct(a) == best])[0])

    def order(pool):
        out = []
        for p in sorted({pct(a) for a in pool}, reverse=True):
            out += rank([a for a in pool if pct(a) == p])
        return out
    return order(winners) + order([a for a in ts if a not in winners])[:3]
