import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass
from fractions import Fraction
import inspect
import itertools
import json
import multiprocessing as mp
import time

import numpy as np

try:
    from . import observe as observations
    from .corpus import load_corpus
    from .facts import facts, common_record
except ImportError:
    import observe as observations
    from corpus import load_corpus
    from facts import facts, common_record


CRITERIA = ['H2H', 'DIV', 'COM', 'CONF', 'SOV', 'SOS', 'NET_CONF', 'NET_ALL']
DEFAULT = dict(step='separated_bottom', criteria=CRITERIA, h2h_value='wins',
               scope={'H2H': 'original', 'COM': 'current'}, com_min=0,
               after_removal='stay', pair_rule='continue', structure='eliminate',
               division_reduction='none', fallback='alpha')
CHOICES = dict(step=['best_first', 'worst_first', 'worst_tier', 'separated_bottom', 'farthest_mean', 'cluster'],
               h2h_value=['wins', 'pct_half', 'pct_skip', 'net', 'sweep'], com_min=[0, 4],
               after_removal=['restart', 'stay', 'next'], pair_rule=['continue', 'checklist'],
               structure=['eliminate', 'rank', 'per_spot'], division_reduction=['none', 'nfl'],
               fallback=['alpha', 'teamId'])
CONTEXT = dict(DIV2='DIVT', DIV3P='DIVT', WC2='WCQ', WC3P='WCQ')


def program(raw=None):
    raw = json.loads(raw) if isinstance(raw, str) else dict(raw or {})
    if set(raw) - set(DEFAULT):
        raise ValueError(f'Unknown dimensions: {sorted(set(raw) - set(DEFAULT))}')
    result = dict(DEFAULT, **raw)
    result['scope'] = dict(DEFAULT['scope'], **raw.get('scope', {}))
    for key, choices in CHOICES.items():
        if result[key] not in choices:
            raise ValueError(f'Invalid {key}: {result[key]}')
    if (not isinstance(result['criteria'], list) or not result['criteria']
            or any(c not in CRITERIA for c in result['criteria'])):
        raise ValueError('Invalid criteria')
    if (set(result['scope']) != {'H2H', 'COM'}
            or any(v not in ('original', 'current') for v in result['scope'].values())):
        raise ValueError('Invalid scope')
    return result


def complexity(p):
    return sum(p[k] != v for k, v in DEFAULT.items())


def grid(name):
    scopes = [{'H2H': s, 'COM': 'current'} for s in ('original', 'current')]
    if name == 'core':
        dimensions = dict(step=CHOICES['step'], after_removal=CHOICES['after_removal'],
                          pair_rule=CHOICES['pair_rule'], structure=CHOICES['structure'], scope=scopes)
    elif name == 'criteria':
        dimensions = dict(criteria=[['H2H', *order, 'SOV', 'SOS', 'NET_CONF', 'NET_ALL']
                                    for order in itertools.permutations(['DIV', 'COM', 'CONF'])],
                          step=CHOICES['step'], scope=scopes)
    elif name == 'wc_structure':
        dimensions = dict(division_reduction=CHOICES['division_reduction'],
                          structure=CHOICES['structure'], step=CHOICES['step'], scope=scopes)
    else:
        dimensions = json.loads(name)
    if not isinstance(dimensions, dict) or any(not isinstance(v, list) or not v for v in dimensions.values()):
        raise ValueError('Grid must be a JSON object of nonempty lists')
    return [program(dict(zip(dimensions, values))) for values in itertools.product(*dimensions.values())]


@dataclass
class Group:
    id: str
    season: dict
    context: str
    teams: tuple
    qualified: object = None
    orders: tuple = ()
    full_order: object = None
    source: str = 'bracket'

    def __post_init__(self):
        refuse_fresh(self.season)
        self.teams = tuple(sorted(self.teams))
        self.k = len(self.qualified) if self.qualified is not None else len(self.teams)
        self.cache = {}
        self.data = None


def refuse_fresh(value):
    split = value.get('split') if isinstance(value, dict) else getattr(value, 'split', None)
    if split == 'fresh':
        raise ValueError('Refusing locked split fresh')


def field(value, name, default=None):
    return value.get(name, default) if isinstance(value, dict) else getattr(value, name, default)


