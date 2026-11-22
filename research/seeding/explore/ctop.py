import snapgroups as S
from procs import values, two, eq
CRIT = ['H2H', 'DIV', 'COM', 'CONF', 'SOV', 'SOS', 'NET_CONF', 'NET_ALL']

def clusters(v, G):
    cl = {}
    for t in G:
        cl.setdefault(round(v[t], 9), []).append(t)
    return cl

def R(s, G, ci=0, opt=None):
    opt = opt or {}
    crits = opt.get('criteria', CRIT)
    G = sorted(G)
    if len(G) <= 1:
        return G
    if len(G) == 2 and opt.get('pair', 'checklist') == 'checklist':
        w = two(s, G[0], G[1], crits, opt.get('com_min', 0), opt.get('invert', ()))
        return [w, G[1] if w == G[0] else G[0]]
    if ci >= len(crits):
        return G
    v = values(s, crits[ci], G, G, opt)
    if v is None:
        return R(s, G, ci + 1, opt)
    if crits[ci] in opt.get('invert', ()):
        v = {t: -x for t, x in v.items()}
    cl = clusters(v, G)
    if len(cl) == 1:
        return R(s, G, ci + 1, opt)
    sizes = sorted((len(x) for x in cl.values()), reverse=True)
    if sizes[0] == 1:
        return sorted(G, key=lambda t: -v[t])
    big = [k for k, x in cl.items() if len(x) == sizes[0]]
    if len(big) > 1:
        mode = opt.get('tie', 'low')
        if mode == 'silent':
            return R(s, G, ci + 1, opt)
        if mode == 'strip':
            keep = [t for k in big for t in cl[k]]
            rest = [k for k in cl if k not in big]
            if not rest:
                return R(s, G, ci + 1, opt)
            out = R(s, keep, ci + 1, opt)
            for val in sorted(rest, reverse=True):
                out += R(s, cl[val], 0, opt) if len(cl[val]) > 1 else cl[val]
            return out
        key = min(big) if mode == 'low' else max(big)
    else:
        key = big[0]
    K = cl[key]
    out = R(s, K, 0, opt)
    for val in sorted((k for k in cl if k != key), reverse=True):
        out += R(s, cl[val], 0, opt) if len(cl[val]) > 1 else cl[val]
    return out
