from dataclasses import asdict
import unittest

from research.seeding.corpus import load_corpus
from research.seeding.engine import Engine, configuration
from research.seeding.tests.test_seeding import game


def outlier_engine(teams, games, **switches):
    season = dict(id='OUTLIER', teams={t: dict(conf='AFC', div=t) for t in teams},
                  games=games, playoff_games=[])
    return Engine(season, dict(group_method='h2h_outlier', **switches))


class OutlierTests(unittest.TestCase):
    def test_unique_farthest_can_drop_the_highest_win_total(self):
        engine = outlier_engine('ABC', [game(0, 'A', 'B'), game(1, 'A', 'C')])
        self.assertEqual(set(engine.procedure('ABC', 'wc_qualify', 2)), {'B', 'C'})
        self.assertEqual(engine.trace[0]['criterion'], 'h2h_outlier:unique_farthest')

    def test_unique_farthest_can_drop_the_lowest_win_total(self):
        engine = outlier_engine('ABC', [game(0, 'A', 'C'), game(1, 'B', 'C')])
        self.assertEqual(set(engine.procedure('ABC', 'wc_qualify', 2)), {'A', 'B'})

    def test_tied_farthest_drops_the_unique_lowest_among_the_farthest(self):
        engine = outlier_engine('ABC', [game(0, 'A', 'B'), game(1, 'A', 'C'), game(2, 'B', 'C')])
        self.assertEqual(set(engine.procedure('ABC', 'wc_qualify', 2)), {'A', 'B'})
        self.assertEqual(engine.trace[0]['criterion'], 'h2h_outlier:tied_farthest_lowest')

    def test_all_equal_and_nonunique_lowest_are_silent(self):
        for teams, games, kind in (('ABC', [], 'all_equal'),
                                   ('ABCD', [game(0, 'A', 'C'), game(1, 'A', 'D'),
                                             game(2, 'B', 'C'), game(3, 'B', 'D')], 'tied_farthest_lowest')):
            engine = outlier_engine(teams, games)
            self.assertEqual(len(engine.procedure(teams, 'wc_qualify', 1)), 1)
            self.assertEqual(engine.trace[0]['criterion'], 'h2h_outlier:silent:' + kind)

    def test_stops_at_k_without_eliminating_below_it(self):
        games = [game(0, 'A', 'B'), game(1, 'A', 'C'), game(2, 'B', 'C')]
        engine = outlier_engine('ABC', games)
        self.assertEqual(len(engine.procedure('ABC', 'wc_qualify', 2)), 2)
        self.assertEqual(len(engine.trace), 1)
        self.assertIsNone(engine.procedure('ABC', 'wc_qualify', 3))

    def test_once_preserves_original_wins_and_recompute_uses_survivors_only(self):
        games = [game(0, 'A', 'B'), game(1, 'B', 'C'), game(2, 'B', 'C'), game(3, 'C', 'A')]
        once = outlier_engine('ABC', games)
        recompute = outlier_engine('ABC', games, h2h_outlier_recompute=True)
        self.assertEqual(once.procedure('ABC', 'wc_qualify', 1), ['A'])
        self.assertEqual(recompute.procedure('ABC', 'wc_qualify', 1), ['C'])

    def test_equal_two_team_remainder_skips_or_uses_head_to_head(self):
        games = [game(0, 'A', 'C'), game(1, 'B', 'A')]
        for exhausted, expected in ((True, 'A'), (False, 'B')):
            engine = outlier_engine('ABC', games, h2h_exhausted_after_group=exhausted,
                                    criteria={'wc_qualify': ['H2H', 'FALLBACK']})
            config = asdict(engine.config)
            self.assertEqual(engine.procedure('ABC', 'wc_qualify', 1), [expected])
            self.assertEqual(asdict(engine.config), config)
            used = any(t['criterion'] == 'H2H' for t in engine.trace)
            self.assertEqual(used, not exhausted)

    def test_silent_fallback_skips_division_representative_head_to_head(self):
        games = [game(0, 'A', 'B'), game(1, 'B', 'C'), game(2, 'C', 'A')]
        engine = outlier_engine('ABC', games, criteria={'wc_qualify': ['H2H', 'FALLBACK']},
                                wc_representative_selection='h2h_loser')
        engine.season['teams']['B']['div'] = 'A'
        engine.procedure('ABC', 'wc_qualify', 1)
        self.assertFalse(any(t['criterion'] in ('division_reduction', 'H2H') for t in engine.trace))

    def test_m2ll_original_totals_keep_jax_despite_losing_pair_head_to_head(self):
        season = next(s for s in load_corpus() if s.get('old_split', s['split']) == 'train' and s['id'] == 'M2LL-s0')
        engine = Engine(season, 'outlier_once_skip')
        group = ('DEN', 'JAX', 'TEN')
        from research.seeding.features import procedure_features
        self.assertEqual(procedure_features(engine.data, group)['group_h2h_wins'], (1, 2, 0))
        self.assertEqual(engine.select(('DEN', 'JAX'), 'wc_qualify', reduce=False), 'DEN')
        engine.trace.clear()
        self.assertEqual(engine.procedure(group, 'wc_qualify', 1), ['JAX'])
        self.assertEqual([t['result'] for t in engine.trace], [['DEN', 'JAX'], ['JAX']])

    def test_switches_are_validated_and_named_configs_keep_seed_context_rules(self):
        for name in ('outlier_once_skip', 'outlier_once_h2h', 'outlier_recomp_skip', 'outlier_recomp_h2h'):
            config = configuration(name)
            self.assertEqual(config.h2h_outlier_recompute, 'recomp' in name)
            self.assertEqual(config.h2h_exhausted_after_group, name.endswith('skip'))
            self.assertEqual(config.invert_h2h_contexts, ['dw_seed', 'wc_seed'])
            self.assertEqual(config.beat_none_last_contexts, ['dw_seed', 'wc_seed'])
        seed = configuration('outlier_seed')
        self.assertEqual(set(seed.h2h_outlier_contexts), {'division_title', 'wc_qualify', 'dw_seed', 'wc_seed'})
        self.assertFalse(seed.h2h_outlier_recompute)
        self.assertFalse(seed.h2h_exhausted_after_group)
        self.assertFalse(seed.invert_h2h_contexts or seed.beat_none_last_contexts)
        for switches in (dict(h2h_outlier_recompute=1), dict(h2h_exhausted_after_group='yes'),
                         dict(h2h_outlier_contexts=['unknown']), dict(h2h_outlier_fallback='unknown')):
            with self.assertRaises(ValueError):
                configuration(switches)
        self.assertIsNone(outlier_engine('ABC', []).procedure('ABC', 'dw_seed', 1))