def load_groups(context='ALL', min_size=2, source='all', seasons=None):
    if seasons is None:
        kwargs = {'include_fresh': False} if 'include_fresh' in inspect.signature(load_corpus).parameters else {}
        seasons = load_corpus(**kwargs)
    result = []
    for season in seasons:
        refuse_fresh(season)
        api = getattr(observations, 'groups', None)
        rows = api(season) if api else observations.observe(season)['decisions']
        if isinstance(rows, dict):
            rows = rows.get('groups', rows.get('decisions', []))
        for row in rows:
            refuse_fresh(row)
            category = field(row, 'context', field(row, 'category'))
            ctx = CONTEXT.get(category, category)
            teams = tuple(field(row, 'tied_group', field(row, 'teams', ())))
            if (context != 'ALL' and ctx != context) or len(teams) < min_size:
                continue
            outcome = field(row, 'outcome', {})
            qualified = field(row, 'qualifiers', field(row, 'qualified', outcome.get('qualified')))
            orders = field(row, 'allowed_orders', field(row, 'orders', outcome.get('orders', ())))
            full = field(row, 'full_order', outcome.get('full_order'))
            provenance = field(row, 'source', outcome.get('label_source', 'bracket'))
            sources = field(row, 'sources')
            provenance = ('bracket' if 'bracket' in sources else 'snapshot') if sources else (
                'snapshot' if provenance in ('snapshot', 'fallback') else 'bracket')
            identity = field(row, 'id', field(row, 'group_id')) or ':'.join(
                (season['id'], str(field(row, 'conference', '')), ctx, ','.join(sorted(teams))))
            g = Group(identity, season, ctx, teams, qualified, tuple(map(tuple, orders or ())),
                      tuple(full) if full else None, provenance)
            if source == 'all' or provenance == source or (source == 'snapshot' and full):
                result.append(g)
    return sorted(result, key=lambda g: g.id)


def ratio(record, i, empty=0):
    w, l, t = (int(record[k][i]) for k in ('wins', 'losses', 'ties'))
    return Fraction(2*w+t, 2*(w+l+t)) if w+l+t else Fraction(empty)


def values(g, criterion, scope, p):
    key = (criterion, tuple(sorted(scope)), p['h2h_value'] if criterion == 'H2H' else p['com_min'] if criterion == 'COM' else None)
    if key in g.cache:
        return g.cache[key]
    if g.data is None:
        g.data = facts(g.season, 'thru_cal_wk18')
    d = g.data
    indices = [d['index'][t] for t in scope]
    if criterion == 'H2H':
        w, l, ties, games = (d[k][np.ix_(indices, indices)] for k in ('h2h_wins', 'h2h_losses', 'h2h_ties', 'h2h_games'))
        mode = p['h2h_value']
        if mode == 'pct_skip' and any(games[i, j] == 0 for i in range(len(scope)) for j in range(len(scope)) if i != j):
            result = None
        else:
            result = {}
            for i, t in enumerate(scope):
                wins, losses, tied, n = (int(a[i].sum()) for a in (w, l, ties, games))
                if mode in ('pct_half', 'pct_skip'):
                    v = Fraction(2*wins+tied, 2*n) if n else Fraction(1, 2)
                elif mode == 'net':
                    v = wins-losses
                elif mode == 'sweep':
                    others = [j for j in range(len(scope)) if j != i]
                    v = 1 if others and all(w[i, j] > 0 and l[i, j] == 0 for j in others) else -1 if others and all(l[i, j] > 0 and w[i, j] == 0 for j in others) else 0
                else:
                    v = Fraction(2*wins+tied, 2)
                result[t] = v
    elif criterion == 'COM':
        record = common_record(d, scope, nfl=p['com_min'] == 4)
        result = {t: ratio(record, i) for i, t in enumerate(scope)} if record['eligible'] else None
    elif criterion in ('NET_CONF', 'NET_ALL'):
        array = d['conference_net_points' if criterion == 'NET_CONF' else 'net_points']
        result = {t: int(array[i]) for t, i in zip(scope, indices)}
    else:
        record = d[dict(DIV='division', CONF='conference', SOV='sov', SOS='sos')[criterion]]
        result = {t: ratio(record, i) for t, i in zip(scope, indices)}
    g.cache[key] = result
    return result


