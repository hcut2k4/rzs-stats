from copy import deepcopy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from snapshot import RECORD_FIELDS, validate


def fixture():
    teams, games = [], []
    for conference in ('AFC', 'NFC'):
        members = []
        for seed in range(1, 17):
            team = dict.fromkeys(RECORD_FIELDS, 0)
            team.update(teamId=f'{conference}{seed}', abbrName=f'{conference}{seed}',
                        conferenceName=conference, divName=f'{conference}{(seed - 1) // 4}',
                        seed=seed, seasonIndex=0, stageIndex=1, weekIndex=18)
            members.append(team)
        teams.extend(members)
        for i in range(0, 16, 2):
            home, away = members[i:i + 2]
            tie = i == 0
            for prefix in ('total', 'conf', 'div'):
                home[prefix + ('Ties' if tie else 'Wins')] = 1
                away[prefix + ('Ties' if tie else 'Losses')] = 1
            games.append(dict(gameId=len(games), seasonIndex=0, stageIndex=1, weekIndex=0,
                              status=4 if tie else 2, homeScore=7, awayScore=7 if tie else 0,
                              homeTeam=home, awayTeam=away))
        for home_seed, away_seed in ((2, 7), (3, 6), (4, 5)):
            games.append(dict(gameId=len(games), seasonIndex=0, stageIndex=1, weekIndex=18,
                              status=1, homeScore=None, awayScore=None,
                              homeTeam=members[home_seed - 1], awayTeam=members[away_seed - 1]))
    return {'league': {'season': 0, 'stage': 1, 'week': 18}, 'standings': teams, 'games': games}


class SnapshotValidationTest(unittest.TestCase):
    def test_matching_records_and_wildcard_pairings_pass(self):
        self.assertEqual(validate(fixture()), [])

    def test_rebuilt_records_mismatch_is_quarantined(self):
        snapshot = fixture()
        snapshot['standings'][0]['totalWins'] += 1
        self.assertIn('AFC1 totalWins: rebuilt 0 != standings 1', validate(snapshot))

    def test_cross_conference_games_only_count_toward_overall_records(self):
        snapshot = fixture()
        first, second = snapshot['games'][1], snapshot['games'][12]
        first['awayTeam'], second['awayTeam'] = second['awayTeam'], first['awayTeam']
        for game in (first, second):
            game['homeTeam']['confWins'] = game['homeTeam']['divWins'] = 0
            game['awayTeam']['confLosses'] = game['awayTeam']['divLosses'] = 0
        self.assertEqual(validate(snapshot), [])

    def test_cross_division_games_only_count_toward_overall_and_conference_records(self):
        snapshot = fixture()
        first, second = snapshot['games'][1], snapshot['games'][2]
        first['awayTeam'], second['awayTeam'] = second['awayTeam'], first['awayTeam']
        for game in (first, second):
            game['homeTeam']['divWins'] = 0
            game['awayTeam']['divLosses'] = 0
        self.assertEqual(validate(snapshot), [])

    def test_superseded_and_incomplete_games_do_not_change_records(self):
        snapshot = fixture()
        for changes in ({'is_superseded': True}, {'status': 1}):
            game = deepcopy(snapshot['games'][0])
            game.update(changes)
            snapshot['games'].append(game)
        self.assertEqual(validate(snapshot), [])

    def test_reversed_home_seed_is_quarantined(self):
        snapshot = fixture()
        game = snapshot['games'][8]
        game['homeTeam'], game['awayTeam'] = game['awayTeam'], game['homeTeam']
        self.assertTrue(any('wild-card home/away seeds' in r for r in validate(snapshot)))

    def test_seed_one_playing_wildcard_is_quarantined(self):
        snapshot = fixture()
        snapshot['games'][8]['homeTeam'] = snapshot['standings'][0]
        self.assertTrue(any('seed-1 bye differ' in r for r in validate(snapshot)))


if __name__ == '__main__':
    unittest.main()
