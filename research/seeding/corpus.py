import argparse
from collections import Counter
import csv
import hashlib
import json
import pickle
from pathlib import Path
import sys
from urllib.parse import quote, urljoin

HERE = Path(__file__).resolve().parent
RESOURCES = HERE.parents[1] / 'backend/src/test/resources/playoffs'
NEON = RESOURCES / 'neon'
CACHE = Path('~/.cache/rzs-neon-inventory').expanduser()
sys.path.insert(0, str(NEON))
from inventory import Client


def split_for(league):
    bucket = int(hashlib.sha256(league.encode()).hexdigest(), 16) % 100
    return 'train' if bucket < 60 else 'dev' if bucket < 80 else 'holdout'


def normalize(league, season, rows, source):
    teams, unique = {}, {}
    for row in rows:
        if row.get('is_superseded') or int(row['status']) < 2:
            continue
        game = {key: row.get(key) for key in ('gameId', 'status', 'simmed', 'home_fw', 'away_fw', 'concession', 'is_superseded')}
        game.update(weekIndex=int(row['weekIndex']), homeScore=row['homeScore'], awayScore=row['awayScore'])
        for side in ('home', 'away'):
            team = row[side + 'Team']
            game[side] = team['abbrName']
            teams[team['abbrName']] = dict(conf=team['conferenceName'], div=team.get('divName') or team['divisionName'], teamId=team['teamId'])
        identity = game['gameId']
        if identity is None:
            raise ValueError('missing gameId')
        if identity in unique and unique[identity] != game:
            raise ValueError(f'conflicting gameId {identity}')
        unique[identity] = game
    games = sorted(unique.values(), key=lambda g: (g['weekIndex'], str(g['gameId'])))
    return dict(id=f'{league}-s{season}', league=league, season=season, teams=teams,
                games=[g for g in games if 0 <= g['weekIndex'] <= 17],
                playoff_games=[g for g in games if g['weekIndex'] >= 18],
                source=source, old_split=split_for(league), split='discovery', verified=False)


