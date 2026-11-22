import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass
import itertools

try:
    from .corpus import load_corpus
    from .facts import facts
except ImportError:
    from corpus import load_corpus
    from facts import facts

CATEGORIES = ('DIV2', 'DIV3P', 'WC2', 'WC3P', 'DSEED', 'WSEED')


@dataclass
class Decision:
    season_id: str
    league: str
    conference: str
    category: str
    tied_group: tuple
    outcome: dict
    strict: bool
    pool_isolated: bool
    group_size: int
    split: str


def bracket_valid(order, games):
    seed = {t: i+1 for i, t in enumerate(order)}
    rounds = {w: [g for g in games if g['weekIndex'] == w] for w in (18, 19, 20)}
    for week, rows in rounds.items():
        participants = [g[s] for g in rows for s in ('home', 'away')]
        if len(set(participants)) != len(participants):
            return False
        for g in rows:
            h, a = g['home'], g['away']
            if h not in seed or a not in seed or seed[h] >= seed[a]:
                return False
            if week == 18 and (seed[h] not in (2, 3, 4) or seed[h] + seed[a] != 9):
                return False
            if week == 19 and len(rows) == 2:
                lowest = max(participants, key=seed.get)
                if seed[h] == 1 and a != lowest:
                    return False
                if order[0] not in participants:
                    return False
    for previous, following in ((18, 19), (19, 20)):
        survivors = {g[s] for g in rounds[following] for s in ('home', 'away')}
        for g in rounds[previous]:
            if g['homeScore'] == g['awayScore'] or g.get('status') == 4:
                return False
            winner = g['home'] if g['homeScore'] > g['awayScore'] else g['away']
            loser = g['away'] if winner == g['home'] else g['home']
            if loser in survivors or (len(rounds[following]) == (2 if following == 19 else 1) and winner not in survivors):
                return False
    return True


def candidates(season, conference):
    members = sorted(t for t, meta in season['teams'].items() if meta['conf'] == conference)
    games = [g for g in season['playoff_games'] if g['weekIndex'] in (18, 19, 20)
             and g['home'] in members and g['away'] in members]
    wildcard = [g for g in games if g['weekIndex'] == 18]
    if not games:
        return None
    if len(wildcard) > 3:
        return []
    inwc = {g[s] for g in wildcard for s in ('home', 'away')}
    if len(inwc) != 2 * len(wildcard) or any(g['homeScore'] == g['awayScore'] or g.get('status') == 4 for g in wildcard):
        return []
    byes = {g[s] for g in games if g['weekIndex'] == 19 for s in ('home', 'away')} - inwc
    known_bye = next(iter(byes)) if len(wildcard) == 3 and len(byes) == 1 else None
    result = []
    for slots in itertools.permutations((2, 3, 4), len(wildcard)):
        base = [None] * 7
        for g, slot in zip(wildcard, slots):
            base[slot-1], base[8-slot] = g['home'], g['away']
        if known_bye:
            base[0] = known_bye
        empty = [i for i, t in enumerate(base) if t is None]
        remaining = [t for t in members if t not in base]
        for fill in itertools.permutations(remaining, len(empty)):
            order = base.copy()
            for i, t in zip(empty, fill):
                order[i] = t
            if len(games) == len(wildcard) or bracket_valid(order, games):
                result.append(tuple(order))
    return result


