import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import csv
from email.utils import parsedate_to_datetime
import hashlib
import json
from pathlib import Path
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = 'https://neonsportz.com/api/leagues/'
HERE = Path(__file__).resolve().parent


class Client:
    def __init__(self, cache, refresh=False):
        self.cache = cache
        cache.mkdir(parents=True, exist_ok=True)
        self.refresh = refresh
        self.local = threading.local()
        self.failures = []
        self.lock = threading.Lock()

    def get(self, url, fresh=False):
        path = self.cache / (hashlib.sha256(url.encode()).hexdigest() + '.json')
        if path.exists() and not (fresh and self.refresh):
            try:
                return json.loads(path.read_text())
            except (ValueError, OSError):
                pass
        for attempt in range(4):
            delay = max(0, getattr(self.local, 'next_request', 0) - time.monotonic())
            time.sleep(delay)
            retry_after = 0
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=60) as response:
                    data = json.load(response)
                temporary = path.with_suffix(f'.{threading.get_ident()}.tmp')
                temporary.write_text(json.dumps(data))
                temporary.replace(path)
                return data
            except (OSError, ValueError) as error:
                message = str(error)
                if isinstance(error, urllib.error.HTTPError) and error.code == 429:
                    value = error.headers.get('Retry-After', '0')
                    try:
                        retry_after = float(value)
                    except ValueError:
                        try:
                            retry_after = parsedate_to_datetime(value).timestamp() - time.time()
                        except (ValueError, TypeError, OverflowError):
                            pass
                if attempt < 3:
                    time.sleep(max(2 ** attempt, retry_after))
            finally:
                self.local.next_request = time.monotonic() + 0.2
        with self.lock:
            self.failures.append({'url': url, 'error': message})
        raise RuntimeError(f'{url}: {message}')

    def pages(self, url, fresh=False):
        rows = []
        seen = set()
        expected = None
        while url:
            if url in seen:
                raise ValueError(f'pagination cycle: {url}')
            seen.add(url)
            data = self.get(url, fresh)
            if expected is None:
                expected = int(data['count'])
            elif int(data['count']) != expected:
                raise ValueError(f'count changed while paging: {url}')
            rows.extend(data['results'])
            url = urllib.parse.urljoin(url, data['next']) if data.get('next') else None
        if len(rows) != expected:
            raise ValueError(f'pagination collected {len(rows)} != count {expected}')
        return rows


