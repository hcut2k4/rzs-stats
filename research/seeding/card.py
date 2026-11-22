import argparse

try:
    from .corpus import load_corpus, load_fixtures
    from .engine import seed, REGISTRY
    from .evaluate import decision_id, prediction, score
    from .facts import facts, common_record
    from .observe import observe
except ImportError:
    from corpus import load_corpus, load_fixtures
    from engine import seed, REGISTRY
    from evaluate import decision_id, prediction, score
    from facts import facts, common_record
    from observe import observe


def record(data, i):
    return '-'.join(str(int(data[k][i])) for k in ('wins', 'losses', 'ties'))


def case_card(season, decision):
    group = decision.tied_group
    labels = observe(season)['conferences'][decision.conference]['label_candidates']
    lines = [f'{decision_id(decision)}',
             f'{season["id"]} / {decision.league} / {decision.conference} / {decision.category} ({decision.split})',
             f'Observed: {decision.outcome["qualified"] if decision.outcome["qualified"] is not None else decision.outcome["orders"]} '
             f'from {decision.outcome["label_source"]}; fixed seeds {decision.outcome["fixed_seeds"]}',
             f'Isolation: strict={decision.strict}, pool={decision.pool_isolated}']
    for cutoff in ('thru_cal_wk18', 'thru_cal_wk17'):
        data = facts(season, cutoff)
        common = common_record(data, group)
        lines.append(f'{cutoff}; common opponents: {", ".join(common["opponents"]) or "none"}')
        for j, t in enumerate(group):
            i = data['index'][t]
            h2h = ','.join(f'{other}:{data["h2h_wins"][i,k]}-{data["h2h_losses"][i,k]}-{data["h2h_ties"][i,k]}'
                           for other in group if other != t for k in (data['index'][other],))
            lines.append(f'  {t} final {record(data["final"], i)}; DIV {record(data["division"], i)}; '
                         f'CONF {record(data["conference"], i)}; COM {record(common, j)}; '
                         f'SOV/SOS {data["sov"]["pct"][i]:.3f}/{data["sos"]["pct"][i]:.3f}; '
                         f'PF/PA {data["points_for"][i]}/{data["points_against"][i]}; '
                         f'net CONF/all {data["conference_net_points"][i]}/{data["net_points"][i]}; H2H {h2h}')
    for name, config in REGISTRY.items():
        conference = seed(season, config)[decision.conference]
        lines.append(f'{name}: {prediction(decision, conference)}; full seeds {conference["seeds"]}; '
                     f'matches observed decision: {score(decision, conference, labels)} ({len(labels)} label candidates)')
        steps = [f'{step["context"]}: {",".join(step["tied_group"])} → {step["criterion"]} → {",".join(step["result"])}'
                 for step in conference['trace'] if len(set(step['tied_group']) & set(group)) >= 2]
        lines.append('  ' + '; '.join(steps or ['Final record order; no separating tiebreak needed.']))
    return '\n'.join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('decision_id')
    args = parser.parse_args(argv)
    season_id = args.decision_id.split('|')[0]
    seasons = [s for s in load_corpus() if s['id'] == season_id]
    if not seasons:
        seasons = [s for s in load_fixtures() if s['id'] == season_id]
    for season in seasons:
        for source in (season, {k: v for k, v in season.items() if k != 'madden_seeds'}):
            for decision in observe(source)['decisions']:
                if decision_id(decision) == args.decision_id:
                    print(case_card(source, decision))
                    return
    parser.error(f'Unknown decision id: {args.decision_id}')


if __name__ == '__main__':
    main()
