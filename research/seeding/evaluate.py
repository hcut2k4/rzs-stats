import argparse
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
import math
from multiprocessing import Pool
from pathlib import Path

try:
    from .corpus import load_corpus
    from .engine import configuration, seed, REGISTRY, load_procedures
    from .observe import observe, CATEGORIES
except ImportError:
    from corpus import load_corpus
    from engine import configuration, seed, REGISTRY, load_procedures
    from observe import observe, CATEGORIES

HERE = Path(__file__).resolve().parent
MODES = ('brackets-only', 'brackets+fallback')


def decision_id(decision):
    return '|'.join((decision.season_id, decision.conference, decision.category, ','.join(sorted(decision.tied_group))))


def wilson(correct, n):
    if not n:
        return (0., 1.)
    z = 1.959963984540054
    p = correct / n
    denominator = 1 + z*z/n
    center = (p + z*z/(2*n)) / denominator
    radius = z * math.sqrt(p*(1-p)/n + z*z/(4*n*n)) / denominator
    return max(0., center-radius), min(1., center+radius)


def load_config(value):
    if value in REGISTRY:
        return configuration(value)
    raw = json.loads(value)
    if not isinstance(raw, dict):
        raise ValueError('Config JSON must be an object')
    base = asdict(configuration(raw.pop('base'))) if 'base' in raw else {}
    procedures = raw.get('group_procedures')
    if isinstance(procedures, str) and procedures.startswith('@'):
        raw['group_procedures'] = load_procedures(procedures[1:])
    base.update(raw)
    return configuration(base)


def guard_fresh(split, final, config, log_path=None):
    if split != 'fresh':
        return
    if not final:
        raise ValueError('Fresh access requires --final')
    target = Path(log_path) if log_path is not None else HERE / 'data/fresh_log.txt'
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('a') as stream:
        stream.write(json.dumps(dict(time=datetime.now(timezone.utc).isoformat(), split=split, config=asdict(configuration(config))), sort_keys=True) + '\n')


def prediction(decision, conference):
    group = set(decision.tied_group)
    if decision.category.startswith('DIV'):
        return sorted(group & set(conference['division_winners'].values()))
    if decision.category.startswith('WC'):
        return sorted(group & set(conference['seeds'][len(conference['division_winners']):]))
    return [t for t in conference['seeds'] if t in group]


def score(decision, conference, label_candidates):
    predicted = prediction(decision, conference)
    if decision.outcome['qualified'] is not None:
        return set(predicted) == set(decision.outcome['qualified'])
    seeds = conference['seeds']
    group = [t for t in decision.tied_group]
    if any(t not in seeds for t in group):
        return False
    order = sorted(group, key=seeds.index)
    return any(sorted(group, key=lambda t: candidate.index(t)) == order for candidate in label_candidates)


def evaluate_season(args):
    season, config = args
    predicted = seed(season, config)
    rows, conferences, quarantines = [], [], []
    for mode in MODES:
        source = dict(season)
        if mode == 'brackets-only':
            source.pop('madden_seeds', None)
        observed = observe(source)
        excluded = {q['conference'] for q in observed['quarantine']}
        quarantines.extend(dict(mode=mode, **q) for q in observed['quarantine'])
        for d in observed['decisions']:
            labels = observed['conferences'][d.conference]['label_candidates']
            rows.append(dict(id=decision_id(d), mode=mode, category=d.category, strict=bool(d.strict),
                             group_size=d.group_size,
                             divisions=len({season['teams'][t]['div'] for t in d.tied_group}),
                             pool_isolated=bool(d.pool_isolated), correct=score(d, predicted[d.conference], labels),
                             prediction=prediction(d, predicted[d.conference]),
                             seed_assignment=predicted[d.conference]['seeds']))
        for conf, label in observed['conferences'].items():
            options = label['label_candidates']
            if not options or conf in excluded:
                continue
            conferences.append(dict(id=f'{season["id"]}|{conf}', mode=mode,
                                    correct=tuple(predicted[conf]['seeds']) in {tuple(order) for order in options},
                                    prediction=predicted[conf]['seeds']))
    return dict(decisions=rows, conferences=conferences, quarantine=quarantines)


