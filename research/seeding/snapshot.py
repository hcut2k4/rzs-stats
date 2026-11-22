import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys
import tempfile
from urllib.parse import quote, urljoin

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE.parents[1] / 'backend/src/test/resources/playoffs/neon'))
from inventory import BASE, Client

OUTPUT = HERE / 'data/snapshots'
RECORD_FIELDS = tuple(prefix + outcome for prefix in ('total', 'conf', 'div')
                      for outcome in ('Wins', 'Losses', 'Ties'))
TEAM_FIELDS = ('teamId', 'abbrName', 'conferenceName', 'divName', 'divisionName')
STANDING_FIELDS = TEAM_FIELDS + ('seed', 'playoffStatus', 'rank') + RECORD_FIELDS + (
    'ptsFor', 'ptsAgainst', 'netPts', 'seasonIndex', 'weekIndex', 'stageIndex')
GAME_FIELDS = ('pk', 'gameId', 'weekIndex', 'stageIndex', 'seasonIndex', 'status',
               'homeScore', 'awayScore', 'simmed', 'home_fw', 'away_fw',
               'concession', 'is_superseded')


class SnapshotClient(Client):
    def __init__(self, cache, temporary):
        super().__init__(temporary, refresh=True)
        self.inventory_cache = cache

    def get(self, url, fresh=False):
        if not fresh:
            path = self.inventory_cache / (hashlib.sha256(url.encode()).hexdigest() + '.json')
            try:
                return json.loads(path.read_text())
            except (OSError, ValueError):
                pass
        return super().get(url, fresh=fresh)


def slim(row, fields):
    return {key: row[key] for key in fields if key in row}


def division(team):
    return team.get('divName') or team.get('divisionName')


def validate(snapshot):
    reasons = []
    try:
        detail, standings = snapshot['league'], snapshot['standings']
        season = int(detail['season'])
        teams = {t['teamId']: t for t in standings}
        if len(standings) != 32 or len(teams) != 32:
            reasons.append(f'team count: {len(standings)} rows, {len(teams)} unique; expected 32')
        for team in standings:
            if not team.get('abbrName') or not team.get('conferenceName') or not division(team):
                reasons.append(f"missing team metadata: {team['teamId']}")
            if int(team['seasonIndex']) != season or int(team['stageIndex']) != 1:
                reasons.append(f"standings season/stage differs: {team['abbrName']}")
        rebuilt = {identity: Counter() for identity in teams}
        wildcard = []
        seen = set()
        for game in snapshot['games']:
            if game.get('is_superseded'):
                continue
            if int(game['seasonIndex']) != season or int(game['stageIndex']) != 1:
                reasons.append(f"game season/stage differs: {game.get('pk')}")
                continue
            week = int(game['weekIndex'])
            if not (0 <= week <= 18):
                continue
            if week < 18 and int(game['status']) < 2:
                continue
            identity = game['gameId']
            if identity in seen:
                reasons.append(f'duplicate gameId: {identity}')
                continue
            seen.add(identity)
            home, away = game['homeTeam'], game['awayTeam']
            for side in (home, away):
                team = teams[side['teamId']]
                if (side['conferenceName'], division(side)) != (team['conferenceName'], division(team)):
                    reasons.append(f"game team metadata differs: {side['teamId']}")
            if home['teamId'] == away['teamId']:
                reasons.append(f'team plays itself: {identity}')
            if week == 18:
                wildcard.append(game)
                continue
            home_score, away_score = game['homeScore'], game['awayScore']
            if home_score is None or away_score is None:
                reasons.append(f'missing completed score: {identity}')
                continue
            outcomes = ('Ties', 'Ties') if home_score == away_score else (
                ('Wins', 'Losses') if home_score > away_score else ('Losses', 'Wins'))
            for team, outcome in zip((home, away), outcomes):
                record = rebuilt[team['teamId']]
                record['total' + outcome] += 1
                if home['conferenceName'] == away['conferenceName']:
                    record['conf' + outcome] += 1
                    if division(home) == division(away):
                        record['div' + outcome] += 1
        for identity, team in teams.items():
            for field in RECORD_FIELDS:
                if rebuilt[identity][field] != int(team[field]):
                    reasons.append(f"{team['abbrName']} {field}: rebuilt {rebuilt[identity][field]} != standings {team[field]}")
        if int(detail['week']) >= 18:
            conferences = {team['conferenceName'] for team in standings}
            if len(conferences) != 2:
                reasons.append(f'conference count {len(conferences)} != 2')
            if len(wildcard) != 6:
                reasons.append(f'wild-card game count {len(wildcard)} != 6')
            for conference in sorted(conferences):
                members = [t for t in standings if t['conferenceName'] == conference]
                seeded = [t for t in members if 1 <= int(t['seed']) <= 7]
                if Counter(int(t['seed']) for t in seeded) != Counter(range(1, 8)):
                    reasons.append(f'{conference}: seeds 1..7 must each occur once')
                    continue
                pairs, participants = [], []
                for game in wildcard:
                    home, away = (teams[game[side]['teamId']] for side in ('homeTeam', 'awayTeam'))
                    if home['conferenceName'] != conference:
                        continue
                    if away['conferenceName'] != conference:
                        reasons.append(f'{conference}: cross-conference wild-card game')
                    pairs.append((int(home['seed']), int(away['seed'])))
                    participants.extend((home['teamId'], away['teamId']))
                if Counter(pairs) != Counter(((2, 7), (3, 6), (4, 5))):
                    reasons.append(f'{conference}: wild-card home/away seeds {pairs} != 2v7,3v6,4v5')
                absent = {t['teamId'] for t in seeded} - set(participants)
                bye = {t['teamId'] for t in seeded if int(t['seed']) == 1}
                if len(participants) != len(set(participants)) or absent != bye:
                    reasons.append(f'{conference}: wild-card participants/seed-1 bye differ')
    except (KeyError, TypeError, ValueError) as error:
        reasons.append(f'invalid or missing data: {error}')
    return reasons


