from dataclasses import replace
import itertools
import unittest

from research.seeding.corpus import load_fixtures
from research.seeding.engine import Engine
from research.seeding.observe import observe
from research.seeding.solver import (Group, CHOICES, grid, load_groups, predict, program,
                                     score, search, separate, values)


def season(games=(), teams='ABCDX'):
    return dict(id='synthetic', split='discovery', league='synthetic',
                teams={t: dict(conf='AFC', div='shared' if t in 'AB' else t, teamId=i)
                       for i, t in enumerate(teams)},
                games=[dict(weekIndex=i % 18, home=a, away=b, homeScore=hs, awayScore=aws,
                            status=4 if hs == aws else 2, gameId=i)
                       for i, (a, b, hs, aws) in enumerate(games)], playoff_games=[])


def group(data=None, teams='ABCD', k=1, context='WCQ'):
    return Group('synthetic', data or season(), context, tuple(teams), tuple(teams[:k]))


class SolverTests(unittest.TestCase):
    def test_steps_separate_expected_teams(self):
        examples = [
            ('best_first', [3, 2, 1], ('pick', ['A'])),
            ('best_first', [3, 3, 1], ('drop', ['C'])),
            ('worst_first', [1, 2, 2], ('drop', ['A'])),
            ('worst_first', [1, 1, 2], ('silent', [])),
            ('worst_tier', [1, 1, 2], ('drop', ['A', 'B'])),
            ('separated_bottom', [1, 1, 2], ('drop', ['C'])),
            ('farthest_mean', [0, 1, 2], ('drop', ['A'])),
            ('farthest_mean', [0, 0, 3], ('drop', ['C'])),
            ('cluster', [1, 1, 2], ('drop', ['C'])),
            ('cluster', [1, 2, 3], ('drop', ['A'])),
            ('cluster', [1, 1, 2, 2], ('silent', [])),
        ]
        for step, nums, expected in examples:
            with self.subTest(step=step, nums=nums):
                self.assertEqual(separate(dict(zip('ABCD', nums)), step), expected)
        for step in CHOICES['step']:
            self.assertEqual(separate(dict(A=1, B=1), step), ('silent', []))

    def test_exhaustive_search_recovers_every_planted_step(self):
        data = season([('A', 'B', 7, 0), ('B', 'C', 7, 0), ('B', 'C', 7, 0),
                       ('D', 'A', 7, 0), ('D', 'B', 7, 0), ('C', 'D', 0, 7)])
        for step, reduction in itertools.product(CHOICES['step'], ('none', 'nfl')):
            planted = program(dict(step=step, structure='per_spot', division_reduction=reduction))
            groups = []
            for members, k in [('ABCD', 1), ('ABCD', 2), ('ABC', 1), ('BCD', 2)]:
                g = group(data, members, k)
                prediction = predict(g, planted)
                groups.append(replace(g, qualified=prediction['qualified']))
            candidates = [program(dict(step=s, structure='per_spot', division_reduction=reduction))
                          for s in CHOICES['step']]
            rows = search(groups, candidates, workers=1)
            found = next(r for r in rows if r['program'] == planted)
            self.assertEqual(found['misses'], [], (step, reduction))
            self.assertTrue(any(g.season['teams']['A']['div'] == g.season['teams']['B']['div'] for g in groups))

    def test_original_and_current_head_to_head_disagree_after_removal(self):
        data = season([('A', 'B', 7, 0), ('B', 'C', 7, 0), ('B', 'C', 7, 0)])
        g = group(data, 'ABC')
        p = dict(step='worst_first', criteria=['H2H'])
        self.assertEqual(predict(g, p)['qualified'], ('B',))
        self.assertEqual(predict(g, dict(p, scope={'H2H': 'current'}))['qualified'], ('A',))

    def test_drop_cannot_overshoot_qualification(self):
        g = group(season([('A', 'B', 7, 0), ('A', 'C', 7, 0)]), 'ABC', 2)
        trace = []
        prediction = predict(g, dict(step='worst_tier', criteria=['H2H']), trace)
        self.assertEqual(set(prediction['qualified']), {'A', 'B'})
        self.assertEqual(trace[0]['action'], 'silent')

    def test_picking_the_last_qualifier_stops_elimination(self):
        g = group(season([('C', 'A', 7, 0), ('C', 'B', 7, 0), ('B', 'A', 7, 0)]), 'ABC')
        trace = []
        self.assertEqual(predict(g, dict(step='best_first', criteria=['H2H']), trace)['qualified'], ('C',))
        self.assertEqual(sum(e.get('action') == 'pick' for e in trace), 1)

    def test_picks_are_above_remaining_teams_and_drops_reverse(self):
        g = group(season([('C', 'A', 7, 0), ('C', 'B', 7, 0), ('B', 'A', 7, 0)]), 'ABC')
        for step in ('best_first', 'worst_first'):
            self.assertEqual(predict(g, dict(step=step, structure='rank', criteria=['H2H']))['order'], ('C', 'B', 'A'))

    def test_ties_are_half_wins_and_missing_pairs_can_be_silent(self):
        g = group(season([('A', 'B', 7, 7)]), 'ABC')
        p = program()
        self.assertEqual(values(g, 'H2H', tuple('ABC'), p)['A'], .5)
        p['h2h_value'] = 'pct_skip'
        self.assertIsNone(values(g, 'H2H', tuple('ABC'), p))
        p['h2h_value'] = 'pct_half'
        self.assertEqual(values(g, 'H2H', tuple('ABC'), p)['C'], .5)

    def test_common_minimum_and_cutoff_use_real_games(self):
        g = group(season([('A', 'X', 7, 0), ('B', 'X', 0, 7)]), 'AB')
        self.assertEqual(values(g, 'COM', tuple('AB'), program())['A'], 1)
        self.assertIsNone(values(g, 'COM', tuple('AB'), program({'com_min': 4})))
        g.season['games'].append(dict(weekIndex=18, home='B', away='A', homeScore=99, awayScore=0))
        g.data, g.cache = None, {}
        self.assertEqual(values(g, 'H2H', tuple('AB'), program())['B'], 0)

    def test_division_mates_return_for_later_spots(self):
        g = group(season([('A', 'B', 7, 0), ('B', 'C', 7, 0), ('B', 'D', 7, 0)]), k=2)
        trace = []
        prediction = predict(g, dict(step='best_first', structure='per_spot', division_reduction='nfl'), trace)
        reductions = [e for e in trace if e['action'] == 'division_reduction']
        self.assertEqual(len(reductions[0]['representatives']), 3)
        self.assertEqual(prediction['order'][:2], ('A', 'B'))
        self.assertIn('B', reductions[1]['pool'])

    def test_joint_qualification_and_snapshot_are_separate(self):
        g = group(k=2)
        g.full_order = tuple('BACD')
        self.assertEqual(score(g, dict(qualified=('B', 'A'), order=tuple('ABCD'))), (True, False))
        self.assertEqual(score(g, dict(qualified=('A', 'C'), order=tuple('BACD'))), (False, True))
        g.qualified, g.orders = None, (tuple('BACD'), tuple('ABCD'))
        self.assertEqual(score(g, dict(order=tuple('ABCD'))), (True, False))

    def test_serial_and_multiprocess_search_are_deterministic(self):
        groups = [group(season([('A', 'B', 7, 0), ('B', 'C', 7, 0)]))]
        programs = grid('criteria')
        first = search(groups, programs, workers=1)
        self.assertEqual(first, search(groups, programs, workers=2))
        self.assertEqual(first, search(groups, list(reversed(programs)), workers=1))

    def test_fresh_is_refused_before_observation_and_prediction(self):
        data = season()
        data['split'] = 'fresh'
        with self.assertRaisesRegex(ValueError, 'fresh'):
            load_groups(seasons=[data])
        with self.assertRaisesRegex(ValueError, 'fresh'):
            group(data)
        g = group()
        g.season['split'] = 'fresh'
        with self.assertRaisesRegex(ValueError, 'fresh'):
            predict(g)
        with self.assertRaises(ValueError):
            grid('{"split":["fresh"]}')

    def test_chain_best_fixture_agreement_is_measured(self):
        fixtures = load_fixtures()
        conferences = sum(len({t['conf'] for t in s['teams'].values()}) for s in fixtures)
        self.assertEqual(conferences, 34)
        groups = []
        for data in fixtures:
            for d in observe(data)['decisions']:
                if d.category in ('WC3P', 'DIV3P'):
                    groups.append(Group(':'.join((data['id'], d.conference, d.category)), data,
                                        'WCQ' if d.category == 'WC3P' else 'DIVT',
                                        d.tied_group, d.outcome['qualified']))
        agreements, differences = 0, []
        for g in groups:
            if len(g.teams) < 3 or g.context not in ('WCQ', 'DIVT'):
                continue
            engine = Engine(g.season, 'chain_best')
            context = 'wc_qualify' if g.context == 'WCQ' else 'division_title'
            expected = set(engine.procedure(g.teams, context, g.k))
            actual = set(predict(g, dict(step='farthest_mean'))['qualified'])
            if expected == actual:
                agreements += 1
            else:
                differences.append((g.id, sorted(expected), sorted(actual)))
        print(f'chain_best ({conferences} fixture conferences) agreement: {agreements}/{agreements + len(differences)}; differences={differences}')
        self.assertGreater(agreements, 0)
        self.assertEqual(differences, [])


if __name__ == '__main__':
    unittest.main()