def separate(v, step):
    low, high = min(v.values()), max(v.values())
    if low == high:
        return 'silent', []
    bottom = [t for t in v if v[t] == low]
    top = [t for t in v if v[t] == high]
    if step == 'best_first':
        return ('pick', top) if len(top) == 1 else ('drop', [t for t in v if v[t] < high])
    if step == 'worst_first':
        return ('drop', bottom) if len(bottom) == 1 else ('silent', [])
    if step == 'worst_tier':
        return 'drop', bottom
    if step == 'separated_bottom':
        return ('drop', bottom) if len(bottom) == 1 else ('drop', top) if len(top) == 1 else ('silent', [])
    if step == 'farthest_mean':
        total = sum(v.values())
        distances = {t: abs(x*len(v)-total) for t, x in v.items()}
        far = [t for t in v if distances[t] == max(distances.values())]
        minimum = min(v[t] for t in far)
        candidates = [t for t in far if v[t] == minimum]
        return ('drop', candidates) if len(candidates) == 1 else ('silent', [])
    clusters = defaultdict(list)
    for t, x in v.items():
        clusters[x].append(t)
    largest = max(map(len, clusters.values()))
    leaders = [c for c in clusters.values() if len(c) == largest]
    if largest == 1:
        return 'drop', bottom
    if len(leaders) == 1:
        return 'drop', [t for t in v if t not in leaders[0]]
    return 'silent', []


def predict(g, raw=None, trace=None):
    refuse_fresh(g.season)
    p = program(raw)
    def log(**event):
        if trace is not None:
            trace.append(event)

    def fallback(pool):
        if p['fallback'] == 'alpha':
            return sorted(pool)
        if any(g.season['teams'][t].get('teamId') is None for t in pool):
            raise ValueError('teamId fallback requires teamId')
        return sorted(pool, key=lambda t: (int(g.season['teams'][t]['teamId']), t))

    def run(pool, k, ranking=False):
        original = tuple(sorted(pool))
        current, picked, dropped = list(original), [], []
        pos = 0
        while (len(current) > (1 if ranking else k-len(picked))
               and (ranking or len(picked) < k) and pos < len(p['criteria'])):
            if len(current) == 2 and p['pair_rule'] == 'checklist':
                pair = list(current)
                for criterion in CRITERIA:
                    pair_p = dict(p, h2h_value='pct_half')
                    v = values(g, criterion, tuple(pair), pair_p)
                    log(group=pair[:], criterion=criterion, values=string_values(v), action='pair_checklist')
                    if v and len(set(v.values())) > 1:
                        pair.sort(key=lambda t: v[t], reverse=True)
                        break
                else:
                    pair = fallback(pair)
                return picked + pair + list(reversed(dropped))
            criterion = p['criteria'][pos]
            scope = original if p['scope'].get(criterion) == 'original' else tuple(current)
            v = values(g, criterion, scope, p)
            v = {t: v[t] for t in current} if v is not None else None
            action, removed = separate(v, p['step']) if v else ('silent', [])
            if action == 'drop' and len(current)-len(removed) < (1 if ranking else k-len(picked)):
                action, removed = 'silent', []
            log(group=current[:], criterion=criterion, scope=list(scope), values=string_values(v),
                action=action, removed=removed)
            if action == 'silent':
                pos += 1
                continue
            ordered = fallback(removed)
            (picked if action == 'pick' else dropped).extend(ordered)
            current = [t for t in current if t not in removed]
            if p['after_removal'] == 'restart':
                pos = 0
            elif p['after_removal'] == 'next':
                pos += 1
        remainder = fallback(current)
        log(group=current[:], action='remainder', order=remainder)
        return picked + remainder + list(reversed(dropped))

    if p['structure'] == 'per_spot':
        pool, order = list(g.teams), []
        while pool:
            compare = pool
            if p['division_reduction'] == 'nfl' and g.context in ('WCQ', 'WSEED', 'NPORD'):
                divisions = defaultdict(list)
                for t in pool:
                    meta = g.season['teams'][t]
                    divisions[meta['conf'], meta['div']].append(t)
                compare = [run(members, 1, True)[0] for members in divisions.values()]
                log(action='division_reduction', pool=pool[:], representatives=compare)
            winner = run(compare, 1, True)[0]
            order.append(winner)
            pool.remove(winner)
    else:
        order = run(g.teams, g.k, p['structure'] == 'rank' or g.qualified is None)
    return dict(qualified=tuple(order[:g.k]), order=tuple(order))


