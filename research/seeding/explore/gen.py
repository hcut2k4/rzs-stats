import snapgroups as S
from procs import values, two
import ctop
CR = ctop.CRIT

def rank_full(s, G, opt):
    return ctop.R(s, list(G), 0, opt)

def per_spot(s, G, opt, base=rank_full):
    G = list(G); out = []
    while G:
        if len(G) == 1:
            out += G; break
        top = base(s, G, opt)[0]
        out.append(top); G = [t for t in G if t != top]
    return out

def per_spot_div(s, G, opt, base=rank_full):
    G = list(G); out = []
    while G:
        if len(G) == 1:
            out += G; break
        divs = {}
        for t in G:
            divs.setdefault(s['teams'][t]['div'], []).append(t)
        reps = [base(s, ts, opt)[0] if len(ts) > 1 else ts[0] for ts in divs.values()]
        top = base(s, reps, opt)[0] if len(reps) > 1 else reps[0]
        out.append(top); G = [t for t in G if t != top]
    return out

STRUCT = {'full': rank_full, 'per_spot': per_spot, 'per_spot_div': per_spot_div}
