from dataclasses import asdict
from fractions import Fraction
import unittest

from research.seeding.corpus import load_corpus
from research.seeding.engine import Engine, configuration
from research.seeding.tests.test_seeding import game


def chain_engine(**switches):
    season = dict(id='CHAIN', teams={t: dict(conf='AFC' if t != 'Y' else 'NFC',
                  div='A' if t == 'X' else t) for t in 'ABCXY'},
                  games=[game(0, 'A', 'X'), game(1, 'X', 'B'), game(2, 'X', 'C'),
                         game(3, 'X', 'Y'), game(4, 'A', 'Y')], playoff_games=[])
    config = asdict(configuration('outlier_once_skip'))
    config.update(group_method='outlier_chain', **switches)
    return Engine(season, config)


class ChainTests(unittest.TestCase):
    def test_each_criterion_can_remove_a_group_outlier(self):
        for criterion in ('H2H', 'DIV', 'COM', 'CONF', 'SOV', 'SOS', 'NET_CONF', 'NET_ALL'):
            with self.subTest(criterion=criterion):
                engine = chain_engine(outlier_chain_criteria=[criterion])
                if criterion == 'H2H':
                    season = engine.season
                    season['games'] += [game(5, 'A', 'B'), game(6, 'A', 'C')]
                    engine = Engine(season, engine.config)
                self.assertEqual(set(engine.procedure('ABC', 'wc_qualify', 2)), {'B', 'C'})
                self.assertEqual(engine.trace[0]['criterion'], f'outlier_chain:{criterion}:unique_farthest')

    def test_restart_modes_move_to_the_expected_criterion(self):
        expected = dict(next=['H2H', 'DIV', 'CONF'], first=['H2H', 'DIV', 'H2H', 'DIV', 'CONF'],
                        same=['H2H', 'DIV', 'DIV', 'CONF'])
        for mode, sequence in expected.items():
            engine = chain_engine(chain_restart=mode, outlier_chain_criteria=['H2H', 'DIV', 'CONF'],
                                  criteria={'wc_qualify': ['FALLBACK']})
            self.assertEqual(engine.procedure('ABC', 'wc_qualify', 1), ['B'])
            criteria = [t['criterion'].split(':')[1] for t in engine.trace
                        if t['criterion'].startswith('outlier_chain:') and t['criterion'] != 'outlier_chain:fallback']
            self.assertEqual(criteria, sequence)

    def test_common_values_recompute_but_original_mean_stays_fixed(self):
        season = dict(id='COMMON', teams={t: dict(conf='AFC', div=t) for t in 'ABCDY'},
                      games=[game(0, 'A', 'B'), game(1, 'A', 'C'), game(2, 'A', 'D'),
                             game(3, 'B', 'Y'), game(4, 'B', 'Y'), game(5, 'C', 'Y'),
                             game(6, 'Y', 'C'), game(7, 'Y', 'D'), game(8, 'Y', 'D')])
        for mean, winner in (('current', 'B'), ('original', 'C')):
            config = asdict(chain_engine().config)
            config.update(chain_restart='same', chain_mean=mean, outlier_chain_criteria=['H2H', 'COM'])
            engine = Engine(season, config)
            self.assertEqual(engine.chain_values('ABCD', 'COM', 'wc_qualify'), dict(A=0, B=0, C=0, D=0))
            self.assertEqual(engine.chain_values('BCD', 'COM', 'wc_qualify'), dict(B=Fraction(2, 3), C=Fraction(1, 3), D=0))
            config['chain_restart'] = 'next'
            engine = Engine(season, config)
            self.assertEqual(engine.procedure('ABCD', 'wc_qualify', 1), [winner])

    def test_two_team_step_keeps_the_higher_value_under_both_mean_modes(self):
        for mean in ('current', 'original'):
            engine = chain_engine(chain_mean=mean, chain_restart='next', outlier_chain_criteria=['H2H', 'COM'])
            season = engine.season
            season['games'] = [game(0, 'A', 'B'), game(1, 'A', 'C'), game(2, 'B', 'Y'), game(3, 'Y', 'C')]
            engine = Engine(season, engine.config)
            self.assertEqual(engine.procedure('ABC', 'wc_qualify', 1), ['B'])

    def test_same_criterion_continues_using_original_head_to_head_wins(self):
        engine = chain_engine(outlier_chain_criteria=['H2H'])
        season = engine.season
        season['games'] = [game(0, 'C', 'A'), game(1, 'C', 'B'), game(2, 'B', 'A')]
        engine = Engine(season, engine.config)
        self.assertEqual(engine.procedure('ABC', 'wc_qualify', 1), ['C'])
        self.assertEqual([t['result'] for t in engine.trace], [list('BC'), ['C']])

    def test_pair_head_to_head_is_optional_only_in_the_final_handoff(self):
        for keep, winner in ((False, 'B'), (True, 'C')):
            engine = chain_engine(chain_restart='next', chain_keep_pair_h2h=keep,
                                  outlier_chain_criteria=['H2H'], criteria={'wc_qualify': ['H2H', 'FALLBACK']})
            season = engine.season
            season['games'] = [game(0, 'C', 'B'), game(1, 'B', 'A')]
            engine = Engine(season, engine.config)
            original = asdict(engine.config)
            self.assertEqual(engine.procedure('ABC', 'wc_qualify', 1), [winner])
            self.assertEqual(asdict(engine.config), original)
            self.assertEqual(any(t['criterion'] == 'H2H' for t in engine.trace), keep)

    def test_stops_at_k_and_validates_chain_switches(self):
        engine = chain_engine()
        self.assertEqual(len(engine.procedure('ABC', 'wc_qualify', 2)), 2)
        self.assertEqual(len(engine.trace), 2)
        self.assertIsNone(engine.procedure('ABC', 'wc_qualify', 3))
        self.assertIsNone(engine.procedure('ABC', 'dw_seed', 1))
        for raw in (dict(chain_restart='unknown'), dict(chain_mean='unknown'), dict(chain_keep_pair_h2h=1),
                    dict(outlier_chain_criteria=[]), dict(outlier_chain_criteria=['BAD']),
                    dict(outlier_chain_contexts=['BAD'])):
            with self.assertRaises(ValueError):
                configuration(raw)

    def test_registered_train_choices_keep_seed_context_rules(self):
        for name, keep in (('chain_best', False), ('chain_best_h2h', True)):
            config = configuration(name)
            self.assertEqual(config.chain_restart, 'same')
            self.assertEqual(config.chain_mean, 'current')
            self.assertEqual(config.chain_keep_pair_h2h, keep)
            self.assertEqual(config.outlier_chain_criteria, ['H2H', 'DIV', 'COM', 'CONF', 'SOV', 'SOS', 'NET_CONF', 'NET_ALL'])
            self.assertEqual(config.invert_h2h_contexts, ['dw_seed', 'wc_seed'])
            self.assertEqual(config.beat_none_last_contexts, ['dw_seed', 'wc_seed'])

    def test_m2ll_and_division_driven_apex_match_observed_winners(self):
        corpus = {s['id']: s for s in load_corpus() if s.get('old_split', s['split']) == 'train' and s['id'] in ('M2LL-s0', 'APEX-s0')}
        for identity, group, winner in (('M2LL-s0', ('DEN', 'JAX', 'TEN'), 'JAX'),
                                        ('APEX-s0', ('DEN', 'LAC', 'LV'), 'DEN')):
            engine = Engine(corpus[identity], chain_engine().config)
            self.assertEqual(engine.procedure(group, 'wc_qualify', 1), [winner])
            if identity == 'APEX-s0':
                self.assertTrue(any(t['criterion'].startswith('outlier_chain:DIV:')
                                    and not t['criterion'].endswith(':silent') for t in engine.trace))
