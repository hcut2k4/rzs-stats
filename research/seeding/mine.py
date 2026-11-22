import argparse
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from copy import deepcopy
from itertools import groupby
from math import comb, sqrt
import os

import json
from pathlib import Path

try:
    from .corpus import load_corpus
    from .facts import CUTOFFS, facts
    from .features import feature_values, group_features, group_step, GROUP_ACTIONS
    from .observe import observe
except ImportError:
    from corpus import load_corpus
    from facts import CUTOFFS, facts
    from features import feature_values, group_features, group_step, GROUP_ACTIONS
    from observe import observe


def wilson(credit, n):
    if not n:
        return 'n=0 accuracy=NA [NA]'
    p, z = credit / n, 1.959963984540054
    center = (p + z*z/(2*n)) / (1 + z*z/n)
    half = z * sqrt(p*(1-p)/n + z*z/(4*n*n)) / (1 + z*z/n)
    return f'n={n} accuracy={p:.3f} [{center-half:.3f},{center+half:.3f}]'



def set_credit(values, qualified, high=True):
    k = len(qualified)
    ordered = sorted(values, reverse=high)
    boundary = ordered[k-1]
    better = {i for i, value in enumerate(values) if (value > boundary if high else value < boundary)}
    equal = {i for i, value in enumerate(values) if value == boundary}
    if not better <= qualified or not qualified <= better | equal:
        return 0.
    return 1 / comb(len(equal), k-len(better))


def season_rows(task):
    season, cutoff, *group_mode = task
    observed = observe(season)
    data = facts(season, cutoff)
    rows = []
    for decision in observed['decisions']:
        if group_mode and decision.category not in ('WC3P', 'DIV3P'):
            continue
        group = decision.tied_group
        qualified = decision.outcome['qualified']
        ambiguous = False
        if qualified is None:
            orders = {tuple(t for t in order if t in group)
                      for order in observed['conferences'][decision.conference]['candidates'] or []}
            ambiguous = len(orders) != 1 or len(next(iter(orders), ())) != len(group)
            qualified = () if ambiguous else (next(iter(orders))[0],)
        rows.append(dict(category=decision.category, size=decision.group_size, strict=decision.strict,
                         pool=decision.pool_isolated, ambiguous=ambiguous,
                         qualified={i for i, t in enumerate(group) if t in qualified},
                         divisions=len({season['teams'][t]['div'] for t in group}),
                         features=feature_values(data, group)))
        if group_mode:
            rows[-1].update(id=f'{decision.season_id}/{decision.conference}/{decision.category}/{",".join(group)}',
                            group=group, data=data)
    return rows


def load_rows(split, cutoff='thru_cal_wk18', workers=None, groups=False):
    if split not in ('discovery', 'train', 'dev', 'holdout'):
        raise ValueError('Fresh/all are forbidden for discovery')
    seasons = [s for s in load_corpus() if s['split'] == split or s.get('old_split') == split]
    with ProcessPoolExecutor(max_workers=workers or min(8, os.cpu_count() or 1)) as pool:
        tasks = ((s, cutoff, True) if groups else (s, cutoff) for s in seasons)
        return [row for rows in pool.map(season_rows, tasks, chunksize=4) for row in rows]



def group_consistent(retained, qualified):
    return qualified <= set(retained) and len(retained) >= len(qualified)


def group_choices(states, min_support, restart):
    scores = defaultdict(list)
    for row, current in states:
        for name, values in group_features(row, current, restart).items():
            for action in GROUP_ACTIONS:
                retained = group_step(current, values, action)
                if retained != current:
                    scores[name, action].append(group_consistent(retained, row['qualified']))
    choices = [dict(feature=name, action=action, support=len(v), correct=sum(v))
               for (name, action), v in scores.items() if len(v) >= min_support]
    return sorted(choices, key=lambda s: (-s['correct']/s['support'], -s['support'],
                                         s['feature'], GROUP_ACTIONS.index(s['action'])))


def learn_group_list(rows, max_steps=6, min_support=8, restart=True):
    states = [(r, tuple(range(r['size']))) for r in rows]
    learned = []
    first = group_choices(states, min_support, restart)
    for _ in range(max_steps):
        unresolved = [(r, c) for r, c in states if len(c) > len(r['qualified'])]
        choices = group_choices(unresolved, min_support, restart)
        if not choices:
            break
        step = choices[0]
        states = [(r, group_step(c, group_features(r, c, restart).get(step['feature']), step['action']))
                  if len(c) > len(r['qualified']) else (r, c) for r, c in states]
        step['remaining'] = sum(len(c) > len(r['qualified']) for r, c in states)
        learned.append(step)
    credit = sum(1 / comb(len(c), len(r['qualified'])) if group_consistent(c, r['qualified']) else 0
                 for r, c in states)
    remaining = [r for r, c in states if len(c) > len(r['qualified'])]
    return learned, remaining, credit, first


