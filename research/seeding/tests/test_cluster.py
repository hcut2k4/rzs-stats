from dataclasses import asdict
import unittest

from research.seeding.engine import Engine, configuration
from research.seeding.tests.test_seeding import game


def cluster_engine(teams, games, **switches):
    season = dict(id='CLUSTER', teams={t: dict(conf='AFC', div=t) for t in teams},
                  games=games, playoff_games=[])
    return Engine(season, dict(group_method='h2h_cluster', processing_order='whole_group', **switches))


class ClusterTests(unittest.TestCase):
    def test_unique_largest_discards_the_odd_team_with_more_or_fewer_wins(self):
        for games, expected in (([game(0, 'A', 'B'), game(1, 'A', 'C')], {'B', 'C'}),
                                ([game(0, 'A', 'C'), game(1, 'B', 'C')], {'A', 'B'})):
            engine = cluster_engine('ABC', games)
            self.assertEqual(set(engine.procedure('ABC', 'wc_qualify', 2)), expected)
            self.assertEqual(engine.trace[0]['criterion'], 'h2h_cluster:unique_largest')

    def test_all_distinct_eliminates_only_the_fewest_wins(self):
        engine = cluster_engine('ABC', [game(0, 'A', 'B'), game(1, 'A', 'C'), game(2, 'B', 'C')])
        self.assertEqual(set(engine.procedure('ABC', 'wc_qualify', 2)), {'A', 'B'})
        self.assertEqual(engine.trace[0]['criterion'], 'h2h_cluster:all_distinct')

    def test_all_equal_and_tied_largest_abstain_then_fall_back(self):
        for teams, games, kind in (('ABC', [], 'all_equal'),
                                   ('ABCD', [game(0, 'A', 'C'), game(1, 'B', 'D')], 'tied_largest')):
            engine = cluster_engine(teams, games)
            result = engine.procedure(teams, 'wc_qualify', 1)
            self.assertEqual(len(result), 1)
            self.assertEqual(engine.trace[0]['criterion'], 'h2h_cluster:' + kind)
            self.assertEqual(engine.trace[0]['result'], list(teams))
            self.assertTrue(any(t['criterion'] == 'h2h_cluster:fallback' for t in engine.trace))

    def test_restarts_with_recomputed_wins_after_every_reduction(self):
        games = [game(0, 'A', 'B'), game(1, 'B', 'C'), game(2, 'C', 'D'),
                 game(3, 'D', 'A'), game(4, 'D', 'E')]
        engine = cluster_engine('ABCDE', games)
        self.assertEqual(set(engine.procedure('ABCDE', 'wc_qualify', 2)), {'A', 'B'})
        changes = [t for t in engine.trace if t['criterion'] == 'h2h_cluster:unique_largest']
        self.assertEqual([t['result'] for t in changes], [list('ABC'), list('AB')])

    def test_overshoot_keeps_cluster_and_best_remaining_wins(self):
        games = [game(0, 'A', 'B'), game(1, 'A', 'C'), game(2, 'A', 'D'), game(3, 'B', 'C')]
        engine = cluster_engine('ABCD', games)
        self.assertEqual(set(engine.procedure('ABCD', 'wc_qualify', 3)), {'A', 'C', 'D'})
        self.assertEqual(engine.trace[0]['criterion'], 'h2h_cluster:unique_largest:overshoot_fill')

    def test_overshoot_tied_boundary_uses_normal_checklist(self):
        games = [game(0, 'A', 'B'), game(1, 'B', 'C'), game(2, 'C', 'A'),
                 game(3, 'A', 'D'), game(4, 'A', 'E'), game(5, 'B', 'D'),
                 game(6, 'B', 'F'), game(7, 'C', 'E'), game(8, 'C', 'F'),
                 game(9, 'D', 'E'), game(10, 'E', 'F')]
        engine = cluster_engine('ABCDEF', games)
        self.assertEqual(set(engine.procedure('ABCDEF', 'wc_qualify', 4)), set('ABCD'))
        self.assertTrue(any(t['criterion'].endswith(':overshoot_fill') for t in engine.trace))

    def test_two_team_remainder_uses_context_checklist(self):
        games = [game(0, 'B', 'A'), game(1, 'B', 'C'), game(2, 'C', 'A')]
        engine = cluster_engine('ABC', games)
        self.assertEqual(engine.procedure('ABC', 'wc_qualify', 1), ['B'])
        self.assertTrue(any(t['criterion'] == 'H2H' and t['tied_group'] == ['B', 'C'] for t in engine.trace))
        self.assertEqual(engine.select('BC', 'wc_qualify', reduce=False), 'B')

    def test_ties_count_zero_and_unplayed_teams_have_zero_wins(self):
        engine = cluster_engine('ABCD', [game(0, 'A', 'B', 10, 10), game(1, 'A', 'C')])
        self.assertEqual(set(engine.procedure('ABCD', 'wc_qualify', 3)), {'B', 'C', 'D'})

    def test_fallback_method_is_independent_and_restores_configuration(self):
        games = [game(0, 'A', 'B', 50, 0), game(1, 'B', 'C'), game(2, 'C', 'A')]
        for method, expected in (('worst_first', 'A'), ('nfl_best_first', 'A'),
                                 ('single_key', 'A'), ('pairwise_sort', 'A')):
            engine = cluster_engine('ABC', games, h2h_cluster_fallback=method,
                                    criteria={'wc_qualify': ['NET_ALL', 'FALLBACK']}, worst_first_contexts=['wc_qualify'])
            config = asdict(engine.config)
            self.assertEqual(engine.procedure('ABC', 'wc_qualify', 1), [expected])
            self.assertEqual(asdict(engine.config), config)
            if method in ('worst_first', 'nfl_best_first'):
                first = next(t for t in engine.trace if t['criterion'] == 'NET_ALL')
                self.assertEqual(first['result'], list('AC') if method == 'worst_first' else ['A'])

    def test_named_configs_scope_cluster_and_disable_conflicting_steps(self):
        for name, contexts in (('cluster', {'wc_qualify', 'division_title'}),
                               ('cluster_all', {'wc_qualify', 'division_title', 'dw_seed', 'wc_seed'})):
            config = configuration(name)
            self.assertEqual(set(config.h2h_cluster_contexts), contexts)
            self.assertFalse(contexts & set(config.invert_h2h_contexts))
            self.assertFalse(contexts & set(config.beat_none_last_contexts))
        for switch in (dict(group_method='unknown'), dict(h2h_cluster_fallback='unknown'),
                       dict(h2h_cluster_contexts=['unknown'])):
            with self.assertRaises(ValueError):
                configuration(switch)
        engine = cluster_engine('ABC', [])
        self.assertIsNone(engine.procedure('ABC', 'dw_seed', 1))