def evaluate(seasons, config, split, workers=16, exclude_leagues=(), final=False):
    guard_fresh(split, final, config)
    excluded = sorted(set(exclude_leagues))
    selected = []
    for season in seasons:
        label = season.get('old_split', season['split']) if split in ('train', 'dev', 'holdout') else season['split']
        if season['split'] == 'fresh' and split != 'fresh':
            continue
        if (split == 'all' or label == split) and season['league'] not in excluded:
            selected.append(season)
    digest = hashlib.sha256(json.dumps(dict(config=asdict(configuration(config)), seasons=selected, split=split,
                                           exclude_leagues=excluded), sort_keys=True).encode())
    for name in ('engine.py', 'evaluate.py', 'observe.py', 'facts.py', 'features.py', 'corpus.py'):
        digest.update((HERE / name).read_bytes())
    target = HERE / 'data/evaluations' / (digest.hexdigest() + '.json')
    if target.exists():
        return json.loads(target.read_text())
    with Pool(processes=workers) as pool:
        results = pool.map(evaluate_season, [(s, config) for s in selected])
    combined = {key: [row for result in results for row in result[key]] for key in ('decisions', 'conferences', 'quarantine')}
    combined['seasons'] = len(selected)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(combined, sort_keys=True))
    temporary.replace(target)
    return combined


def format_stats(label, rows):
    n = len(rows)
    correct = sum(r['correct'] for r in rows)
    low, high = wilson(correct, n)
    accuracy = f'{correct/n:.1%}' if n else '—'
    note = ' insufficient evidence' if n < 20 else ''
    return f'{label:24} {n:5} {correct:7} {accuracy:>8} [{low:.1%}, {high:.1%}]{note}'


def report(result):
    print(f'Seasons: {result["seasons"]}')
    for mode in MODES:
        print(f'\n{mode}')
        print(f'{"Category / isolation":24} {"n":>5} {"correct":>7} {"accuracy":>8} Wilson 95%')
        for category in CATEGORIES:
            rows = [r for r in result['decisions'] if r['mode'] == mode and r['category'] == category]
            print(format_stats(category, rows))
            for kind in ('strict', 'pool_isolated'):
                isolated = [r for r in rows if r[kind]]
                if isolated:
                    print(format_stats(f'  {category} {kind}', isolated))
            if category == 'WC3P':
                for size, divisions in sorted({(r['group_size'], r['divisions']) for r in rows}):
                    group = [r for r in rows if r['group_size'] == size and r['divisions'] == divisions]
                    print(format_stats(f'  WC3P size={size} divs={divisions}', group))
        print(format_stats('Conference exact', [r for r in result['conferences'] if r['mode'] == mode]))
        print(f'Quarantine entries: {sum(q["mode"] == mode for q in result["quarantine"])}')


def diff_results(result, baseline):
    original = {(r['mode'], r['id']): r for r in baseline['decisions']}
    for row in result['decisions']:
        other = original.get((row['mode'], row['id']))
        key = 'seed_assignment' if row['category'] in ('DSEED', 'WSEED') else 'prediction'
        if other is not None and row[key] != other[key]:
            print(f'{row["mode"]} {row["id"]}: {other[key]} ({other["correct"]}) -> {row[key]} ({row["correct"]})')


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    parser.add_argument('--split', choices=('discovery', 'fresh', 'train', 'dev', 'holdout', 'all'), required=True)
    parser.add_argument('--cutoff', choices=('thru_cal_wk18', 'thru_cal_wk17'))
    parser.add_argument('--baseline')
    parser.add_argument('--exclude-leagues', default='', help='Comma-separated league IDs to omit')
    parser.add_argument('--diff-baseline', action='store_true')
    parser.add_argument('--final', action='store_true')
    parser.add_argument('--list-failures', action='store_true')
    args = parser.parse_args(argv)
    try:
        config = load_config(args.config)
        if args.cutoff:
            config.tiebreak_stats_cutoff = args.cutoff
        baseline = load_config(args.baseline) if args.baseline else None
        if args.diff_baseline and baseline is None:
            raise ValueError('--diff-baseline requires --baseline')
        if args.split == 'fresh' and not args.final:
            raise ValueError('Fresh access requires --final')
    except (ValueError, KeyError) as error:
        parser.error(str(error))
    seasons = load_corpus(include_fresh=args.split == 'fresh')
    excluded = [name.strip() for name in args.exclude_leagues.split(',') if name.strip()]
    result = evaluate(seasons, config, args.split, exclude_leagues=excluded, final=args.final)
    report(result)
    if args.list_failures:
        for row in result['decisions']:
            if not row['correct']:
                print(f'FAIL {row["mode"]} {row["id"]}')
    if baseline is not None:
        original = evaluate(seasons, baseline, args.split, exclude_leagues=excluded, final=args.final)
        print(f'\nBaseline: {args.baseline}')
        report(original)
        if args.diff_baseline:
            diff_results(result, original)


if __name__ == '__main__':
    main()