def standings_rows(client, url):
    rows, seen = [], set()
    while url:
        if url in seen:
            raise ValueError(f'standings pagination cycle: {url}')
        seen.add(url)
        data = client.get(url, fresh=True)
        if isinstance(data, list):
            rows.extend(data)
            break
        rows.extend(data['results'])
        url = urljoin(url, data['next']) if data.get('next') else None
    return rows


def capture(client, abbreviation, force, output=OUTPUT, excluded=frozenset()):
    filename = abbreviation
    try:
        url = BASE + quote(abbreviation, safe='') + '/'
        detail = client.get(url, fresh=True)
        if int(detail['stage']) != 1 or not 18 <= int(detail['week']) <= 22:
            return None, {'status': 'skipped', 'reasons': ['not currently in playoff weeks']}
        if (abbreviation, int(detail['season'])) in excluded:
            return None, {'status': 'skipped', 'reasons': ['season already captured']}
        filename = f"{quote(abbreviation, safe='')}-s{int(detail['season'])}-w{int(detail['week'])}.json"
        path = output / filename
        if path.exists() and not force:
            snapshot = json.loads(path.read_text())
        else:
            snapshot = {
                'captured_at': datetime.now(timezone.utc).isoformat(),
                'league': slim(detail, ('abbrev', 'name', 'season', 'stage', 'week', 'calendar_year')),
                'standings': [slim(t, STANDING_FIELDS) for t in standings_rows(client, url + 'standings/')],
                'games': [],
            }
            games = client.pages(url + f"games/?seasonIndex={detail['season']}&stageIndex=1&size=100", fresh=True)
            for game in games:
                row = slim(game, GAME_FIELDS)
                for side in ('homeTeam', 'awayTeam'):
                    row[side] = slim(game[side], TEAM_FIELDS)
                snapshot['games'].append(row)
            temporary = path.with_suffix('.tmp')
            temporary.write_text(json.dumps(snapshot, indent=2) + '\n')
            temporary.replace(path)
        reasons = validate(snapshot)
        return filename, {'status': 'quarantined' if reasons else 'accepted', 'reasons': reasons}
    except (OSError, RuntimeError, KeyError, TypeError, ValueError) as error:
        return filename, {'status': 'quarantined', 'reasons': [str(error)]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', type=Path, default=Path('~/.cache/rzs-neon-inventory'))
    parser.add_argument('--out', type=Path, default=OUTPUT)
    parser.add_argument('--only')
    parser.add_argument('--limit', type=int)
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    if args.workers < 1 or (args.limit is not None and args.limit < 1):
        parser.error('workers and limit must be positive')
    abbreviations = None
    if args.only is not None:
        abbreviations = list(dict.fromkeys(a.strip().upper() for a in args.only.split(',') if a.strip()))
        if not abbreviations or any(not re.fullmatch(r'[A-Z0-9_-]+', a) for a in abbreviations):
            parser.error('invalid abbreviation')
    args.out.mkdir(parents=True, exist_ok=True)
    excluded = set()
    if args.out.resolve() != OUTPUT.resolve():
        for path in OUTPUT.glob('*.json'):
            if path.name != '_index.json':
                raw = json.loads(path.read_text())
                excluded.add((raw['league']['abbrev'], int(raw['league']['season'])))
    index_path = args.out / '_index.json'
    index = json.loads(index_path.read_text()) if index_path.exists() else {}
    failed = False
    with tempfile.TemporaryDirectory(prefix='.http-', dir=HERE) as cache:
        client = SnapshotClient(args.cache.expanduser(), Path(cache))
        try:
            if abbreviations is None:
                directory = client.pages(BASE + '?page=1&size=100', fresh=True)
                abbreviations = list(dict.fromkeys(league['abbrev'] for league in directory))
            if args.limit:
                abbreviations = abbreviations[:args.limit]
            with ThreadPoolExecutor(max_workers=args.workers) as pool:
                results = pool.map(lambda a: capture(client, a, args.force, args.out, excluded), abbreviations)
                for count, (abbreviation, (filename, result)) in enumerate(zip(abbreviations, results), 1):
                    if filename:
                        index[filename] = result
                        temporary = index_path.with_suffix('.tmp')
                        temporary.write_text(json.dumps(index, indent=2, sort_keys=True) + '\n')
                        temporary.replace(index_path)
                        print(f"{abbreviation}: {result['status']}", flush=True)
                        for reason in result['reasons']:
                            print(f'{abbreviation}: {reason}', file=sys.stderr)
                        failed |= result['status'] == 'quarantined'
                    if count % 25 == 0:
                        print(f'Inspected {count}/{len(abbreviations)} leagues', file=sys.stderr, flush=True)
        except (OSError, RuntimeError, KeyError, TypeError, ValueError) as error:
            print(str(error), file=sys.stderr)
            return 1
    return int(failed)


if __name__ == '__main__':
    sys.exit(main())
