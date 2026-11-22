from collections import defaultdict
import json
from pathlib import Path
import unittest

from research.seeding.corpus import load_corpus, load_fixtures, normalize, RESOURCES, split_for
from research.seeding.facts import facts, common_record
from research.seeding.observe import candidates, observe


def game(week, home, away, hs=20, aws=10):
    return dict(weekIndex=week, home=home, away=away, homeScore=hs, awayScore=aws, status=2)


def season_with_records(records, divisions=None):
    teams = {t: dict(conf='AFC', div=(divisions or {}).get(t, t if t in 'ABCD' else 'A'), teamId=i) for i, t in enumerate(records)}
    games = []
    for t, wins in records.items():
        opponent = 'opponent-' + t
        teams[opponent] = dict(conf='NFC', div=opponent, teamId=len(teams))
        games.extend(game(i, t, opponent, 20 if i < wins else 0, 10) for i in range(17))
    return dict(id='TEST-s0', league='TEST', season=0, split='train', teams=teams, games=games,
                playoff_games=[game(18, 'B', 'G'), game(18, 'C', 'F'), game(18, 'D', 'E'),
                               game(19, 'A', 'D'), game(19, 'B', 'C'), game(20, 'A', 'B')], madden_seeds={'AFC': ['A', 'B', 'C', 'D', 'E', 'F', 'G']})


class ObservationTests(unittest.TestCase):
    def test_three_team_ties_remain_whole_groups(self):
        season = season_with_records(dict(A=14, B=13, C=12, D=11, E=10, F=10, G=10, H=10))
        decisions = observe(season)['decisions']
        wc = [d for d in decisions if d.category.startswith('WC')]
        self.assertEqual([d.category for d in wc], ['WC3P'])
        self.assertEqual(wc[0].group_size, 4)
        self.assertFalse(wc[0].strict)
        self.assertFalse(wc[0].pool_isolated)
        seed = [d for d in decisions if d.category == 'WSEED']
        self.assertEqual([d.group_size for d in seed], [3])

    def test_strict_and_pool_isolated_use_the_whole_conference(self):
        records = dict(A=14, B=13, C=12, D=11, E=10, F=9, G=8, H=8)
        season = season_with_records(records, dict(G='A', H='A'))
        wc = next(d for d in observe(season)['decisions'] if d.category == 'WC2')
        self.assertTrue(wc.strict)
        self.assertFalse(wc.pool_isolated)
        records['D'] = 8
        season = season_with_records(records, dict(G='A', H='A'))
        wc = next(d for d in observe(season)['decisions'] if d.category == 'WC2')
        self.assertFalse(wc.strict)
        self.assertTrue(wc.pool_isolated)

    def test_synthetic_bracket_preserves_all_consistent_seeds(self):
        season = season_with_records(dict(A=14, B=13, C=12, D=11, E=10, F=9, G=8))
        season['playoff_games'] = [game(18, 'B', 'G'), game(18, 'C', 'F'), game(18, 'D', 'E'),
                                   game(19, 'A', 'D'), game(19, 'B', 'C'), game(20, 'A', 'B')]
        orders = candidates(season, 'AFC')
        self.assertIn(tuple('ABCDEFG'), orders)
        self.assertEqual(len(orders), 1)
        season['playoff_games'] = season['playoff_games'][:3]
        self.assertEqual(len(candidates(season, 'AFC')), 6)
        self.assertIsNone(observe(season)['conferences']['AFC']['bye'])

    def test_inconsistent_fallback_is_quarantined(self):
        season = season_with_records(dict(A=14, B=13, C=12, D=11, E=10, F=9, G=8))
        season['playoff_games'] = [game(18, 'B', 'G'), game(18, 'C', 'F'), game(18, 'D', 'E')]
        season['madden_seeds']['AFC'][1:3] = ['C', 'B']
        result = observe(season)
        self.assertTrue(result['quarantine'])
        self.assertFalse(result['decisions'])

    def test_better_record_missing_the_field_is_quarantined(self):
        season = season_with_records(dict(A=14, B=13, C=12, D=11, E=10, F=9, G=8, H=9))
        result = observe(season)
        self.assertFalse(result['decisions'])
        self.assertTrue(any('better final record' in q['reason'] for q in result['quarantine']))

    def test_fallback_alone_does_not_establish_bracket_isolation(self):
        season = season_with_records(dict(A=14, B=13, C=12, D=11, E=10, F=9, G=8, H=8))
        season['playoff_games'] = []
        result = observe(season)
        decision = next(d for d in result['decisions'] if d.category == 'WC2')
        self.assertFalse(decision.strict)
        self.assertFalse(decision.pool_isolated)
        self.assertIsNone(result['conferences']['AFC']['candidates'])
        self.assertEqual(decision.outcome['label_source'], 'fallback')


