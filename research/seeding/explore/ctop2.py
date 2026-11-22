from procs import values, two
import ctop
CRIT = ctop.CRIT

def R(s, G, opt, ci=0):
    main, sink = _R(s, sorted(G), ci, opt)
    return main + sink

def _sub(s, ts, opt):
    if len(ts) == 1:
        return list(ts), []
    return _R(s, sorted(ts), 0, opt)

def _R(s, G, ci, opt):
    crits = opt.get('criteria', CRIT)
    if len(G) <= 1:
        return G, []
    if len(G) == 2:
        w = two(s, G[0], G[1], crits, opt.get('com_min', 0), opt.get('invert', ()))
        return [w, G[1] if w == G[0] else G[0]], []
    if ci >= len(crits):
        return G, []
    v = values(s, crits[ci], G, G, opt)
    if v is None:
        return _R(s, G, ci + 1, opt)
    cl = ctop.clusters(v, G)
    if len(cl) == 1:
        return _R(s, G, ci + 1, opt)
    sizes = sorted((len(x) for x in cl.values()), reverse=True)
    if sizes[0] == 1:
        return sorted(G, key=lambda t: -v[t]), []
    big = [k for k, x in cl.items() if len(x) == sizes[0]]
    if len(big) > 1:
        keep = [t for k in big for t in cl[k]]
        rest = sorted((k for k in cl if k not in big), reverse=True)
        if opt.get('tie_after') == 'restart' and rest:
            m, sk = _R(s, sorted(keep), 0, opt)
        else:
            if not rest:
                return _R(s, G, ci + 1, opt)
            m, sk = _R(s, sorted(keep), ci + 1, opt)
        tail = []
        for val in rest:
            a, b = _sub(s, cl[val], opt); tail += a + b
        return m + tail + sk, []
    key = big[0]
    m, sk = _R(s, sorted(cl[key]), 0, opt)
    higher, lower = [], []
    for val in sorted((k for k in cl if k != key), reverse=True):
        a, b = _sub(s, cl[val], opt)
        (higher if val > key else lower).extend(a + b)
    if opt.get('placement') == 'asym':
        return m + higher, lower + sk
    return m + sk + higher + lower, []
