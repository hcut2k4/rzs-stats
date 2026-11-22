import numpy as np

try:
    from .facts import common_record
except ImportError:
    from facts import common_record


def feature_values(data, group):
    indices = [data['index'][t] for t in group]
    games = data['h2h_games'][np.ix_(indices, indices)].sum(axis=1)
    wins = data['h2h_wins'][np.ix_(indices, indices)].sum(axis=1)
    ties = data['h2h_ties'][np.ix_(indices, indices)].sum(axis=1)
    beaten = (data['h2h_wins'][np.ix_(indices, indices)] > 0).sum(axis=1)
    result = dict(group_h2h_pct=np.divide(wins + ties/2, games, out=np.full(len(group), .5), where=games != 0),
                  group_h2h_wins=wins, group_h2h_games=games, group_members_beaten=beaten,
                  beat_none=(beaten == 0).astype(int))
    for name in ('overall', 'division', 'conference', 'sov', 'sos'):
        result[name + '_pct'] = data[name]['pct'][indices]
    for name in ('net_points', 'conference_net_points', 'points_for', 'points_against'):
        result[name] = data[name][indices]
    common = common_record(data, group)
    result['common_pct'] = common['pct']
    if common_record(data, group, nfl=True)['eligible']:
        result['common_min4_pct'] = common['pct']
    if len(group) == 2:
        # Each team's specific opponent is the other member, never a team identity feature.
        result['opponent_h2h_pct'] = result['group_h2h_pct']
    return {name: tuple(float(x) for x in values) for name, values in result.items()}


GROUP_ACTIONS = ('KEEP_BEST', 'DROP_WORST', 'KEEP_BEST_ONE', 'DROP_WORST_ONE')


def group_features(row, current, restart=True):
    source = current if restart else tuple(range(row['size']))
    cache = row.setdefault('group_cache', {})
    if source not in cache:
        group = tuple(row['group'][i] for i in source)
        values = procedure_features(row['data'], group)
        cache[source] = values
    positions = [source.index(i) for i in current]
    return {name: tuple(values[i] for i in positions) for name, values in cache[source].items()}


def procedure_features(data, group):
    values = feature_values(data, group)
    values['beat_all_others'] = tuple(int(v == len(group)-1) for v in values['group_members_beaten'])
    values['group_h2h_played_pct'] = tuple(v if g else None for v, g in
                                          zip(values['group_h2h_pct'], values['group_h2h_games']))
    values.update({'inverted_' + name: tuple(-v if v is not None else None for v in scores)
                   for name, scores in list(values.items())})
    return values


def group_step(current, values, action):
    if values is None or any(v is None for v in values):
        return current
    best = max(values) if action.startswith('KEEP') else min(values)
    extreme = {i for i, v in zip(current, values) if v == best}
    if len(extreme) == len(current) or (action.endswith('_ONE') and len(extreme) != 1):
        return current
    return tuple(i for i in current if (i in extreme if action.startswith('KEEP') else i not in extreme))