def observe(season):
    data = facts(season)
    pct = {t: data['final']['pct'][i] for t, i in data['index'].items()}
    decisions, quarantine, conferences = [], [], {}
    for conference in sorted({v['conf'] for v in season['teams'].values()}):
        members = {t for t, v in season['teams'].items() if v['conf'] == conference}
        raw_candidates = candidates(season, conference)
        fallback = season.get('madden_seeds', {}).get(conference)
        if fallback and isinstance(fallback[0], list):
            fallback = fallback[0] if len(fallback) == 1 else None
        reasons = []
        effective = raw_candidates
        label_source = 'bracket'
        if raw_candidates == []:
            reasons.append('no seed assignment satisfies bracket')
        if fallback:
            label = tuple(fallback)
            if len(set(label)) != 7 or not set(label) <= members:
                reasons.append('invalid fallback playoff field')
            elif raw_candidates is not None and label not in raw_candidates:
                reasons.append('fallback seeds contradict bracket')
            else:
                effective = [label]
                label_source = 'fallback' if raw_candidates is None or len(raw_candidates) > 1 else 'bracket'
        wc_games = [g for g in season['playoff_games'] if g['weekIndex'] == 18 and g['home'] in members]
        wc_teams = {g[s] for g in wc_games for s in ('home', 'away')}
        divisional = {g[s] for g in season['playoff_games'] if g['weekIndex'] == 19 and g['home'] in members for s in ('home', 'away')}
        bye_set = divisional - wc_teams
        conferences[conference] = dict(candidates=raw_candidates, label_candidates=effective,
                                       label_source=label_source, bye=next(iter(bye_set)) if len(wc_games) == 3 and len(bye_set) == 1 else None,
                                       playoff_teams=tuple(sorted(wc_teams)),
                                       division_winners=tuple(sorted({g['home'] for g in wc_games} | (bye_set if len(bye_set) == 1 and len(wc_games) == 3 else set()))),
                                       wild_cards=tuple(sorted(g['away'] for g in wc_games)))
        if not effective:
            for reason in reasons:
                quarantine.append(dict(season_id=season['id'], conference=conference, reason=reason))
            continue
        fields = {frozenset(order) for order in effective}
        winners = {frozenset(order[:4]) for order in effective}
        if len(fields) != 1 or len(winners) != 1:
            continue
        field, dw = set(next(iter(fields))), set(next(iter(winners)))
        wild = field - dw
        divisions = defaultdict(set)
        for t in members:
            divisions[season['teams'][t]['div']].add(t)
        for division, pool in divisions.items():
            chosen = pool & dw
            if len(chosen) != 1:
                reasons.append(f'{division}: division winner not unique')
            elif pct[next(iter(chosen))] < max(pct[t] for t in pool):
                reasons.append(f'{division}: division winner has worse final record')
        for missed in members - field:
            for qualified in wild:
                if pct[missed] > pct[qualified]:
                    reasons.append(f'{missed}: better final record than wild-card qualifier {qualified}')
        # Record order audits candidates without supplying bracket evidence.
        if not any(all(pct[a] >= pct[b] for pool in (dw, wild)
                       for a, b in itertools.combinations([t for t in order if t in pool], 2))
                   for order in effective):
            reasons.append('seed order contradicts final records')
        if reasons:
            quarantine.extend(dict(season_id=season['id'], conference=conference, reason=r) for r in sorted(set(reasons)))
            continue

        def emit(category, group, qualified=None):
            group = tuple(sorted(group))
            seed_options = {t: tuple(sorted({order.index(t)+1 for order in effective if t in order})) for t in group}
            orders = sorted({tuple(t for t in order if t in group) for order in effective})
            bracket_orders = {tuple(t for t in order if t in group) for order in raw_candidates or []}
            relative_fixed = len(bracket_orders) == 1 and len(next(iter(bracket_orders))) == len(group)
            if qualified is not None:
                bracket_outcomes = {frozenset(group) & set(order[:4] if category.startswith('DIV') else order[4:])
                                    for order in raw_candidates or []}
                resolved = len(bracket_outcomes) == 1 and next(iter(bracket_outcomes)) == set(qualified)
            else:
                resolved = relative_fixed
            isolated = len(group) == 2 and resolved
            strict = isolated and sum(pct[t] == pct[group[0]] for t in members) == 2
            outcome = dict(qualified=tuple(sorted(qualified)) if qualified is not None else None,
                           seed_options=seed_options, fixed_seeds={t: s[0] for t, s in seed_options.items() if len(s) == 1},
                           orders=orders, label_source=label_source)
            decisions.append(Decision(season['id'], season['league'], conference, category, group,
                                      outcome, strict, isolated and not strict, len(group), season['split']))

        for pool in divisions.values():
            top = max(pct[t] for t in pool)
            tied = {t for t in pool if pct[t] == top}
            if len(tied) >= 2:
                emit('DIV2' if len(tied) == 2 else 'DIV3P', tied, tied & dw)
        non_dw = members - dw
        if wild:
            cut = min(pct[t] for t in wild)
            tied = {t for t in non_dw if pct[t] == cut}
            if len(tied) >= 2 and tied & wild and tied - wild:
                emit('WC2' if len(tied) == 2 else 'WC3P', tied, tied & wild)
        for category, pool in [('DSEED', dw), ('WSEED', wild)]:
            groups = defaultdict(set)
            for t in pool:
                groups[pct[t]].add(t)
            for group in groups.values():
                if len(group) >= 2:
                    emit(category, group)
    return dict(decisions=decisions, quarantine=quarantine, conferences=conferences)



@dataclass
class TieGroup:
    id: str
    season_id: str
    league: str
    conference: str
    context: str
    teams: tuple
    size: int
    n_divisions: int
    k: int | None
    qualifiers: frozenset | None
    allowed_orders: tuple | None
    full_order: tuple | None
    sources: frozenset
    verified: bool
    split: str