def schedule(games):
    concerns = []
    unique = {}
    for game in games:
        if game.get('is_superseded') or int(game['status']) < 2:
            continue
        identity = game.get('gameId')
        if identity is None:
            raise ValueError('missing gameId')
        if identity in unique:
            concerns.append('duplicate gameId')
            previous = unique[identity]
            if (any(previous[k] != game[k] for k in ('weekIndex', 'homeScore', 'awayScore', 'status'))
                    or any(previous[k]['abbrName'] != game[k]['abbrName'] for k in ('homeTeam', 'awayTeam'))):
                raise ValueError(f'conflicting gameId {identity}')
            continue
        unique[identity] = game
    games = list(unique.values())
    teams = {}
    appearances = Counter()
    weeks = Counter()
    ties = 0
    for game in games:
        week = int(game['weekIndex'])
        weeks[week] += 1
        for side in ('homeTeam', 'awayTeam'):
            team = game[side]
            abbr = team['abbrName']
            if not abbr or not team.get('conferenceName') or not team.get('divName'):
                raise ValueError('missing team metadata')
            teams[abbr] = team
            if 0 <= week <= 17:
                appearances[abbr] += 1
        if game['homeTeam']['abbrName'] == game['awayTeam']['abbrName']:
            raise ValueError('team plays itself')
        if game['homeScore'] is None or game['awayScore'] is None:
            raise ValueError('missing completed score')
        if game['status'] == 4 or game['homeScore'] == game['awayScore']:
            ties += 1
    regular = sum(weeks[w] for w in range(18))
    postseason = sum(weeks[w] for w in range(18, 23))
    valid = len(games) == 285
    if len(teams) != 32:
        concerns.append(f'team count {len(teams)} != 32')
        valid = False
    if regular != 272 or any(appearances[t] != 17 for t in teams):
        concerns.append('regular season requires 272 games and 17/team')
        valid = False
    if any(weeks[w] != n for w, n in {18: 6, 19: 4, 20: 2, 21: 0, 22: 1}.items()):
        concerns.append('postseason rounds differ from 6/4/2/0/1')
        valid = False
    if any(w < 0 or w > 22 for w in weeks) or any(not weeks[w] for w in range(18)):
        concerns.append('extra/missing weeks')
        valid = False
    previous_winners = None
    wildcard_teams = set()
    for week in (18, 19, 20, 22):
        participants = []
        winners = set()
        conferences = Counter()
        for game in games:
            if game['weekIndex'] != week:
                continue
            home, away = game['homeTeam'], game['awayTeam']
            participants.extend((home['abbrName'], away['abbrName']))
            conferences[home['conferenceName']] += 1
            if (home['conferenceName'] == away['conferenceName']) != (week != 22):
                valid = False
                concerns.append('invalid playoff conference pairing')
            if game['status'] == 4 or game['homeScore'] == game['awayScore']:
                valid = False
                concerns.append('postseason tie')
            winners.add((home if game['homeScore'] > game['awayScore'] else away)['abbrName'])
        current = set(participants)
        if len(current) != len(participants):
            valid = False
            concerns.append('team appears twice in playoff round')
        if week == 18:
            wildcard_teams = current
        elif week == 19:
            byes = current - wildcard_teams
            if not previous_winners <= current or len(byes) != 2 or len({teams[t]['conferenceName'] for t in byes}) != 2:
                valid = False
                concerns.append('wild-card winners/byes inconsistent')
        elif current != previous_winners:
            valid = False
            concerns.append('playoff winners do not advance')
        if week != 22 and sorted(conferences.values()) != [3 if week == 18 else 2 if week == 19 else 1] * 2:
            valid = False
            concerns.append('invalid playoff conference counts')
        previous_winners = winners
    if ties:
        concerns.append(f'{ties} ties')
    lines = [f"T {a} {t['conferenceName']} {t['divName'].replace(' ', '_')}" for a, t in teams.items()]
    for game in sorted(games, key=lambda g: g['weekIndex']):
        week = game['weekIndex']
        home, away = game['homeTeam']['abbrName'], game['awayTeam']['abbrName']
        if 0 <= week <= 17:
            lines.append(f"G {week} {home} {away} {game['homeScore']} {game['awayScore']}")
        else:
            lines.append(f'P {week} {home} {away}')
    return {'regular': regular, 'postseason': postseason, 'complete_285': valid,
            'verified_games': len(games), 'concerns': sorted(set(concerns))}, '\n'.join(lines) + '\n'


def inspect(client, directory):
    abbr = directory['abbrev']
    url = BASE + urllib.parse.quote(abbr, safe='') + '/'
    row = {key: directory.get(key) for key in ('name', 'calendar_year', 'last_updated', 'member_count', 'is_ea_connected')}
    row.update(abbrev=abbr, neonsportz_url=f'https://neonsportz.com/leagues/{urllib.parse.quote(abbr, safe="")}/',
               api_url=url, madden_year=None, season=None, completed_seasons_count=0,
               completed_calendar_years=[], seasons={}, tier='Tier 3', data_quality_concerns=[])
    exports = {}
    try:
        detail = client.get(url, fresh=True)
        for key in ('name', 'madden_year', 'calendar_year', 'season', 'last_updated', 'member_count', 'is_ea_connected'):
            if key in detail:
                row[key] = detail[key]
        if detail.get('madden_year') is None:
            raise ValueError('detail missing madden_year')
        if row['madden_year'] != 2027:
            row['tier'] = 'Not Madden 27'
            return row, exports
        if detail.get('current_madden_year') != detail['madden_year']:
            row['data_quality_concerns'].append('current_madden_year differs from madden_year')
        current = int(detail['season'])
        if current < 0:
            raise ValueError('negative season index')
        if row['calendar_year'] is not None and int(row['calendar_year']) != 2026 + current:
            row['data_quality_concerns'].append('calendar_year differs from 2026 + season index; possible reset')
        for season in range(current + 1):
            game_url = url + 'games/?' + urllib.parse.urlencode({'seasonIndex': season, 'stageIndex': 1, 'completed': 'true'})
            year = str(2026 + season)
            result = {'season_index': season, 'regular': None, 'postseason': None, 'complete_285': False,
                      'sb_found': None, 'completed': False, 'concerns': []}
            row['seasons'][year] = result
            try:
                total = int(client.get(game_url + '&size=1')['count'])
                post = int(client.get(game_url + '&weekIndex__in=18,19,20,21,22&size=1')['count'])
                sb = int(client.get(game_url + '&weekIndex=22&size=1')['count'])
                result.update(count_completed=total, count_postseason=post, count_sb=sb,
                              regular=total - post, postseason=post, sb_found=sb > 0,
                              completed=sb > 0 or season < current)
                if not total:
                    result['concerns'].append('zero games; possible missing early season/reset')
                if result['completed']:
                    games = client.pages(game_url + '&size=100')
                    validated, text = schedule(games)
                    validated['concerns'] = sorted(set(result['concerns'] + validated['concerns']))
                    result.update(validated)
                    if validated['complete_285']:
                        exports[season] = text
            except (RuntimeError, ValueError, KeyError, TypeError) as error:
                result['error'] = str(error)
                result['concerns'].append('season validation/query failed')
                if not isinstance(error, RuntimeError):
                    client.failures.append({'url': game_url, 'error': str(error)})
        completed = [y for y, s in row['seasons'].items() if s['completed']]
        row['completed_calendar_years'] = completed
        row['completed_seasons_count'] = len(completed)
        if exports:
            row['tier'] = 'Tier 1'
        elif completed and not any(s.get('error') or s.get('count_completed') == 0 for s in row['seasons'].values()):
            row['tier'] = 'Tier 2'
        for year, season in row['seasons'].items():
            row['data_quality_concerns'].extend(f'{year}: {c}' for c in season['concerns'])
    except (RuntimeError, ValueError, KeyError, TypeError) as error:
        row['data_quality_concerns'].append(str(error))
        if not isinstance(error, RuntimeError):
            client.failures.append({'url': url, 'error': str(error)})
    return row, exports