def load_corpus(include_fresh=False):
    inventory = NEON / 'inventory/inventory.csv'
    snapshots = HERE / 'data/snapshots'
    index_path = snapshots / '_index.json'
    index = json.loads(index_path.read_text()) if index_path.exists() else {}
    accepted = [snapshots / name for name, entry in sorted(index.items()) if entry['status'] == 'accepted']
    fresh = HERE / 'data/fresh'
    fresh_index = fresh / 'snapshots/_index.json'
    fresh_files = []
    if include_fresh:
        if fresh_index.exists():
            entries = json.loads(fresh_index.read_text())
            accepted.extend(fresh / 'snapshots' / name for name, entry in sorted(entries.items()) if entry['status'] == 'accepted')
        fresh_files = sorted((fresh / 'seasons').glob('*.json'))
    client = Client(CACHE)
    requests, inputs = [], [Path(__file__), HERE / 'snapshot.py', inventory, *accepted, *fresh_files]
    if include_fresh:
        inputs.append(fresh_index)
    if index_path.exists():
        inputs.append(index_path)
    with inventory.open() as stream:
        for row in csv.DictReader(stream):
            for year, complete in json.loads(row['complete_285_by_year']).items():
                if complete:
                    season = int(year) - 2026
                    url = f'https://neonsportz.com/api/leagues/{quote(row["abbrev"], safe="")}/games/?seasonIndex={season}&stageIndex=1&completed=true&size=100'
                    requests.append((row['abbrev'], season, url))
                    # Include every cached pagination response in the fingerprint.
                    while url:
                        path = CACHE / (hashlib.sha256(url.encode()).hexdigest() + '.json')
                        inputs.append(path)
                        if not path.exists():
                            break
                        data = json.loads(path.read_text())
                        url = urljoin(url, data['next']) if data.get('next') else None
    fingerprint = hashlib.sha256()
    for path in inputs:
        fingerprint.update(str(path).encode())
        fingerprint.update(path.read_bytes() if path.exists() else b'missing')
    key = fingerprint.hexdigest()
    target = HERE / ('data/corpus-fresh.pkl' if include_fresh else 'data/corpus.pkl')
    if target.exists():
        with target.open('rb') as stream:
            cached = pickle.load(stream)
        if cached['key'] == key:
            return cached['seasons']
    seasons = {}
    for league, season, url in requests:
        item = normalize(league, season, client.pages(url), 'inventory')
        seasons[item['id']] = item
    for path in fresh_files:
        merge_season(seasons, json.loads(path.read_text()))
    for path in accepted:
        raw = json.loads(path.read_text())
        try:
            from .snapshot import validate
        except ImportError:
            from snapshot import validate
        if validate(raw):
            continue
        item = normalize(raw['league']['abbrev'], int(raw['league']['season']), raw['games'], 'snapshot')
        if len(item['games']) != 272:
            continue
        item['madden_seeds'] = {}
        for conference in sorted({t['conferenceName'] for t in raw['standings']}):
            labeled = {int(t['seed']): t['abbrName'] for t in raw['standings']
                       if t['conferenceName'] == conference and 1 <= int(t['seed']) <= 7}
            if set(labeled) != set(range(1, 8)):
                raise ValueError(f'{path}: invalid fallback seeds')
            item['madden_seeds'][conference] = [labeled[i] for i in range(1, 8)]
        item['snapshot_seeds'] = {}
        for conference in item['madden_seeds']:
            labeled = {int(t['seed']): t['abbrName'] for t in raw['standings'] if t['conferenceName'] == conference}
            if set(labeled) != set(range(1, 17)):
                raise ValueError(f'{path}: invalid full snapshot seeds')
            item['snapshot_seeds'][conference] = [labeled[i] for i in range(1, 17)]
        item['verified'] = True
        if fresh in path.parents:
            item['split'] = 'fresh'
        merge_season(seasons, item)
    result = sorted(seasons.values(), key=lambda s: s['id'])
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix('.tmp')
    with temporary.open('wb') as stream:
        pickle.dump(dict(key=key, seasons=result), stream)
    temporary.replace(target)
    return result


def load_fixtures():
    entries = json.loads((RESOURCES / 'analysis/dataset.json').read_text())
    sim = json.loads((RESOURCES / 'sim-full-season.json').read_text())
    rzs = json.loads((RESOURCES / 'rzs-seasons.json').read_text())
    overrides = {'SIMFULL': sim, 'RZS-2026': rzs['103'], 'RZS-2027': rzs['104']}
    result = []
    for raw in entries:
        league, _, year = raw['id'].rpartition('-')
        league = league or raw['id']
        item = dict(id=raw['id'], league=league, season=int(year)-2026 if year.isdigit() else 0,
                    source='fixture', split='discovery', old_split=split_for(league), verified=False,
                    teams={t: dict(conf=v['conf'], div=v['div'], teamId=v.get('id')) for t, v in raw['teams'].items()},
                    games=[], playoff_games=[], madden_seeds=raw['seeds'])
        for i, (week, home, away, hs, aws) in enumerate(raw['games']):
            game = dict(gameId=i, weekIndex=week, home=home, away=away, homeScore=hs, awayScore=aws, status=4 if hs == aws else 2)
            item['games' if week <= 17 else 'playoff_games'].append(game)
        if raw['id'] in overrides:
            item['madden_seeds'] = {c: [seeds] for c, seeds in overrides[raw['id']]['maddenSeeds'].items()}
        result.append(item)
    return result


def merge_season(seasons, item):
    previous = seasons.get(item['id'])
    if previous is None:
        seasons[item['id']] = item
        return
    for key in ('madden_seeds', 'snapshot_seeds'):
        if key in item:
            previous.setdefault(key, {}).update(item[key])
    previous['verified'] = previous.get('verified', False) or item.get('verified', False)
    if item.get('snapshot_seeds'):
        previous['source'] = 'snapshot'
    if previous['split'] != 'discovery':
        previous['split'] = item['split']