class FactsTests(unittest.TestCase):
    def test_calendar_cutoff_changes_tiebreaks_but_preserves_final_pct(self):
        season = season_with_records(dict(A=14, B=13, C=12, D=11, E=10, F=9, G=8))
        season['games'] = [game(16, 'A', 'B'), game(17, 'B', 'A', 40, 0)]
        earlier, full = facts(season, 'thru_cal_wk17'), facts(season, 'thru_cal_wk18')
        a = full['index']['A']
        self.assertEqual(earlier['overall']['pct'][a], 1)
        self.assertEqual(full['overall']['pct'][a], .5)
        self.assertEqual(earlier['final']['pct'][a], full['final']['pct'][a])
        self.assertEqual(full['h2h_games'][a, full['index']['B']], 2)
        self.assertEqual(earlier['net_points'][a], 10)
        self.assertEqual(full['net_points'][a], -30)
        with self.assertRaises(KeyError):
            facts(season, 'wk17')

    def test_ties_and_opponent_strength_and_common_minimum(self):
        season = season_with_records(dict(A=14, B=13, C=12, D=11, E=10, F=9, G=8))
        tie = game(1, 'A', 'C', 10, 10)
        tie['status'] = 4
        season['games'] = [game(0, 'A', 'B'), tie, game(2, 'B', 'C')]
        data = facts(season)
        a = data['index']['A']
        self.assertEqual(data['final']['pct'][a], .75)
        self.assertEqual(data['final']['pct_tie_loss'][a], .5)
        self.assertEqual(data['sov']['pct'][a], .5)
        self.assertAlmostEqual(data['sos']['pct'][a], .375)
        self.assertEqual(common_record(data, ('A', 'B'))['opponents'], ('C',))
        self.assertFalse(common_record(data, ('A', 'B'), nfl=True)['eligible'])


class CorpusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.corpus = load_corpus()

    def test_league_splits_are_disjoint(self):
        leagues = defaultdict(set)
        for season in self.corpus:
            leagues[season['league']].add(season['split'])
            self.assertEqual(season['old_split'], split_for(season['league']))
        self.assertTrue(all(len(splits) == 1 for splits in leagues.values()))
        self.assertEqual({s['split'] for s in self.corpus}, {'discovery'})
        self.assertEqual({s['old_split'] for s in self.corpus}, {'train', 'dev', 'holdout'})

    def test_raw_games_keep_flags_and_drop_duplicates_and_unfinished_games(self):
        raw = dict(gameId=5, weekIndex=17, homeScore=7, awayScore=0, status=2,
                   simmed=True, home_fw=True, away_fw=False, concession=True,
                   homeTeam=dict(abbrName='A', conferenceName='AFC', divName='East', teamId=1),
                   awayTeam=dict(abbrName='B', conferenceName='AFC', divName='West', teamId=2))
        rows = [raw, raw.copy(), dict(raw, gameId=6, is_superseded=True), dict(raw, gameId=7, status=1)]
        item = normalize('TEST', 0, rows, 'inventory')
        self.assertEqual(len(item['games']), 1)
        self.assertTrue(item['games'][0]['home_fw'])
        self.assertTrue(item['games'][0]['concession'])
        self.assertTrue(item['games'][0]['simmed'])
        self.assertEqual(item['teams']['A']['teamId'], 1)
        with self.assertRaises(ValueError):
            normalize('TEST', 0, [raw, dict(raw, homeScore=8)], 'inventory')

    def test_rzs_games_match_the_existing_fixtures(self):
        fixtures = {s['id']: s for s in load_fixtures()}
        raw_path = RESOURCES / 'neon/RZS-data.json'
        for index in (0, 1):
            actual = next(s for s in self.corpus if s['id'] == f'RZS-s{index}')
            regular = sorted((g['weekIndex'], g['home'], g['away'], g['homeScore'], g['awayScore']) for g in actual['games'])
            if raw_path.exists():
                rows = json.loads(raw_path.read_text())['seasons'][str(index)]
                rows = [g for g in rows if g['stage'] == 1 and g['status'] >= 2 and not g.get('is_superseded')]
                expected = sorted((g['week'], g['home']['abbrName'], g['away']['abbrName'], g['homeScore'], g['awayScore']) for g in rows if g['week'] <= 17)
                playoff = sorted((g['week'], g['home']['abbrName'], g['away']['abbrName']) for g in rows if g['week'] >= 18)
            else:
                expected = sorted((g['weekIndex'], g['home'], g['away'], g['homeScore'], g['awayScore']) for g in fixtures[f'RZS-{2026+index}']['games'])
                playoff = None
            self.assertEqual(regular, expected)
            if playoff is not None:
                self.assertEqual(sorted((g['weekIndex'], g['home'], g['away']) for g in actual['playoff_games']), playoff)
            else:
                self.assertEqual(len(actual['playoff_games']), 13)
                for conference, labels in fixtures[f'RZS-{2026+index}']['madden_seeds'].items():
                    self.assertIn(tuple(labels[0]), candidates(actual, conference))

    def test_screenshot_seeds_satisfy_the_available_brackets(self):
        checked = 0
        by_id = {s['id']: s for s in self.corpus}
        for fixture in load_fixtures():
            raw_id = fixture['id']
            league, _, year = raw_id.rpartition('-')
            if not year.isdigit():
                continue
            season = by_id.get(f'{league}-s{int(year)-2026}')
            if season is None:
                continue
            for conference, labels in fixture['madden_seeds'].items():
                orders = candidates(season, conference)
                for label in labels:
                    self.assertIn(tuple(label), orders, (raw_id, conference))
                checked += 1
        self.assertGreaterEqual(checked, 4)
        sim = next(s for s in load_fixtures() if s['id'] == 'SIMFULL')
        self.assertEqual(sim['madden_seeds']['AFC'], [['DEN', 'NE', 'IND', 'PIT', 'LAC', 'BUF', 'LV']])


if __name__ == '__main__':
    unittest.main()