def write_csv(path, rows, fields):
    with path.open('w', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: json.dumps(v, sort_keys=True) if isinstance(v, (dict, list)) else v for k, v in row.items()})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', type=Path, default=Path('~/.cache/rzs-neon-inventory/').expanduser())
    parser.add_argument('--refresh', action='store_true')
    parser.add_argument('--limit', type=int)
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--only', help='comma-separated league abbreviations')
    args = parser.parse_args()
    if args.workers < 1 or (args.limit is not None and args.limit < 1):
        parser.error('workers and limit must be positive')
    client = Client(args.cache.expanduser(), args.refresh)
    output = HERE / 'inventory'
    (output / 'export').mkdir(parents=True, exist_ok=True)
    rows = []
    evidence = []
    directory_count = None
    directory_error = None
    existing = set()
    dataset = HERE.parent / 'analysis' / 'dataset.json'
    if dataset.exists():
        existing = {entry['id'] for entry in json.loads(dataset.read_text())}
    try:
        if args.only:
            abbreviations = list(dict.fromkeys(a.strip().upper() for a in args.only.split(',') if a.strip()))
            if not abbreviations or any(not re.fullmatch(r'[A-Z0-9_-]+', a) for a in abbreviations):
                parser.error('invalid abbreviation')
            leagues = [{'abbrev': a} for a in abbreviations]
        else:
            leagues = client.pages(BASE + '?page=1&size=100', fresh=True)
            directory_count = len(leagues)
            leagues = list({league['abbrev']: league for league in leagues}.values())
            if len(leagues) != directory_count:
                raise ValueError('duplicate directory abbreviations')
        if args.limit:
            leagues = leagues[:args.limit]
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            for row, exports in pool.map(lambda league: inspect(client, league), leagues):
                rows.append(row)
                for season, text in exports.items():
                    # Explicit selections also export old fixtures for reproducibility checks.
                    if args.only or f"{row['abbrev']}-{2026 + season}" not in existing:
                        (output / 'export' / f"{row['abbrev']}-s{season}-bracket.txt").write_text(text)
                print(f"{row['abbrev']}: {row['tier']}, {len(exports)} complete seasons", flush=True)
    except (RuntimeError, ValueError, KeyError, TypeError) as error:
        directory_error = str(error)
        if not isinstance(error, RuntimeError):
            client.failures.append({'url': BASE, 'error': str(error)})
    rows.sort(key=lambda r: r['abbrev'])
    for row in [r for r in rows if r['tier'] == 'Tier 1'][:5]:
        season = next(s['season_index'] for s in row['seasons'].values() if s['complete_285'])
        samples = []
        for endpoint in (f'standings/?seasonIndex={season}', f'teams/?seasonIndex={season}', 'playoff-machine/'):
            url = row['api_url'] + endpoint
            try:
                data = client.get(url)
                if endpoint == 'playoff-machine/' and isinstance(data, dict):
                    summary = {k: v for k, v in data.items() if 'season' in k.lower() or 'seed' in k.lower()}
                else:
                    summary = data if not data else {'count': data.get('count', 'unknown')} if isinstance(data, dict) else {'rows': len(data)}
                samples.append(f'- `{url}`: `{json.dumps(summary, sort_keys=True)}`')
            except (RuntimeError, ValueError, TypeError) as error:
                samples.append(f'- `{url}`: failed ({error})')
        evidence.extend(samples)
    for row in rows:
        for field, source in [('regular_games_by_year', 'regular'), ('postseason_games_by_year', 'postseason'),
                              ('complete_285_by_year', 'complete_285'), ('sb_found_by_year', 'sb_found')]:
            row[field] = {year: season[source] for year, season in row['seasons'].items()}
    fields = ['name', 'abbrev', 'neonsportz_url', 'api_url', 'madden_year', 'calendar_year', 'season',
              'completed_seasons_count', 'completed_calendar_years', 'regular_games_by_year',
              'postseason_games_by_year', 'complete_285_by_year', 'sb_found_by_year', 'seasons', 'last_updated',
              'member_count', 'is_ea_connected', 'tier', 'data_quality_concerns']
    write_csv(output / 'inventory.csv', [r for r in rows if r['tier'] != 'Not Madden 27'], fields)
    failures = sorted({(f['url'], f['error']) for f in client.failures})
    write_csv(output / 'failures.csv', [dict(url=u, error=e) for u, e in failures], ['url', 'error'])
    madden = [r for r in rows if r['madden_year'] == 2027]
    seasons = [s for r in madden for s in r['seasons'].values()]
    lines = ['# NeonSportz Madden 27 inventory', '',
             f'Directory collected/count: {directory_count if directory_count is not None else "not checked (--only or directory failure)"}; equality checked before limiting.',
             f'Leagues inspected: {len(rows)}; Madden 27: {len(madden)}; with completed season: {sum(bool(r["completed_seasons_count"]) for r in madden)}.',
             f'Tier 1 leagues: {sum(r["tier"] == "Tier 1" for r in rows)}; complete seasons: {sum(s["complete_285"] for s in seasons)}; verified completed games: {sum(s.get("verified_games", 0) for s in seasons)}.',
             f'Failures: {len(failures)} (see failures.csv).']
    if directory_error:
        lines.extend(['', f'Directory/run failure: {directory_error}'])
    for tier in ('Tier 1', 'Tier 2', 'Tier 3'):
        lines.extend(['', f'## {tier}', ''])
        ranked = sorted((r for r in rows if r['tier'] == tier), key=lambda r: (-sum(s['complete_285'] for s in r['seasons'].values()), -r['completed_seasons_count'], r['abbrev']))
        lines.extend(f'- [{r["abbrev"]}]({r["neonsportz_url"]}): {sum(s["complete_285"] for s in r["seasons"].values())} complete / {r["completed_seasons_count"]} completed seasons; {"; ".join(r["data_quality_concerns"]) or "no concerns"}' for r in ranked)
    lines.extend(['', '## API evidence', ''])
    for row in madden[:5]:
        lines.append(f'- `{row["api_url"]}`: madden_year={row["madden_year"]}, season={row["season"]}; counts and validated schedules: `{json.dumps(row["seasons"], sort_keys=True)}`')
    lines.extend(['', '## Seed-snapshot finding', '', *evidence,
                  'Historical seed snapshots are not established by these endpoints. Empty historical responses and current playoff-machine data cannot recover historical seeds.' if evidence else 'No Tier 1 leagues available for historical seed probes.',
                  '', '## Limitations', '',
                  'CSV includes Madden 27 leagues and unknown detail failures; confirmed other Madden editions are excluded. Partial run when --only or --limit is used. Failures are unknowns, never negative Madden 27 findings. Tier 3 includes leagues with no completed season yet. Tier 1 means at least one complete season; other seasons may still have errors.',
                  'Count queries are API evidence before deduplication; complete flags use full validated schedules. Completed means a completed Super Bowl or an advanced franchise season, not necessarily a complete dataset. Calendar years assume 2026 + seasonIndex; resets can break that assumption.',
                  'Cached GET responses are snapshots taken at different times. --refresh refreshes only directory/detail; remove game cache entries to refresh schedules. Existing dataset seasons are skipped for export unless --only is supplied. Export files from earlier runs are retained.',
                  'No historical seeds are inferred from current standings. Bracket exports preserve API order within each week.'])
    (output / 'inventory.md').write_text('\n'.join(lines) + '\n')
    if failures:
        print(f'{len(failures)} failures; see {output / "failures.csv"}', file=sys.stderr)
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