def print_group_list(rows, category, subset=None, max_steps=6, min_support=8, restart=True):
    for label in (subset,) if subset else ('all', 'diff-div', 'same-div'):
        selected = [r for r in rows if r['category'] == category and r['size'] >= 3 and
                    not r['ambiguous'] and (label == 'all' or
                    (r['divisions'] == r['size'] if label == 'diff-div' else r['divisions'] < r['size']))]
        learned, remaining, credit, first = learn_group_list(selected, max_steps, min_support, restart)
        print(f'{category} subset={label} groups={len(selected)} restart={restart} min-support={min_support}')
        print('Top 10 first steps (accuracy = consistency; Wilson 95%):')
        for step in first[:10]:
            print(f'  {step["feature"]} {step["action"]}: support={step["support"]} {wilson(step["correct"], step["support"])}')
        for i, step in enumerate(learned, 1):
            print(f'{i}. {step["feature"]} {step["action"]}: support={step["support"]} {wilson(step["correct"], step["support"])} unresolved={step["remaining"]}')
        print(f'Overall exactly-correct (chance credit for remaining ties): {wilson(credit, len(selected))}')
        print(f'Unexplained groups={len(remaining)}/{len(selected)}; ids: {", ".join(r["id"] for r in remaining) or "none"}')


def export_procedure(rows, category, split='train', cutoff='thru_cal_wk18', max_steps=6, min_support=8, name=None):
    name = name or f'{category.lower()}_{split}'
    if not name or Path(name).name != name or name in ('.', '..'):
        raise ValueError('Procedure name must be a filename stem')
    context = 'wc_qualify' if category == 'WC3P' else 'division_title'
    shapes = {}
    for shape in ('diff_div', 'same_div'):
        selected = [r for r in rows if r['category'] == category and r['size'] >= 3 and not r['ambiguous']
                    and (r['divisions'] == r['size']) == (shape == 'diff_div')]
        learned, _, _, _ = learn_group_list(selected, max_steps, min_support)
        if learned:
            shapes[shape] = [{k: step[k] for k in ('feature', 'action')} for step in learned]
    command = (f'python3 -m research.seeding.mine export-procedure --category {category} --split {split}'
               f' --cutoff {cutoff} --max-steps {max_steps} --min-support {min_support} --name {name}')
    payload = {context: shapes, 'metadata': dict(command=command, split=split, cutoff=cutoff,
               provenance='Only seasons in the named split; existing group-list bracket/fallback labels; no other split used for fitting.',
               miner_semantics='Features recomputed after each learned stage; stages applied once; overshoots scored as failures.',
               engine_semantics='Restart list after each change; skip overshoots; normal engine fallback.')}
    target = Path(__file__).resolve().parent / 'data/procedures' / f'{name}.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2) + '\n')
    return target


def feature_scores(rows):
    scores = defaultdict(list)
    for row in rows:
        for name, values in row['features'].items():
            for high in (True, False):
                credit = set_credit(values, row['qualified'], high)
                scores[name, high, 'top-k'].append(credit)
                if len(row['qualified']) == row['size']-1:
                    scores[name, high, 'drop-worst'].append(credit)
    return sorted(((sum(v)/len(v), name, high, mode, sum(v), len(v))
                   for (name, high, mode), v in scores.items()), key=lambda x: (-x[0], x[1], not x[2], x[3]))


def learn_list(rows, min_support=8):
    remaining = list(rows)
    learned = []
    while remaining:
        choices = []
        names = sorted({name for row in remaining for name in row['features']})
        for name in names:
            for high in (True, False):
                separated = [r for r in remaining if name in r['features'] and r['features'][name][0] != r['features'][name][1]]
                if len(separated) < min_support:
                    continue
                correct = sum(set_credit(r['features'][name], r['qualified'], high) for r in separated)
                choices.append((correct/len(separated), len(separated), name, high, correct))
        if not choices:
            break
        agreement, support, name, high, correct = max(choices, key=lambda c: (c[0], c[1], c[3], c[2]))
        learned.append(dict(feature=name, high=high, support=support, correct=correct, remaining=len(remaining)))
        # Missing/undefined criteria abstain, so later criteria may still explain the pair.
        remaining = [r for r in remaining if name not in r['features'] or r['features'][name][0] == r['features'][name][1]]
    return learned, remaining


def strict_pairs(rows, category):
    candidates = [r for r in rows if r['category'] == category and r['size'] == 2]
    skipped = sum(r['ambiguous'] for r in candidates)
    selected = [r for r in candidates if r['strict'] and not r['pool'] and not r['ambiguous']]
    return selected, skipped, len(candidates)-len(selected)-skipped


