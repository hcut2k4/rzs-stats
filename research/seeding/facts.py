import numpy as np

CUTOFFS = {'thru_cal_wk18': 17, 'thru_cal_wk17': 16}


def record(wins, losses, ties):
    games = wins + losses + ties
    return dict(wins=wins, losses=losses, ties=ties,
                pct=np.divide(wins + ties / 2, games, out=np.zeros_like(wins, dtype=float), where=games != 0),
                pct_tie_loss=np.divide(wins, games, out=np.zeros_like(wins, dtype=float), where=games != 0))


def common_record(data, group, nfl=False):
    indices = [data['index'][t] for t in group]
    opponents = np.all(data['h2h_games'][indices] > 0, axis=0)
    opponents[indices] = False
    counts = [data[key][indices][:, opponents].sum(axis=1) for key in ('h2h_wins', 'h2h_losses', 'h2h_ties')]
    result = record(*counts)
    result['eligible'] = bool(np.all(sum(counts) >= 4)) if nfl else True
    result['opponents'] = tuple(t for i, t in enumerate(data['teams']) if opponents[i])
    return result


def facts(season, cutoff='thru_cal_wk18'):
    limit = CUTOFFS[cutoff]
    teams = tuple(sorted(season['teams']))
    index = {t: i for i, t in enumerate(teams)}
    n = len(teams)
    wins, losses, ties = (np.zeros((n, n), dtype=int) for _ in range(3))
    final = [np.zeros(n, dtype=int) for _ in range(3)]
    pf, pa, conf_net = (np.zeros(n, dtype=int) for _ in range(3))
    metadata = season['teams']
    for g in season['games']:
        if not 0 <= g['weekIndex'] <= 17:
            continue
        h, a = index[g['home']], index[g['away']]
        hs, aws = g['homeScore'], g['awayScore']
        tie = g.get('status') == 4 or hs == aws
        hr, ar = (2, 2) if tie else (0, 1) if hs > aws else (1, 0)
        final[hr][h] += 1
        final[ar][a] += 1
        if g['weekIndex'] > limit:
            continue
        (wins, losses, ties)[hr][h, a] += 1
        (wins, losses, ties)[ar][a, h] += 1
        pf[h] += hs
        pf[a] += aws
        pa[h] += aws
        pa[a] += hs
        if metadata[g['home']]['conf'] == metadata[g['away']]['conf']:
            conf_net[h] += hs - aws
            conf_net[a] += aws - hs
    games = wins + losses + ties
    overall = record(*(v.sum(axis=1) for v in (wins, losses, ties)))
    same_conf = np.array([[metadata[a]['conf'] == metadata[b]['conf'] for b in teams] for a in teams])
    same_div = same_conf & np.array([[metadata[a]['div'] == metadata[b]['div'] for b in teams] for a in teams])
    result = dict(teams=teams, index=index, cutoff=cutoff, final=record(*final), overall=overall,
                  division=record(*((v * same_div).sum(axis=1) for v in (wins, losses, ties))),
                  conference=record(*((v * same_conf).sum(axis=1) for v in (wins, losses, ties))),
                  h2h_games=games, h2h_wins=wins, h2h_losses=losses, h2h_ties=ties,
                  points_for=pf, points_against=pa, net_points=pf-pa, conference_net_points=conf_net)
    # Opponent records use the same cutoff, and repeat opponents count per meeting.
    for name, weights in [('sos', games), ('sov', wins)]:
        aggregate = [weights @ overall[k] for k in ('wins', 'losses', 'ties')]
        result[name] = record(*aggregate)
    result['common'] = {}
    result['common_nfl'] = {}
    for i, a in enumerate(teams):
        for b in teams[i+1:]:
            result['common'][a, b] = common_record(result, (a, b))
            result['common_nfl'][a, b] = common_record(result, (a, b), nfl=True)
    return result
