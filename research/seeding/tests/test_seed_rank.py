from dataclasses import asdict
import unittest

from research.seeding.engine import Engine, configuration
from research.seeding.tests.test_seeding import game


def ranking_engine(teams, games, **switches):
    season = dict(id='SEED-RANK', teams={t: dict(conf='AFC', div=t) for t in teams}, games=games)
    config = asdict(configuration('chain_best'))
    config.update(seed_rank_method='outlier_chain', outlier_chain_criteria=['H2H'], **switches)
    return Engine(season, config)


class SeedRankingTests(unittest.TestCase):
    def test_each_head_to_head_pattern_ranks_dropped_teams_last(self):
        cases = [
            ([game(0, 'A', 'B')], (0, 0, 1)),
            ([game(0, 'A', 'B'), game(1, 'A', 'B')], (0, 0, 2)),
            ([game(0, 'B', 'A'), game(1, 'C', 'A')], (1, 1, 0)),
            ([game(0, 'B', 'A'), game(1, 'B', 'A'), game(2, 'C', 'A'), game(3, 'C', 'A')], (2, 2, 0)),
            ([game(0, 'A', 'C'), game(1, 'B', 'A'), game(2, 'C', 'B'), game(3, 'C', 'B')], (1, 1, 2)),
            ([game(0, 'B', 'C'), game(1, 'C', 'A'), game(2, 'C', 'A')], (2, 1, 0)),
        ]
        for games, expected in cases:
            for context in ('dw_seed', 'wc_seed'):
                with self.subTest(pattern=expected, context=context):
                    engine = ranking_engine('ABC', games, criteria={context: ['FALLBACK']})
                    wins = engine.chain_values('ABC', 'H2H', context)
                    ordered = engine.rank_group('ABC', context)
                    self.assertEqual(set(ordered), set('ABC'))
                    self.assertEqual(len(ordered), 3)
                    self.assertEqual(tuple(wins[t] for t in ordered), expected)
                    first = next(t for t in engine.trace if t['criterion'].startswith('seed_rank:H2H:')
                                 and not t['criterion'].endswith(':silent'))
                    dropped = set(first['tied_group']) - set(first['result'])
                    self.assertEqual(dropped, {ordered[-1]})

    def test_full_ranking_does_not_reintroduce_the_first_dropped_team(self):
        games = [game(0, 'A', 'B')]
        config = dict(outlier_chain_contexts=['dw_seed'], criteria={'dw_seed': ['FALLBACK']})
        ranked = ranking_engine('ABC', games, **config)
        self.assertEqual(ranked.rank_group('ABC', 'dw_seed'), list('BCA'))
        config = asdict(ranked.config)
        config['seed_rank_method'] = 'normal'
        self.assertEqual(Engine(ranked.season, config).rank_group('ABC', 'dw_seed'), list('BAC'))
        for name in ('cluster_all', 'outlier_seed'):
            config = asdict(configuration(name))
            config['criteria']['dw_seed'] = ['FALLBACK']
            self.assertEqual(Engine(ranked.season, config).rank_group('ABC', 'dw_seed'), list('BAC'))

    def test_order_consumes_the_full_ranking_for_an_equal_record_group(self):
        games = [game(0, 'A', 'B'), game(1, 'X', 'A'), game(2, 'B', 'X'),
                 game(3, 'C', 'X'), game(4, 'X', 'C')]
        engine = ranking_engine('ABCX', games, criteria={'dw_seed': ['FALLBACK']})
        self.assertEqual(engine.order('ABC', 'dw_seed'), list('BCA'))
        self.assertEqual(sum(t['criterion'] == 'seed_rank:order' for t in engine.trace), 1)

    def test_silent_fallback_gates_the_plain_beat_none_shortcut(self):
        games = [game(0, 'B', 'C'), game(1, 'C', 'B')]
        for shortcut, expected in ((False, 'ABC'), (True, 'BCA')):
            engine = ranking_engine('ABC', games, seed_rank_beat_none=shortcut, criteria={'dw_seed': ['FALLBACK']})
            engine.config.outlier_chain_criteria = ['DIV']
            original = asdict(engine.config)
            self.assertEqual(engine.rank_group('ABC', 'dw_seed'), list(expected))
            self.assertEqual(asdict(engine.config), original)
            self.assertEqual(any(t['criterion'] == 'beat_none_last' for t in engine.trace), shortcut)

    def test_three_only_leaves_the_entire_four_team_group_on_plain_rules(self):
        games = [game(0, 'D', 'B'), game(1, 'D', 'C'), game(2, 'B', 'C'), game(3, 'C', 'D')]
        engine = ranking_engine('ABCD', games, seed_rank_three_only=True)
        plain = Engine(engine.season, 'chain_best')
        self.assertEqual(engine.rank_group('ABCD', 'dw_seed'), plain.rank_group('ABCD', 'dw_seed'))
        self.assertFalse(any(t['criterion'] == 'seed_rank:order' for t in engine.trace))

    def test_checklist_handoff_uses_pair_head_to_head_instead_of_original_group_wins(self):
        games = [game(0, 'B', 'C'), game(1, 'C', 'A'), game(2, 'C', 'A')]
        self.assertEqual(ranking_engine('ABC', games).rank_group('ABC', 'dw_seed'), list('CBA'))
        engine = ranking_engine('ABC', games, seed_final_pair='checklist')
        self.assertEqual(engine.rank_group('ABC', 'dw_seed'), list('BCA'))
        self.assertTrue(any(t['criterion'] == 'seed_rank:pair_checklist' for t in engine.trace))

    def test_four_team_handoff_preserves_the_two_worst_slots(self):
        games = [game(0, 'D', 'A'), game(1, 'D', 'A'), game(2, 'D', 'A'),
                 game(3, 'C', 'D'), game(4, 'C', 'A'), game(5, 'B', 'A')]
        engine = ranking_engine('ABCD', games, seed_final_pair='checklist')
        self.assertEqual(engine.rank_group('ABCD', 'dw_seed'), list('CDBA'))

    def test_corpus_pair_handoff_fixes_the_reported_cases_without_changing_qualification(self):
        from research.seeding.corpus import load_corpus
        cases = [('ANG-s0', 'dw_seed', ('LAC', 'NYJ', 'TEN'), 'TEN', 'NYJ'),
                 ('BXI-s0', 'dw_seed', ('AZ', 'DAL', 'DET'), 'DET', 'AZ'),
                 ('CS-s1', 'dw_seed', ('CLE', 'KC', 'NYJ'), 'CLE', 'KC'),
                 ('DNAFL-s0', 'dw_seed', ('CLS', 'OAK', 'SA'), 'OAK', 'CLS'),
                 ('FB-s0', 'dw_seed', ('BAL', 'BUF', 'DEN'), 'DEN', 'BUF'),
                 ('RUNIT-s0', 'dw_seed', ('CLE', 'LV', 'NE'), 'CLE', 'LV'),
                 ('OB4LL-s0', 'wc_seed', ('CLE', 'IND', 'KC'), 'CLE', 'IND'),
                 ('GFML-s0', 'wc_seed', ('LAR', 'MIN', 'WAS'), 'LAR', 'WAS')]
        identities = {case[0] for case in cases} | {'M2LL-s0'}
        seasons = {s['id']: s for s in load_corpus() if s.get('old_split', s['split']) == 'train' and s['id'] in identities}
        for identity, context, group, winner, loser in cases:
            with self.subTest(identity=identity):
                engine = Engine(seasons[identity], 'chain_seed_pair')
                ordered = engine.rank_group(group, context)
                self.assertLess(ordered.index(winner), ordered.index(loser))
                values = engine.values((winner, loser), 'H2H', context)
                self.assertGreater(values[winner], values[loser])
        engine = Engine(seasons['M2LL-s0'], 'chain_seed_pair')
        self.assertEqual(engine.procedure(('DEN', 'JAX', 'TEN'), 'wc_qualify', 1), ['JAX'])
        self.assertEqual(engine.select(('DEN', 'JAX'), 'wc_qualify', reduce=False), 'DEN')
        self.assertEqual(configuration('chain_seed').seed_final_pair, 'chain')
        self.assertFalse(configuration('chain_seed_pair4').seed_rank_three_only)
        with self.assertRaises(ValueError):
            configuration(dict(seed_final_pair='bad'))

    def test_train_selected_alias_is_the_three_team_only_variant(self):
        self.assertEqual(asdict(configuration('chain_seed')), asdict(configuration('chain_seed_three')))
        self.assertEqual(configuration('chain_seed_dw').seed_rank_contexts, ['dw_seed'])
        self.assertEqual(configuration('chain_seed_wc').seed_rank_contexts, ['wc_seed'])
        self.assertTrue(configuration('chain_seed_shortcut').seed_rank_beat_none)

    def test_contexts_and_two_team_ties_keep_their_existing_rules(self):
        engine = ranking_engine('ABC', [game(0, 'A', 'B')], seed_rank_contexts=['wc_seed'])
        self.assertIsNone(engine.seed_rank('ABC', 'dw_seed'))
        self.assertIsNone(engine.seed_rank('AB', 'wc_seed'))
        self.assertEqual(engine.rank_group('AB', 'wc_seed'), list('AB'))
        for raw in (dict(seed_rank_method='bad'), dict(seed_rank_contexts=['division_title']),
                    dict(seed_rank_three_only=1), dict(seed_rank_beat_none=1)):
            with self.assertRaises(ValueError):
                configuration(raw)