def print_features(rows, category, group_size=None):
    for label in ('2', '3', '4', '5+'):
        selected = [r for r in rows if r['category'] == category and
                    (str(r['size']) if r['size'] < 5 else '5+') == label and
                    (group_size is None or r['size'] == group_size)]
        print(f'{category} size={label} decisions={len(selected)} strict={sum(r["strict"] for r in selected)} pool={sum(r["pool"] for r in selected)}')
        for _, name, high, mode, credit, n in feature_scores(selected):
            print(f'  {name:23} {"high" if high else "low":4} {mode:10} {wilson(credit, n)}')


def print_direction(rows):
    print('category size divisions event                         count/eligible accuracy [Wilson95%]')
    buckets = defaultdict(list)
    for row in rows:
        if row['category'] in ('WC3P', 'DIV3P') and row['size'] >= 3:
            buckets[row['category'], row['size'], row['divisions']].append(row)
    for (category, size, divisions), group in sorted(buckets.items()):
        events = {label: [] for label in ('keep BEST H2H (top-k)', 'keep WORST H2H (top-k)',
                                          'beat-none team eliminated', 'zero-games team kept')}
        for row in group:
            values, kept = row['features']['group_h2h_pct'], row['qualified']
            for high, label in ((True, 'keep BEST H2H (top-k)'), (False, 'keep WORST H2H (top-k)')):
                events[label].append(set_credit(values, kept, high))
            for name, label in (('beat_none', 'beat-none team eliminated'), ('group_h2h_games', 'zero-games team kept')):
                indices = [i for i, v in enumerate(row['features'][name]) if (v == 1 if name == 'beat_none' else v == 0)]
                if indices:
                    events[label].append(sum((i not in kept if name == 'beat_none' else i in kept) for i in indices)/len(indices))
        for label, credits in events.items():
            print(f'{category:8} {size:4} {divisions:9} {label:29} {sum(credits):6.2f}/{len(credits):<4} {wilson(sum(credits), len(credits))}')
    print('divisions < size: same-division members present; divisions = size: all different.')
    print('Team events average within each eligible group; n counts independent groups. Fractional credits use descriptive Wilson intervals.')


def planted_season(season):
    synthetic = deepcopy(season)
    synthetic.pop('madden_seeds', None)
    data = facts(synthetic)
    meta = synthetic['teams']

    def rank(group):
        values = feature_values(data, group)
        names = ('group_h2h_pct', 'division_pct', 'common_pct', 'conference_pct')
        return sorted(group, key=lambda t: tuple(-values[n][group.index(t)] for n in names))

    def order(pool, worst_multi=False):
        result = []
        by_record = sorted(pool, key=lambda t: -data['final']['pct'][data['index'][t]])
        for _, tied in groupby(by_record, key=lambda t: data['final']['pct'][data['index'][t]]):
            group = tuple(tied)
            if worst_multi and len(group) >= 3:
                values = feature_values(data, group)['group_h2h_pct']
                result.extend(sorted(group, key=lambda t: values[group.index(t)]))
            else:
                result.extend(rank(group))
        return result

    synthetic['playoff_games'] = []
    for conf in sorted({m['conf'] for m in meta.values()}):
        teams = sorted(t for t in meta if meta[t]['conf'] == conf)
        winners = [order([t for t in teams if meta[t]['div'] == div], True)[0] for div in sorted({meta[t]['div'] for t in teams})]
        seeds = order(winners) + order([t for t in teams if t not in winners], True)[:3]
        for week, h, a in ((18, 1, 6), (18, 2, 5), (18, 3, 4), (19, 0, 3), (19, 1, 2), (20, 0, 1)):
            synthetic['playoff_games'].append(dict(weekIndex=week, home=seeds[h], away=seeds[a], homeScore=24, awayScore=10, status=2))
    return synthetic