def groups(season):
    bracket = dict(season)
    bracket.pop('madden_seeds', None)
    observations = [('bracket', observe(bracket))]
    snapshots = season.get('snapshot_seeds', {})
    if snapshots:
        labeled = dict(season, madden_seeds={c: order[:7] for c, order in snapshots.items()})
        observations.append(('snapshot', observe(labeled)))
    result = {}

    def add(conference, context, members, source, qualified=None, orders=None):
        members = tuple(sorted(members))
        identity = '|'.join((season['id'], conference, context, ','.join(members)))
        full = tuple(t for t in snapshots.get(conference, ()) if t in members)
        full = full if len(full) == len(members) else None
        if identity not in result:
            result[identity] = TieGroup(identity, season['id'], season['league'], conference, context,
                                       members, len(members), len({season['teams'][t]['div'] for t in members}),
                                       len(qualified) if qualified is not None else None,
                                       frozenset(qualified) if qualified is not None else None,
                                       orders, full, frozenset(), season.get('verified', False), season['split'])
        group = result[identity]
        group.sources |= {source}
        if source == 'bracket':
            group.allowed_orders = orders
        if full:
            group.sources |= {'snapshot'}

    for source, observed in observations:
        for decision in observed['decisions']:
            context = ('DIVT' if decision.category.startswith('DIV') else
                       'WCQ' if decision.category.startswith('WC') else decision.category)
            options = observed['conferences'][decision.conference]['candidates']
            orders = tuple(sorted({tuple(t for t in order if t in decision.tied_group) for order in options})) if options else None
            add(decision.conference, context, decision.tied_group, source,
                decision.outcome['qualified'], orders if source == 'bracket' else None)
    if snapshots:
        data = facts(season)
        for conference, order in snapshots.items():
            tied = defaultdict(list)
            for team in order[7:]:
                i = data['index'][team]
                tied[tuple(int(data['final'][key][i]) for key in ('wins', 'losses', 'ties'))].append(team)
            for members in tied.values():
                if len(members) >= 2:
                    add(conference, 'NPORD', members, 'snapshot')
    return sorted(result.values(), key=lambda g: g.id)


def groups_summary():
    seasons = load_corpus(include_fresh=True)
    for split in ('discovery', 'fresh'):
        selected = [s for s in seasons if s['split'] == split]
        counts = Counter()
        for season in selected:
            for group in groups(season):
                size = str(group.size) if group.size < 5 else '5+'
                source = 'both' if len(group.sources) == 2 else next(iter(group.sources)) + '-only'
                counts[group.context, size, source] += 1
        print(f'{split}: seasons={len(selected)}')
        if split == 'fresh':
            import json
            try:
                from .corpus import HERE
            except ImportError:
                from corpus import HERE
            for path in (HERE / 'data/fresh/_index.json', HERE / 'data/fresh/snapshots/_index.json'):
                entries = json.loads(path.read_text()) if path.exists() else {}
                print(f'{path.parent.name}: {dict(Counter(e["status"] for e in entries.values()))}')
            totals = Counter()
            for (context, size, source), count in counts.items():
                totals[context, size] += count
            for (context, size), count in sorted(totals.items()):
                print(f'{context:6} {size:2} {count}')
        else:
            for (context, size, source), count in sorted(counts.items()):
                print(f'{context:6} {size:2} {source:13} {count}')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--summary', action='store_true')
    parser.add_argument('--groups-summary', action='store_true')
    args = parser.parse_args()
    if args.groups_summary:
        groups_summary()
        return
    seasons = load_corpus()
    counts, violations = Counter(), 0
    for season in seasons:
        observed = observe(season)
        violations += len(observed['quarantine'])
        for d in observed['decisions']:
            counts[d.category, season.get('old_split', d.split), 'all'] += 1
            counts[d.category, season.get('old_split', d.split), 'strict'] += d.strict
            counts[d.category, season.get('old_split', d.split), 'pool'] += d.pool_isolated
    print(f'Seasons: {len(seasons)}; sources: {dict(Counter(s["source"] for s in seasons))}')
    print('Category  train(all/strict/pool)  dev(all/strict/pool)  holdout(all/strict/pool)  total')
    for category in CATEGORIES:
        cells = ['/'.join(str(counts[category, split, kind]) for kind in ('all', 'strict', 'pool')) for split in ('train', 'dev', 'holdout')]
        total = sum(counts[category, split, 'all'] for split in ('train', 'dev', 'holdout'))
        print(f'{category:8}  {cells[0]:22} {cells[1]:20} {cells[2]:24} {total}')
    print(f'Sanity violations: {violations}')


if __name__ == '__main__':
    main()
