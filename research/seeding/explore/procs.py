import snapgroups as S

CRIT = ['H2H', 'DIV', 'COM', 'CONF', 'SOV', 'SOS', 'NET_CONF', 'NET_ALL']

def team_val(s, crit, t):
    if crit == 'DIV': return S.div_pct(s, t)
    if crit == 'CONF': return S.conf_pct(s, t)
    if crit == 'SOV': return S.sov(s, t)
    if crit == 'SOS': return S.sos(s, t)
    if crit == 'NET_CONF': return s['cnet'][t]
    if crit == 'NET_ALL': return s['pf'][t] - s['pa'][t]
    raise KeyError(crit)

def values(s, crit, C, scope, prog):
    if crit == 'H2H':
        hv = prog.get('h2h', 'wins')
        out = {}
        for t in C:
            others = [o for o in scope if o != t]
            w, l, tt = S.rec_vs(s, t, others)
            if hv == 'wins': out[t] = w + tt / 2
            elif hv == 'net': out[t] = w - l
            elif hv == 'pct_half': out[t] = S.pct(w, l, tt) if w + l + tt else .5
            elif hv == 'beaten': out[t] = sum(1 for o in others if s['W'][(t, o)] > 0)
            elif hv == 'series': out[t] = sum(1 for o in others if s['W'][(t, o)] > s['L'][(t, o)]) + 0.5 * sum(1 for o in others if s['W'][(t, o)] == s['L'][(t, o)] and s['W'][(t, o)] + s['T'][(t, o)] > 0)
        return out
    if crit == 'COM':
        v = S.common_pct(s, list(scope), prog.get('com_min', 0))
        if v is None: return None
        return {t: v[t] for t in C}
    return {t: team_val(s, crit, t) for t in C}

def two(s, a, b, crits=CRIT, com_min=0, invert=()):
    for c in crits:
        if c == 'H2H':
            w, l, tt = S.rec_vs(s, a, [b])
            if w + l + tt == 0 or w == l: continue
            return a if w > l else b
        v = values(s, c, [a, b], [a, b], dict(com_min=com_min))
        if v is None or abs(v[a] - v[b]) < 1e-12: continue
        if c in invert: return b if v[a] > v[b] else a
        return a if v[a] > v[b] else b
    return min(a, b)

def eq(x, y): return abs(x - y) < 1e-9

def step(v, C, kind):
    vals = [v[t] for t in C]
    lo, hi = min(vals), max(vals)
    if eq(lo, hi): return None
    lows = [t for t in C if eq(v[t], lo)]; highs = [t for t in C if eq(v[t], hi)]
    if kind == 'separated_bottom':
        if len(lows) == 1: return ('drop', lows)
        if len(highs) == 1: return ('drop', highs)
        return None
    if kind == 'farthest_mean':
        m = sum(vals) / len(vals); d = {t: abs(v[t] - m) for t in C}; mx = max(d.values())
        far = [t for t in C if eq(d[t], mx)]
        if len(far) == 1: return ('drop', far)
        flo = min(v[t] for t in far); fl = [t for t in far if eq(v[t], flo)]
        return ('drop', fl) if len(fl) == 1 else None
    if kind == 'best_first':
        if len(highs) == 1: return ('pick', highs)
        return ('drop', [t for t in C if not eq(v[t], hi)])
    if kind == 'worst_first':
        return ('drop', lows) if len(lows) == 1 else None
    if kind == 'worst_tier':
        return ('drop', lows)
    if kind == 'cluster':
        cl = {}
        for t in C: cl.setdefault(round(v[t], 9), []).append(t)
        sizes = sorted((len(x) for x in cl.values()), reverse=True)
        if sizes[0] == 1: return ('drop', lows)
        if sizes.count(sizes[0]) > 1: return None
        keep = [x for x in cl.values() if len(x) == sizes[0]][0]
        return ('drop', [t for t in C if t not in keep])
    if kind == 'odd_or_rank':
        cl = {}
        for t in C: cl.setdefault(round(v[t], 9), []).append(t)
        if all(len(x) == 1 for x in cl.values()):
            return ('rankall', sorted(C, key=lambda t: -v[t]))
        if len(cl) == 2:
            small = min(cl.values(), key=len)
            if len(small) == 1: return ('drop', small)
        return None
    raise KeyError(kind)

def rank(s, group, prog):
    crits = prog.get('criteria', CRIT)
    orig = list(group); C = sorted(group); top = []; dropped = []; ci = 0
    while len(C) > 1:
        if len(C) == 2 and prog.get('pair') == 'checklist':
            w = two(s, C[0], C[1], com_min=prog.get('com_min', 0))
            top.append(w); C = [t for t in C if t != w]; break
        if ci >= len(crits):
            top.extend(sorted(C)); C = []; break
        c = crits[ci]
        scope = orig if prog.get('scope', {}).get(c, 'original' if c == 'H2H' else 'current') == 'original' else C
        v = values(s, c, C, scope, prog)
        r = step(v, C, prog['step']) if v is not None else None
        if r is None:
            ci += 1; continue
        kind, ts = r
        if kind == 'rankall':
            top.extend(ts); C = []; break
        if kind == 'pick':
            top.extend(ts)
        else:
            if len(ts) > 1:
                ts = rank(s, ts, prog)
            dropped.append(ts)
        C = [t for t in C if t not in ts]
        a = prog.get('after', 'stay')
        ci = 0 if a == 'restart' else ci if a == 'stay' else ci + 1
    order = top + C
    for ts in reversed(dropped):
        order.extend(ts)
    return order