def string_values(v):
    return {t: str(x) for t, x in v.items()} if v is not None else None


def score(g, prediction):
    primary = (set(prediction['qualified']) == set(g.qualified) if g.qualified is not None
               else prediction['order'] in g.orders if g.orders else
               prediction['order'] == g.full_order if g.source == 'snapshot' and g.full_order else None)
    snapshot = prediction['order'] == g.full_order if g.full_order else None
    return primary, snapshot


_GROUPS = []


def score_program(p):
    misses, snapshot_misses, sizes, sources = [], [], Counter(), Counter()
    for g in _GROUPS:
        primary, snapshot = score(g, predict(g, p))
        if primary is False:
            misses.append(g.id)
            sizes[str(len(g.teams)) if len(g.teams) < 5 else '5+'] += 1
            sources[g.source] += 1
        if snapshot is False:
            snapshot_misses.append(g.id)
    return dict(program=p, misses=misses, by_size=dict(sizes), by_source=dict(sources),
                snapshot_misses=snapshot_misses, complexity=complexity(p))


def search(groups, programs, workers=16):
    global _GROUPS
    _GROUPS = groups
    statistics = {}
    for g in groups:
        refuse_fresh(g.season)
        identity = id(g.season)
        if identity not in statistics:
            statistics[identity] = g.data if g.data is not None else facts(g.season, 'thru_cal_wk18')
        g.data = statistics[identity]
    if workers == 1:
        rows = list(map(score_program, programs))
    else:
        with mp.get_context('fork').Pool(min(workers, len(programs))) as pool:
            rows = pool.map(score_program, programs, chunksize=1)
    rows.sort(key=lambda r: (len(r['misses']), r['complexity'], json.dumps(r['program'], sort_keys=True)))
    return rows


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    searching = sub.add_parser('search')
    searching.add_argument('--grid', required=True)
    searching.add_argument('--top', type=int, default=20)
    searching.add_argument('--min-size', type=int, default=2)
    searching.add_argument('--source', choices=['bracket', 'snapshot', 'all'], default='all')
    explaining = sub.add_parser('explain')
    explaining.add_argument('program')
    explaining.add_argument('group_id')
    comparing = sub.add_parser('diff')
    comparing.add_argument('program_a')
    comparing.add_argument('program_b')
    for command in (searching, comparing):
        command.add_argument('--context', choices=['WCQ', 'DIVT', 'DSEED', 'WSEED', 'NPORD', 'ALL'], default='ALL')
    args = parser.parse_args()
    started = time.monotonic()
    groups = load_groups(getattr(args, 'context', 'ALL'), getattr(args, 'min_size', 2), getattr(args, 'source', 'all'))
    if args.command == 'search':
        programs = grid(args.grid)
        rows = search(groups, programs)
        print(json.dumps(dict(groups=len(groups), programs=len(programs),
                              sources=dict(Counter(g.source for g in groups)),
                              snapshot_labels=sum(bool(g.full_order) for g in groups))))
        for row in rows[:args.top]:
            print(json.dumps(row, sort_keys=True))
        universal = sorted(set.intersection(*(set(r['misses']) for r in rows))) if rows else []
        print(json.dumps(dict(zero_miss_version_space=sum(not r['misses'] for r in rows),
                              snapshot_zero_miss_version_space=sum(not r['snapshot_misses'] for r in rows),
                              missed_by_every_program=universal, runtime_seconds=round(time.monotonic()-started, 3))))
    elif args.command == 'explain':
        matches = [g for g in groups if g.id == args.group_id]
        if len(matches) != 1:
            parser.error(f'Expected one group for {args.group_id}, found {len(matches)}')
        trace = []
        prediction = predict(matches[0], args.program, trace)
        print(json.dumps(dict(group=matches[0].id, prediction=prediction, score=score(matches[0], prediction), trace=trace), indent=2))
    else:
        for g in groups:
            a, b = predict(g, args.program_a), predict(g, args.program_b)
            if a != b:
                print(json.dumps(dict(group=g.id, a=a, b=b, observed=dict(qualified=g.qualified, orders=g.orders, full_order=g.full_order))))


if __name__ == '__main__':
    main()