def selftest(split='train'):
    if split not in ('discovery', 'train', 'dev', 'holdout'):
        raise ValueError('Fresh/all are forbidden for discovery')
    names = ('group_h2h_pct', 'division_pct', 'common_pct', 'conference_pct')
    witnesses = []
    for step in range(4):
        for bits in range(8):
            values = {name: (0., 0.) for name in names}
            values[names[step]] = (1., 0.)
            for later in range(step+1, 4):
                values[names[later]] = (float((bits >> (later-step-1)) & 1), .5)
            witnesses.append(dict(features=values, qualified={0}, size=2))
    learned, remaining = learn_list(witnesses)
    assert [(s['feature'], s['high']) for s in learned] == [(n, True) for n in names]
    assert not remaining
    seasons = [s for s in load_corpus() if s['split'] == split or s.get('old_split') == split][:240]
    with ProcessPoolExecutor(max_workers=min(8, os.cpu_count() or 1)) as pool:
        synthetic = list(pool.map(planted_season, seasons, chunksize=4))
        rows = [r for batch in pool.map(season_rows, ((s, 'thru_cal_wk18') for s in synthetic), chunksize=4) for r in batch]
    pairs = [r for category in ('DIV2', 'WC2', 'DSEED', 'WSEED')
             for r in strict_pairs(rows, category)[0]]
    learned, _ = learn_list(pairs)
    recovered = [('group_h2h_pct' if s['feature'] == 'opponent_h2h_pct' else s['feature'], s['high'])
                 for s in learned[:4]]
    assert recovered == [(name, True) for name in names], learned
    assert all(s['correct'] == s['support'] for s in learned[:4])
    multi = [r for r in rows if r['category'] == 'WC3P']
    assert multi
    assert all(set_credit(r['features']['group_h2h_pct'], r['qualified'], False) > 0 for r in multi)
    informative = [r for r in multi if len(set(r['features']['group_h2h_pct'])) > 1]
    assert informative
    low = sum(set_credit(r['features']['group_h2h_pct'], r['qualified'], False) for r in informative)
    high = sum(set_credit(r['features']['group_h2h_pct'], r['qualified'], True) for r in informative)
    assert low > high
    return f'PASS: exact H2H,DIV,COM,CONF planted list; {len(synthetic)} real-schedule synthetic seasons, {len(pairs)} strict synthetic pairs (recovered {recovered}); worst-group-H2H recovered on {len(informative)} informative WC3P groups ({low:.2f} low vs {high:.2f} high credit).'


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    for command in ('features', 'decision-list', 'group-list', '3plus-direction', 'selftest', 'export-procedure'):
        cmd = sub.add_parser(command)
        cmd.add_argument('--split', choices=('discovery', 'train', 'dev', 'holdout'), default='train')
        if command != 'selftest':
            cmd.add_argument('--cutoff', choices=tuple(CUTOFFS), default='thru_cal_wk18')
            cmd.add_argument('--workers', type=int, default=None)
        if command in ('features', 'group-list', 'export-procedure'):
            cmd.add_argument('--category', choices=('WC3P', 'DIV3P'), required=True)
        if command == 'features':
            cmd.add_argument('--group-size', type=int)
        if command == 'export-procedure':
            cmd.add_argument('--name')
            cmd.add_argument('--max-steps', type=int, default=6)
            cmd.add_argument('--min-support', type=int, default=8)
        if command == 'group-list':
            cmd.add_argument('--subset', choices=('all', 'diff-div', 'same-div'))
            cmd.add_argument('--max-steps', type=int, default=6)
            cmd.add_argument('--min-support', type=int, default=8)
            cmd.add_argument('--no-restart', action='store_true')
        if command == 'decision-list':
            cmd.add_argument('--category', choices=('WC2', 'DIV2', 'DSEED', 'WSEED'), required=True)
            cmd.add_argument('--strict-only', action='store_true', help='Strict isolated pairs are always required')
    args = parser.parse_args()
    if args.command in ('group-list', 'export-procedure') and (args.max_steps < 0 or args.min_support < 1):
        parser.error('--max-steps must be nonnegative and --min-support must be positive')
    if args.command == 'selftest':
        print(selftest(args.split))
        return
    rows = load_rows(args.split, args.cutoff, args.workers, groups=args.command in ('group-list', 'export-procedure'))
    print(f'split={args.split} cutoff={args.cutoff}; high/low means high/low is good; intervals are Wilson 95% (fractional scores descriptive).')
    if args.command == 'export-procedure':
        print(export_procedure(rows, args.category, args.split, args.cutoff, args.max_steps, args.min_support, args.name))
    elif args.command == 'features':
        print_features(rows, args.category, args.group_size)
    elif args.command == 'group-list':
        print_group_list(rows, args.category, args.subset, args.max_steps, args.min_support, not args.no_restart)
    elif args.command == 'decision-list':
        pairs, skipped, excluded = strict_pairs(rows, args.category)
        print(f'{args.category}: strict pairs={len(pairs)} ambiguous bracket order skipped={skipped} other non-strict excluded={excluded}')
        learned, remaining = learn_list(pairs)
        for i, step in enumerate(learned, 1):
            print(f'{i}. {step["feature"]} {"high" if step["high"] else "low"}: coverage={step["support"]}/{step["remaining"]} {wilson(step["correct"], step["support"])}')
        print(f'Unexplained pairs={len(remaining)}; minimum separating support=8')
    else:
        print_direction(rows)


if __name__ == '__main__':
    main()
