import json
import pickle
from collections import Counter
from pathlib import Path

from engine import Engine


HERE = Path(__file__).resolve().parent
TARGET = HERE.parents[1] / 'backend/src/test/resources/playoffs/madden27-fixture.json'
LIMIT = 2_000_000


def export():
    with (HERE / 'data/corpus.pkl').open('rb') as stream:
        seasons = pickle.load(stream)['seasons']
    candidates = []
    for season in seasons:
        if season['league'] in ('BSD', 'M27GM'):
            continue
        engine = Engine(season, 'madden27')
        expected = engine.seed()
        tied_groups = 0
        for conference, result in expected.items():
            members = [t for t, info in season['teams'].items() if info['conf'] == conference]
            winners = set(result['division_winners'].values())
            pools = [list(winners), [t for t in members if t not in winners]]
            pools += [[t for t in members if season['teams'][t]['div'] == division]
                      for division in result['division_winners']]
            for pool in pools:
                counts = Counter(round(float(engine.ratio(engine.data['final'], engine.data['index'][t])), 9)
                                 for t in pool)
                tied_groups += sum(count >= 3 for count in counts.values())
        entry = dict(id=season['id'],
                     teams=[[t, info['conf'], info['div']] for t, info in sorted(season['teams'].items())],
                     games=[[g['weekIndex'], g['home'], g['away'], g['homeScore'], g['awayScore']]
                            for g in season['games'] if 0 <= g['weekIndex'] <= 17],
                     expected={c: dict(seeds=v['seeds'], divisionWinners=v['division_winners'])
                               for c, v in expected.items()})
        candidates.append((-tied_groups, season['id'], entry))
    entries, size, included_ties = [], 2, 0
    for priority, _, entry in sorted(candidates):
        encoded = json.dumps(entry, separators=(',', ':'))
        extra = len(encoded.encode()) + bool(entries)
        if size + extra <= LIMIT:
            entries.append(encoded)
            size += extra
            included_ties -= priority
    TARGET.write_text('[' + ','.join(entries) + ']')
    print(f'{len(entries)} seasons, {len(entries) * 2} conference-seasons, {size} bytes; '
          f'{included_ties}/{-sum(priority for priority, _, _ in candidates)} three-or-more-team tie groups')


if __name__ == '__main__':
    export()
