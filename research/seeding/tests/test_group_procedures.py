from collections import Counter
from dataclasses import asdict
import unittest

from research.seeding.corpus import load_corpus
from research.seeding.engine import Engine, configuration
from research.seeding.facts import facts
from research.seeding.mine import group_features, group_step, load_rows
from research.seeding.tests.test_seeding import game


def apply_mined_stages(row, steps):
    current = tuple(range(row['size']))
    for step in steps:
        if len(current) <= len(row['qualified']):
            break
        current = group_step(current, group_features(row, current).get(step['feature']), step['action'])
    return {row['group'][i] for i in current}


def bsd_fixture():
    return dict(id='BSD-planted', teams={
        'AZ': dict(conf='NFC', div='West'), 'CAR': dict(conf='NFC', div='South'),
        'MIN': dict(conf='NFC', div='North'), 'X': dict(conf='NFC', div='South'),
        'Y': dict(conf='NFC', div='North')},
        games=[game(0, 'CAR', 'AZ'), game(1, 'MIN', 'CAR'),
               game(2, 'X', 'CAR'), game(3, 'MIN', 'Y')], playoff_games=[])


def train_agreement():
    seasons = {s['id']: s for s in load_corpus() if s.get('old_split', s['split']) == 'train'}
    engines = {}
    counts = {category: Counter() for category in ('WC3P', 'DIV3P')}
    differences = []
    for row in load_rows('train', groups=True):
        if row['ambiguous'] or row['size'] < 3:
            continue
        category = row['category']
        context = 'wc_qualify' if category == 'WC3P' else 'division_title'
        season_id = row['id'].split('/')[0]
        if season_id not in engines:
            engines[season_id] = Engine(seasons[season_id], 'learned_v1')
        engine = engines[season_id]
        shape = 'diff_div' if row['divisions'] == row['size'] else 'same_div'
        steps = engine.config.group_procedures.get(context, {}).get(shape, [])
        retained = apply_mined_stages(row, steps)
        k = len(row['qualified'])
        counts[category]['total'] += 1
        if len(retained) != k:
            counts[category]['unresolved' if len(retained) > k else 'overshot'] += 1
            continue
        counts[category]['resolved'] += 1
        for mode in ('sequential', 'restart'):
            engine.config.group_procedure_mode = mode
            predicted = set(engine.procedure(row['group'], context, k))
            if predicted != retained:
                counts[category][mode + '_differences'] += 1
                differences.append((row['id'], mode, sorted(retained), sorted(predicted)))
            engine.trace.clear()
    return counts, differences


class GroupProcedureTests(unittest.TestCase):
    def test_sequential_keeps_bsd_head_to_head_winner_after_eliminating_az(self):
        season = bsd_fixture()
        sequential = Engine(season, 'learned_v1')
        restart_config = asdict(configuration('learned_v1'))
        restart_config['group_procedure_mode'] = 'restart'
        restart = Engine(season, restart_config)
        self.assertEqual(sequential.procedure(('AZ', 'CAR', 'MIN'), 'wc_qualify', 1), ['MIN'])
        self.assertEqual(restart.procedure(('AZ', 'CAR', 'MIN'), 'wc_qualify', 1), ['CAR'])
        changes = [t['criterion'] for t in sequential.trace]
        self.assertEqual(changes, ['procedure:group_h2h_pct:DROP_WORST_ONE',
                                   'procedure:division_pct:DROP_WORST_ONE'])

    def test_sequential_matches_miner_on_planted_stages(self):
        season = bsd_fixture()
        steps = [dict(feature='group_h2h_pct', action='DROP_WORST_ONE'),
                 dict(feature='division_pct', action='DROP_WORST_ONE')]
        row = dict(size=3, group=('AZ', 'CAR', 'MIN'), data=facts(season), qualified={2})
        engine = Engine(season, dict(group_procedures={'wc_qualify': {'diff_div': steps}}))
        self.assertEqual(apply_mined_stages(row, steps), {'MIN'})
        self.assertEqual(set(engine.procedure(row['group'], 'wc_qualify', 1)), apply_mined_stages(row, steps))

    def test_mode_is_validated_and_loadable_through_evaluate(self):
        from research.seeding.evaluate import load_config
        self.assertEqual(load_config('{"base":"learned_v1"}').group_procedure_mode, 'sequential')
        self.assertEqual(load_config('{"base":"learned_v1","group_procedure_mode":"restart"}').group_procedure_mode,
                         'restart')
        with self.assertRaises(ValueError):
            configuration(dict(group_procedure_mode='unknown'))

    def test_sequential_matches_every_resolved_mined_train_group(self):
        counts, differences = train_agreement()
        for category, values in counts.items():
            print(f'{category} train agreement: {dict(values)}')
            self.assertGreater(values['resolved'], 0)
        self.assertFalse([d for d in differences if d[1] == 'sequential'], differences)


if __name__ == '__main__':
    unittest.main()