def validate_bracket_season(item):
    try:
        from .observe import candidates
    except ImportError:
        from observe import candidates
    reasons = []
    appearances = Counter(t for g in item['games'] for t in (g['home'], g['away']))
    if len(item['teams']) != 32:
        reasons.append('expected 32 teams')
    if len(item['games']) != 272 or any(appearances[t] != 17 for t in item['teams']):
        reasons.append('regular season requires 272 games and 17/team')
    conferences = {t['conf'] for t in item['teams'].values()}
    if len(conferences) != 2 or any(sum(t['conf'] == c for t in item['teams'].values()) != 16 for c in conferences):
        reasons.append('expected two conferences of 16 teams')
    for game in item['games'] + item['playoff_games']:
        if game['home'] == game['away'] or game['homeScore'] is None or game['awayScore'] is None:
            reasons.append('invalid completed game')
    if reasons:
        return sorted(set(reasons))
    for conf in sorted(conferences):
        wildcard = [g for g in item['playoff_games'] if g['weekIndex'] == 18 and item['teams'][g['home']]['conf'] == conf]
        if len(wildcard) != 3 or any(item['teams'][g['away']]['conf'] != conf for g in wildcard):
            reasons.append(f'{conf}: expected three within-conference wild-card games')
        elif not candidates(item, conf):
            reasons.append(f'{conf}: no seed assignment satisfies bracket')
    return reasons


def capture_fresh():
    import tempfile
    try:
        from .snapshot import SnapshotClient
    except ImportError:
        from snapshot import SnapshotClient
    output = HERE / 'data/fresh'
    (output / 'seasons').mkdir(parents=True, exist_ok=True)
    excluded = {(s['league'], s['season']) for s in load_corpus()}
    for directory in (HERE / 'data/snapshots', output / 'snapshots'):
        for path in directory.glob('*.json'):
            if path.name != '_index.json':
                raw = json.loads(path.read_text())
                excluded.add((raw['league']['abbrev'], int(raw['league']['season'])))
    index_path = output / '_index.json'
    index = json.loads(index_path.read_text()) if index_path.exists() else {}
    with tempfile.TemporaryDirectory(prefix='rzs-fresh-') as temporary:
        client = SnapshotClient(CACHE, Path(temporary))
        with (NEON / 'inventory/inventory.csv').open() as stream:
            for row in csv.DictReader(stream):
                for year, detail in json.loads(row['seasons']).items():
                    season = int(year) - 2026
                    if (detail.get('complete_285') or detail.get('regular') != 272 or
                            (detail.get('postseason') or 0) < 6 or (row['abbrev'], season) in excluded):
                        continue
                    identity = f"{row['abbrev']}-s{season}"
                    if identity in index:
                        continue
                    url = f'https://neonsportz.com/api/leagues/{quote(row["abbrev"], safe="")}/games/?seasonIndex={season}&stageIndex=1&completed=true&size=100'
                    try:
                        rows = client.pages(url)
                        if any(int(g['seasonIndex']) != season or int(g['stageIndex']) != 1 for g in rows):
                            raise ValueError('game season/stage differs')
                        item = normalize(row['abbrev'], season, rows, 'inventory')
                        reasons = validate_bracket_season(item)
                        if not reasons:
                            item['split'] = 'fresh'
                            (output / 'seasons' / f'{quote(identity, safe="")}.json').write_text(json.dumps(item, sort_keys=True) + '\n')
                    except (OSError, RuntimeError, KeyError, TypeError, ValueError) as error:
                        reasons = [str(error)]
                    index[identity] = dict(status='quarantined' if reasons else 'accepted', reasons=reasons)
                    index_path.write_text(json.dumps(index, indent=2, sort_keys=True) + '\n')
    print(f'Fresh bracket seasons: {dict(Counter(v["status"] for v in index.values()))}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--capture-fresh', action='store_true', required=True)
    parser.parse_args()
    capture_fresh()
