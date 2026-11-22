from dataclasses import asdict
import hashlib
import json
from pathlib import Path
import sys
import unittest

from research.seeding.corpus import load_corpus, RESOURCES
from research.seeding.engine import Engine, configuration, seed
from research.seeding.tests.test_seeding import game

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'explore'))
import hist


def ranking(teams, games):
    return Engine(dict(id='TEST', league='TEST', teams={t: dict(conf='AFC', div=t) for t in teams},
                       games=games), 'madden27')


class Madden27Tests(unittest.TestCase):
    def test_every_discovery_conference_matches_the_reference(self):
        checked, mismatches = 0, []
        for season in load_corpus():
            self.assertEqual(season['split'], 'discovery')
            result = seed(season, 'madden27')
            reference = hist.to_s(season)
            for conf in ('AFC', 'NFC'):
                expected = hist.reference_seeds(reference, conf)
                actual = result[conf]['seeds']
                checked += 1
                if actual != expected:
                    mismatches.append((season['id'], conf, expected, actual))
        print(f'Madden27 reference: {checked} discovery conference-seasons compared; {len(mismatches)} mismatches', flush=True)
        self.assertGreater(checked, 0)
        self.assertEqual(mismatches, [])

    def test_all_six_screenshot_conferences_match(self):
        sim = json.loads((RESOURCES / 'sim-full-season.json').read_text())
        rzs = json.loads((RESOURCES / 'rzs-seasons.json').read_text())
        checked = 0
        for identity, raw in (('SIMFULL', sim), ('103', rzs['103']), ('104', rzs['104'])):
            season = dict(id=identity, league='TEST',
                          teams={t['abbr']: dict(conf=t['conference'], div=t['division']) for t in raw['teams']},
                          games=[dict(g, weekIndex=g['week']) for g in raw['games']])
            actual = seed(season, 'madden27')
            for conf, expected in raw['maddenSeeds'].items():
                with self.subTest(season=identity, conference=conf):
                    self.assertEqual(actual[conf]['seeds'], expected)
                    checked += 1
        self.assertEqual(checked, 6)
        print(f'Madden27 screenshots: {checked}/6 conferences identical', flush=True)

    def test_unique_largest_cluster_puts_the_only_winner_last(self):
        engine = ranking('ABC', [game(0, 'A', 'B')])
        self.assertEqual(engine.rank_group('ABC', 'wc_seed'), list('BCA'))

    def test_tied_largest_clusters_sink_the_outside_team_and_restart(self):
        games = [game(0, 'E', 'A'), game(1, 'E', 'A'), game(2, 'E', 'B'),
                 game(3, 'A', 'E'), game(4, 'B', 'C'), game(5, 'C', 'E'),
                 game(6, 'C', 'E'), game(7, 'D', 'E'), game(8, 'D', 'E')]
        engine = ranking('ABCDE', games)
        ordered = engine.rank_group('ABCDE', 'wc_seed')
        self.assertEqual(ordered, list('DCABE'))
        self.assertTrue(any(row['criterion'] == 'madden27:H2H' and row['tied_group'] == list('ABCD')
                            for row in engine.trace))

    def test_distinct_head_to_head_counts_sort_highest_first(self):
        engine = ranking('ABC', [game(0, 'C', 'B'), game(1, 'C', 'A'), game(2, 'B', 'A')])
        self.assertEqual(engine.rank_group('ABC', 'wc_seed'), list('CBA'))

    def test_tied_games_count_as_half_a_head_to_head_win(self):
        engine = ranking('ABC', [game(0, 'A', 'B', 10, 10), game(1, 'A', 'C')])
        self.assertEqual(engine.values('ABC', 'H2H', 'wc_seed'), dict(A=1.5, B=.5, C=0.))
        self.assertEqual(engine.rank_group('ABC', 'wc_seed'), list('ABC'))

    def test_strength_averages_opponent_percentages_per_meeting(self):
        engine = ranking('ABCD', [game(0, 'A', 'B'), game(1, 'A', 'C'), game(2, 'B', 'D'),
                                 game(3, 'B', 'D'), game(4, 'B', 'D')])
        self.assertEqual(engine.values('A', 'SOV', 'wc_seed')['A'], .375)
        self.assertEqual(engine.values('A', 'SOS', 'wc_seed')['A'], .375)

    def test_common_opponents_have_no_minimum_and_exclude_group_members(self):
        engine = ranking('ABCX', [game(0, 'A', 'X'), game(1, 'X', 'B'), game(2, 'C', 'X'),
                                 game(3, 'B', 'A')])
        self.assertEqual(engine.values('ABC', 'COM', 'wc_seed'), dict(A=1, B=0, C=1))

    def test_prelaunch_alias_uses_the_nfl_configuration(self):
        self.assertEqual(asdict(configuration('madden27_prelaunch')), asdict(configuration('nfl')))

    def test_existing_configs_keep_their_discovery_predictions(self):
        seasons = {s['id']: s for s in load_corpus() if s['id'] in ('ANG-s0', 'GFML-s0', 'M2LL-s0')}
        self.assertEqual(len(seasons), 3)
        expected = dict(nfl='5445541081ffa54c2c4ddc0877022089a3654bb1e8cb38d9207ac815da212a46',
                        plain5='6cf9228d08b3d12521512658190ea589792e9dbc5f3b81fe36a0e3d5fd53f0fb',
                        chain_seed_pair4='6526781dc89ca222dd819d6327adf05fd7a36ef71fb77a37dd78e5d085ad31df')
        for name, digest in expected.items():
            with self.subTest(config=name):
                rows = {identity: {c: r['seeds'] for c, r in seed(s, name).items()} for identity, s in seasons.items()}
                self.assertEqual(hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest(), digest)
