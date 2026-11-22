import csv
from collections import defaultdict
from pathlib import Path
import unittest

from research.seeding.engine import seed

RESOURCES = Path(__file__).resolve().parents[3] / 'backend/src/test/resources/nfl'


def nfl_seasons():
    seasons = {}
    expected = defaultdict(lambda: defaultdict(dict))
    with (RESOURCES / 'standings.csv').open() as stream:
        for row in csv.DictReader(stream):
            year = int(row['season'])
            season = seasons.setdefault(year, dict(id=str(year), teams={}, games=[]))
            season['teams'][row['team']] = dict(conf=row['conf'], div=row['division'], teamId=len(season['teams']))
            if row['seed']:
                expected[year][row['conf']][int(row['seed'])] = row['team']
    with (RESOURCES / 'games.csv').open() as stream:
        for row in csv.DictReader(stream):
            seasons[int(row['season'])]['games'].append(dict(weekIndex=int(row['week'])-1,
                home=row['home'], away=row['away'], homeScore=int(row['home_score']), awayScore=int(row['away_score'])))
    return seasons, expected


class NflParityTests(unittest.TestCase):
    def test_every_real_playoff_seed_from_2002_through_2025(self):
        seasons, expected = nfl_seasons()
        self.assertEqual(sorted(seasons), list(range(2002, 2026)))
        checked = 0
        for year, season in seasons.items():
            count = 6 if year < 2020 else 7
            result = seed(season, dict(playoff_field_size=count))
            self.assertEqual(set(result), {'AFC', 'NFC'})
            for conf in ('AFC', 'NFC'):
                with self.subTest(season=year, conference=conf):
                    self.assertEqual(set(expected[year][conf]), set(range(1, count+1)))
                    self.assertEqual(result[conf]['seeds'], [expected[year][conf][i] for i in range(1, count+1)], f'{year} {conf}')
                    checked += 1
        print(f'NFL parity: {checked}/48 conference-seasons identical (2002–2025)')
