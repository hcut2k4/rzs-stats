from copy import deepcopy
from pathlib import Path
import tempfile
import unittest

from research.seeding.corpus import load_corpus, merge_season, validate_bracket_season
from research.seeding.engine import Config
from research.seeding.evaluate import evaluate, guard_fresh
from research.seeding.observe import groups
from research.seeding.tests.test_seeding import season_with_records


def snapshot_season():
    records = dict(A=14, B=12, C=12, D=11, E=10, F=10, G=10,
                   H=10, I=7, J=7, K=7, L=6, M=5, N=4, O=3, P=2)
    season = season_with_records(records)
    season.update(split='discovery', verified=True, snapshot_seeds={'AFC': list(records)})
    return season


class CorpusGroupsTests(unittest.TestCase):
    def test_fresh_is_excluded_by_default_and_opt_in_preserves_discovery(self):
        discovery = load_corpus()
        combined = load_corpus(include_fresh=True)
        self.assertTrue(all(s['split'] == 'discovery' for s in discovery))
        self.assertEqual({s['id'] for s in discovery}, {s['id'] for s in combined if s['split'] == 'discovery'})
        self.assertEqual(len(combined), len({s['id'] for s in combined}))
        self.assertTrue(all('old_split' in s and 'verified' in s for s in combined))

    def test_fresh_guard_precedes_evaluation_and_logs_authorized_access(self):
        with self.assertRaisesRegex(ValueError, '--final'):
            evaluate([], Config(), 'fresh')
        with tempfile.TemporaryDirectory() as directory:
            log = Path(directory) / 'access.txt'
            for split in ('discovery', 'train', 'dev', 'holdout', 'all'):
                guard_fresh(split, False, Config(), log)
            self.assertFalse(log.exists())
            with self.assertRaisesRegex(ValueError, '--final'):
                guard_fresh('fresh', False, Config(), log)
            guard_fresh('fresh', True, Config(), log)
            self.assertEqual(len(log.read_text().splitlines()), 1)

    def test_deduplication_merges_snapshot_labels_and_keeps_complete_bracket(self):
        original = snapshot_season()
        original.pop('snapshot_seeds')
        original['verified'] = False
        seasons = {original['id']: deepcopy(original)}
        snapshot = snapshot_season()
        snapshot['playoff_games'] = []
        merge_season(seasons, snapshot)
        self.assertEqual(len(seasons), 1)
        merged = seasons[original['id']]
        self.assertEqual(merged['playoff_games'], original['playoff_games'])
        self.assertTrue(merged['verified'])
        self.assertEqual(merged['snapshot_seeds'], snapshot['snapshot_seeds'])

    def test_snapshot_adds_non_playoff_groups_and_full_orders(self):
        observed = groups(snapshot_season())
        nonplayoff = [g for g in observed if g.context == 'NPORD']
        self.assertEqual([g.teams for g in nonplayoff], [tuple('IJK')])
        self.assertEqual(nonplayoff[0].full_order, tuple('IJK'))
        self.assertEqual(nonplayoff[0].sources, {'snapshot'})
        self.assertIsNone(nonplayoff[0].allowed_orders)
        for context, expected in (('WCQ', 'EFGH'), ('DSEED', 'BC'), ('WSEED', 'EFG')):
            group = next(g for g in observed if g.context == context)
            self.assertEqual(group.full_order, tuple(expected))
            self.assertEqual(group.sources, {'bracket', 'snapshot'})
            self.assertTrue(group.verified)

    def test_tie_groups_are_never_decomposed_into_pairs(self):
        observed = groups(snapshot_season())
        cut = [g for g in observed if g.context == 'WCQ']
        self.assertEqual(len(cut), 1)
        self.assertEqual(cut[0].teams, tuple('EFGH'))
        self.assertEqual(cut[0].size, 4)
        self.assertEqual(cut[0].k, 3)
        self.assertEqual(cut[0].qualifiers, frozenset('EFG'))
        self.assertEqual(cut[0].allowed_orders, (tuple('EFG'),))

    def test_snapshot_only_groups_do_not_claim_bracket_evidence(self):
        season = snapshot_season()
        season['playoff_games'] = []
        observed = groups(season)
        self.assertTrue(observed)
        self.assertTrue(all(g.sources == {'snapshot'} for g in observed))
        self.assertTrue(all(g.allowed_orders is None for g in observed))

    def test_two_team_division_tie_is_one_group_with_one_spot(self):
        season = season_with_records(dict(A=14, B=13, C=12, D=11, E=14, F=9, G=8))
        group = next(g for g in groups(season) if g.context == 'DIVT')
        self.assertEqual(group.teams, ('A', 'E'))
        self.assertEqual(group.k, 1)
        self.assertEqual(group.qualifiers, {'A'})
        self.assertEqual(group.sources, {'bracket'})
        self.assertFalse(group.verified)

    def test_incomplete_regular_schedule_is_quarantined(self):
        season = snapshot_season()
        season['games'].pop()
        self.assertIn('regular season requires 272 games and 17/team', validate_bracket_season(season))
