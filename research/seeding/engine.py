from collections import defaultdict
from dataclasses import asdict, dataclass, field, replace
from fractions import Fraction
from functools import cmp_to_key
import json
from pathlib import Path

import numpy as np

try:
    from .features import procedure_features, group_step, GROUP_ACTIONS
    from .facts import facts, common_record, CUTOFFS
except ImportError:
    from features import procedure_features, group_step, GROUP_ACTIONS
    from facts import facts, common_record, CUTOFFS

DIVISION = ('H2H', 'DIV', 'COM', 'CONF', 'SOV', 'SOS', 'RANK_CONF', 'RANK_ALL', 'NET_COM', 'NET_ALL', 'FALLBACK')
WILDCARD = ('H2H', 'CONF', 'COM', 'SOV', 'SOS', 'RANK_CONF', 'RANK_ALL', 'NET_CONF', 'NET_ALL', 'FALLBACK')
CONTEXTS = ('division_title', 'dw_seed', 'wc_qualify', 'wc_seed')


@dataclass
class Config:
    criteria: dict = field(default_factory=lambda: {c: list(DIVISION if c == 'division_title' else WILDCARD) for c in CONTEXTS})
    directions: dict = field(default_factory=dict)
    common_min_games: dict = field(default_factory=lambda: {c: 0 if c == 'division_title' else 4 for c in CONTEXTS})
    group_procedures: dict = field(default_factory=dict)
    group_procedure_mode: str = 'sequential'
    group_method: str = 'normal'
    h2h_cluster_contexts: list = field(default_factory=lambda: ['wc_qualify', 'division_title'])
    h2h_cluster_fallback: str = 'worst_first'
    h2h_outlier_contexts: list = field(default_factory=lambda: ['wc_qualify', 'division_title'])
    h2h_outlier_fallback: str = 'worst_first'
    h2h_outlier_recompute: bool = False
    h2h_exhausted_after_group: bool = True
    outlier_chain_contexts: list = field(default_factory=lambda: ['wc_qualify', 'division_title'])
    outlier_chain_criteria: list = field(default_factory=lambda: ['H2H', 'DIV', 'COM', 'CONF', 'SOV', 'SOS', 'NET_CONF', 'NET_ALL'])
    chain_restart: str = 'same'
    chain_mean: str = 'current'
    chain_keep_pair_h2h: bool = False
    seed_rank_method: str = 'normal'
    seed_final_pair: str = 'chain'
    seed_rank_contexts: list = field(default_factory=lambda: ['dw_seed', 'wc_seed'])
    seed_rank_beat_none: bool = False
    seed_rank_three_only: bool = False
    method: str = 'nfl_best_first'
    worst_first_contexts: list = field(default_factory=list)
    h2h_measure: str = 'nfl'
    h2h_group_rank: str = 'nfl'
    h2h_no_games: str = 'skip'
    invert_h2h: bool = False
    invert_h2h_scope: str = 'all'
    invert_h2h_contexts: list = field(default_factory=lambda: list(CONTEXTS))
    beat_none_last: bool = False
    beat_none_last_contexts: list = field(default_factory=lambda: list(CONTEXTS[1:]))
    wc_representative_selection: str = 'checklist'
    one_team_per_division: bool = True
    representative_context: str = 'division_title'
    processing_order: str = 'division_first'
    restart_after_elimination: bool = True
    iteration_order: str = 'alpha'
    tiebreak_stats_cutoff: str = 'thru_cal_wk18'
    tie_weight: float = .5
    fallback: str = 'alpha'
    playoff_field_size: int = 7


REGISTRY = {
    'nfl': Config(),
    'div_checklist_wc': Config(
        criteria={c: list(DIVISION if c != 'dw_seed' else WILDCARD) for c in CONTEXTS},
        common_min_games={c: 4 if c == 'dw_seed' else 0 for c in CONTEXTS}),
    'plain': Config(
        criteria={c: list(DIVISION[:6] + ('NET_ALL', 'FALLBACK')) for c in CONTEXTS},
        common_min_games={c: 0 for c in CONTEXTS}, worst_first_contexts=['division_title'],
        h2h_group_rank='group_pct', h2h_no_games='half', invert_h2h=True,
        invert_h2h_scope='groups_3plus', invert_h2h_contexts=list(CONTEXTS[1:]),
        beat_none_last=True, processing_order='whole_group'),
}
REGISTRY['plain5'] = Config(**dict(asdict(REGISTRY['plain']), processing_order='division_first',
                                 wc_representative_selection='h2h_loser'))
REGISTRY['madden27'] = Config(
    group_method='madden27', processing_order='whole_group',
    criteria={c: ['H2H', 'DIV', 'COM', 'CONF', 'SOV', 'SOS', 'NET_CONF', 'NET_ALL'] for c in CONTEXTS},
    common_min_games={c: 0 for c in CONTEXTS})
# BSD and M27GM used a pre-launch build following NFL rules.
REGISTRY['madden27_prelaunch'] = REGISTRY['nfl']


def load_procedures(path):
    raw = json.loads(Path(path).read_text())
    return {key: value for key, value in raw.items() if key != 'metadata'}


def configuration(value=None):
    if isinstance(value, str):
        value = REGISTRY[value]
    result = asdict(value) if isinstance(value, Config) else dict(value or {})
    default = asdict(Config())
    for key, val in result.items():
        if key not in default:
            raise ValueError(f'Unknown config switch: {key}')
        if isinstance(default[key], dict):
            default[key].update(val)
        else:
            default[key] = val
    config = Config(**default)
    methods = ('nfl_best_first', 'worst_first', 'single_key', 'pairwise_sort')
    choices = dict(group_method=('normal', 'h2h_cluster', 'h2h_outlier', 'outlier_chain', 'madden27'),
                   chain_restart=('next', 'first', 'same'), chain_mean=('current', 'original'),
                   seed_rank_method=('normal', 'outlier_chain'), seed_final_pair=('chain', 'checklist'),
                   h2h_cluster_fallback=methods, h2h_outlier_fallback=methods,
                   group_procedure_mode=('sequential', 'restart'), method=methods,
                   h2h_group_rank=('nfl', 'group_pct'), invert_h2h_scope=('all', 'groups_3plus'),
                   wc_representative_selection=('checklist', 'h2h_loser', 'h2h_winner'),
                   h2h_measure=('nfl', 'pct', 'wins', 'sweep'), h2h_no_games=('half', 'zero', 'skip'),
                   processing_order=('division_first', 'whole_group'), iteration_order=('alpha', 'teamId'),
                   fallback=('alpha', 'teamId'), tiebreak_stats_cutoff=tuple(CUTOFFS),
                   representative_context=CONTEXTS, tie_weight=(0, .5), playoff_field_size=(6, 7))
    for key, allowed in choices.items():
        if getattr(config, key) not in allowed:
            raise ValueError(f'Invalid {key}: {getattr(config, key)}')
    names = {'group_h2h_pct', 'group_h2h_wins', 'group_h2h_games', 'group_members_beaten',
             'beat_none', 'beat_all_others', 'group_h2h_played_pct', 'opponent_h2h_pct',
             'overall_pct', 'division_pct', 'conference_pct', 'sov_pct', 'sos_pct',
             'net_points', 'conference_net_points', 'points_for', 'points_against',
             'common_pct', 'common_min4_pct'}
    names |= {'inverted_' + name for name in names}
    if not isinstance(config.group_procedures, dict):
        raise ValueError('Invalid group_procedures')
    config.group_procedures = {k: v for k, v in config.group_procedures.items() if k != 'metadata'}
    for context, shapes in config.group_procedures.items():
        if context not in CONTEXTS or not isinstance(shapes, dict):
            raise ValueError(f'Invalid group procedure context: {context}')
        for shape, steps in shapes.items():
            if shape not in ('diff_div', 'same_div') or not isinstance(steps, list):
                raise ValueError(f'Invalid group procedure shape: {shape}')
            for step in steps:
                if (not isinstance(step, dict) or set(step) != {'feature', 'action'}
                        or step['feature'] not in names or step['action'] not in GROUP_ACTIONS):
                    raise ValueError(f'Invalid group procedure step: {step}')
    for key in ('beat_none_last', 'h2h_outlier_recompute', 'h2h_exhausted_after_group', 'chain_keep_pair_h2h', 'seed_rank_beat_none', 'seed_rank_three_only'):
        if not isinstance(getattr(config, key), bool):
            raise ValueError(f'Invalid {key}')
    for key in ('beat_none_last_contexts', 'invert_h2h_contexts', 'worst_first_contexts', 'h2h_cluster_contexts', 'h2h_outlier_contexts', 'outlier_chain_contexts', 'seed_rank_contexts'):
        value = getattr(config, key)
        if not isinstance(value, list) or any(c not in CONTEXTS for c in value):
            raise ValueError(f'Invalid {key}: {value}')
    if any(c not in ('dw_seed', 'wc_seed') for c in config.seed_rank_contexts):
        raise ValueError('Invalid seed_rank_contexts')
    if (not isinstance(config.outlier_chain_criteria, list) or not config.outlier_chain_criteria
            or any(k not in ('H2H', 'DIV', 'COM', 'CONF', 'SOV', 'SOS', 'NET_CONF', 'NET_ALL')
                   for k in config.outlier_chain_criteria)):
        raise ValueError('Invalid outlier_chain_criteria')
    for context in CONTEXTS:
        if not config.criteria[context] or any(k not in set(DIVISION + WILDCARD + ('PCT',)) for k in config.criteria[context]):
            raise ValueError(f'Invalid criteria: {context}')
        if config.common_min_games[context] < 0:
            raise ValueError('Negative common-games minimum')
        if any(v not in ('asc', 'desc', 1, -1) for v in config.directions.get(context, {}).values()):
            raise ValueError(f'Invalid directions: {context}')
    return config


class Engine:
    def __init__(self, season, config=None):
        self.season = season
        self.config = configuration(config)
        self.data = facts(season, self.config.tiebreak_stats_cutoff)
        self.trace = []
        self.division_ranks = {}
        self._procedure_fallback = False

    def ratio(self, record, i):
        w, l, t = (int(record[k][i]) for k in ('wins', 'losses', 'ties'))
        return Fraction(w * 2 + t * int(self.config.tie_weight * 2), 2 * (w + l + t)) if w + l + t else Fraction(0)

    def fallback_key(self, team, mode=None):
        if (mode or self.config.fallback) == 'alpha':
            return (team,)
        value = self.season['teams'][team].get('teamId')
        if value is None:
            raise ValueError(f'{team}: teamId required for teamId ordering')
        return (int(value), team)

    def log(self, context, group, criterion, result):
        self.trace.append(dict(context=context, tied_group=sorted(group), criterion=criterion, result=list(result)))

    def values(self, group, criterion, context):
        d, c = self.data, self.config
        indices = [d['index'][t] for t in group]
        if c.group_method == 'madden27' and criterion == 'H2H':
            return {t: float(d['h2h_wins'][i, indices].sum() + d['h2h_ties'][i, indices].sum() / 2)
                    for t, i in zip(group, indices)}
        if c.group_method == 'madden27' and criterion in ('SOV', 'SOS'):
            weights = d['h2h_wins' if criterion == 'SOV' else 'h2h_games']
            return {t: float(weights[i] @ d['overall']['pct'] / weights[i].sum()) if weights[i].sum() else 0.
                    for t, i in zip(group, indices)}
        if criterion == 'FALLBACK':
            ordered = sorted(group, key=self.fallback_key)
            result = {t: -ordered.index(t) for t in group}
        elif criterion == 'H2H':
            measure = c.h2h_measure
            if len(group) > 2 and c.h2h_group_rank == 'group_pct':
                measure = 'pct'
            if measure == 'nfl':
                measure = 'sweep' if context != 'division_title' and len(group) > 2 else 'pct'
            games = d['h2h_games'][np.ix_(indices, indices)]
            wins = d['h2h_wins'][np.ix_(indices, indices)]
            losses = d['h2h_losses'][np.ix_(indices, indices)]
            ties = d['h2h_ties'][np.ix_(indices, indices)]
            if measure == 'sweep':
                won = [i for i in range(len(group)) if np.count_nonzero(wins[i]) == len(group)-1]
                lost = [i for i in range(len(group)) if np.count_nonzero(losses[i]) == len(group)-1]
                vals = [int(i in won) if len(won) == 1 else -int(i in lost) if len(lost) == 1 else 0 for i in range(len(group))]
            else:
                if c.h2h_no_games == 'skip' and any(games.sum(axis=1) == 0):
                    return None
                vals = []
                for i in range(len(group)):
                    n = int(games[i].sum())
                    if not n:
                        vals.append(Fraction(1, 2) if c.h2h_no_games == 'half' else Fraction(0))
                    elif measure == 'wins':
                        vals.append(int(wins[i].sum()))
                    else:
                        vals.append(Fraction(int(wins[i].sum()) * 2 + int(ties[i].sum()) * int(c.tie_weight * 2), 2*n))
            result = dict(zip(group, vals))
            if c.invert_h2h and context in c.invert_h2h_contexts and (c.invert_h2h_scope == 'all' or len(group) > 2):
                result = {t: -v for t, v in result.items()}
        elif criterion in ('COM', 'NET_COM'):
            common = common_record(d, group)
            if criterion == 'COM':
                if any(sum(int(common[k][i]) for k in ('wins', 'losses', 'ties')) < c.common_min_games[context] for i in range(len(group))):
                    return None
                result = {t: self.ratio(common, i) for i, t in enumerate(group)}
            else:
                opponents = set(common['opponents'])
                result = {t: sum((g['homeScore']-g['awayScore']) * (1 if g['home'] == t else -1)
                                 for g in self.season['games'] if 0 <= g['weekIndex'] <= CUTOFFS[c.tiebreak_stats_cutoff]
                                 and t in (g['home'], g['away']) and (g['away'] if g['home'] == t else g['home']) in opponents) for t in group}
        elif criterion in ('RANK_CONF', 'RANK_ALL'):
            result = {}
            for t, i in zip(group, indices):
                pool = [j for other, j in d['index'].items() if criterion == 'RANK_ALL' or self.season['teams'][other]['conf'] == self.season['teams'][t]['conf']]
                result[t] = -2 - sum(d['points_for'][j] > d['points_for'][i] for j in pool) - sum(d['points_against'][j] < d['points_against'][i] for j in pool)
        elif criterion in ('NET_CONF', 'NET_ALL'):
            key = 'conference_net_points' if criterion == 'NET_CONF' else 'net_points'
            result = {t: int(d[key][i]) for t, i in zip(group, indices)}
        else:
            key = dict(DIV='division', CONF='conference', SOV='sov', SOS='sos', PCT='overall')[criterion]
            result = {t: self.ratio(d[key], i) for t, i in zip(group, indices)}
        direction = c.directions.get(context, {}).get(criterion, 'desc')
        return {t: -v for t, v in result.items()} if direction in ('asc', -1) else result

    def sort_group(self, group, context):
        group = sorted(group, key=lambda t: self.fallback_key(t, self.config.iteration_order))
        if self.config.method == 'single_key':
            metrics = [self.values(group, k, context) for k in self.config.criteria[context]]
            ordered = sorted(group, key=self.fallback_key)
            ordered.sort(key=lambda t: tuple(m[t] if m else 0 for m in metrics), reverse=True)
        else:
            def compare(a, b):
                return -1 if self.select([a, b], context, reduce=False) == a else 1
            ordered = sorted(group, key=cmp_to_key(compare))
        self.log(context, group, self.config.method, ordered)
        return ordered

    def chain_values(self, group, criterion, context):
        if criterion == 'H2H':
            return dict(zip(group, map(int, procedure_features(self.data, group)['group_h2h_wins'])))
        if criterion == 'COM':
            common = common_record(self.data, group)
            return {t: self.ratio(common, i) for i, t in enumerate(group)}
        return self.values(group, criterion, context)

    def outlier_chain(self, group, context, count, ranking=False):
        original = tuple(sorted(group, key=lambda t: self.fallback_key(t, self.config.iteration_order)))
        current = original
        dropped = []
        prefix = 'seed_rank' if ranking else 'outlier_chain'
        criteria = self.config.outlier_chain_criteria
        initial = {k: self.chain_values(original, k, context) for k in criteria}
        position = 0
        while len(current) > count and position < len(criteria):
            if ranking and len(current) == 2 and self.config.seed_final_pair == 'checklist':
                self.log(context, current, 'seed_rank:pair_checklist', current)
                chosen = self.select(current, context, reduce=False)
                return [chosen] + [t for t in current if t != chosen] + list(reversed(dropped))
            criterion = criteria[position]
            values = ({t: initial['H2H'][t] for t in current} if criterion == 'H2H'
                      else self.chain_values(current, criterion, context))
            source = initial[criterion] if self.config.chain_mean == 'original' and len(current) > 2 else values
            mean = Fraction(sum(source.values()), len(source))
            distances = {t: abs(v - mean) for t, v in values.items()}
            farthest = [t for t in current if distances[t] == max(distances.values())]
            kind = 'unique_farthest' if len(farthest) == 1 else 'tied_farthest_lowest'
            lowest = min(values[t] for t in farthest)
            drop = [t for t in farthest if values[t] == lowest]
            if len(set(values.values())) == 1 or len(drop) != 1:
                self.log(context, current, f'{prefix}:{criterion}:silent', current)
                position += 1
                continue
            retained = tuple(t for t in current if t != drop[0])
            self.log(context, current, f'{prefix}:{criterion}:{kind}', retained)
            current = retained
            dropped.append(drop[0])
            if self.config.chain_restart == 'first':
                position = 0
            elif self.config.chain_restart == 'next':
                position += 1
        if len(current) == count:
            return list(current) + list(reversed(dropped)) if ranking else list(current)
        if ranking:
            config = self.config
            if not config.seed_rank_beat_none:
                self.config = replace(config, beat_none_last_contexts=[c for c in config.beat_none_last_contexts if c != context])
            self._procedure_fallback = True
            self.log(context, current, 'seed_rank:fallback', current)
            try:
                return self.rank_group(current, context) + list(reversed(dropped))
            finally:
                self.config = config
                self._procedure_fallback = False
        config = self.config
        fallback = dict(config.criteria)
        if len(current) == 2 and not config.chain_keep_pair_h2h:
            fallback[context] = [k for k in fallback[context] if k != 'H2H']
        self.config = replace(config, criteria=fallback, processing_order='whole_group')
        self.log(context, current, 'outlier_chain:fallback', current)
        try:
            return self.cluster_remainder(current, context, count, config.method)
        finally:
            self.config = config

    def seed_rank(self, group, context):
        c = self.config
        if (self._procedure_fallback or c.seed_rank_method != 'outlier_chain' or context not in c.seed_rank_contexts
                or len(group) < 3):
            return None
        if c.seed_rank_three_only and len(group) != 3:
            self.config = replace(c, seed_rank_method='normal')
            try:
                return self.rank_group(group, context)
            finally:
                self.config = c
        ordered = self.outlier_chain(group, context, 1, ranking=True)
        self.log(context, group, 'seed_rank:order', ordered)
        return ordered

    def outlier(self, group, context, count):
        current = tuple(sorted(group, key=lambda t: self.fallback_key(t, self.config.iteration_order)))
        wins = dict(zip(current, procedure_features(self.data, current)['group_h2h_wins']))
        while len(current) > count:
            if self.config.h2h_outlier_recompute:
                wins = dict(zip(current, procedure_features(self.data, current)['group_h2h_wins']))
            total = sum(int(wins[t]) for t in current)
            distances = {t: abs(int(wins[t]) * len(current) - total) for t in current}
            farthest = [t for t in current if distances[t] == max(distances.values())]
            if len(set(wins[t] for t in current)) == 1:
                kind = 'all_equal'
                drop = []
            elif len(farthest) == 1:
                kind = 'unique_farthest'
                drop = farthest
            else:
                kind = 'tied_farthest_lowest'
                lowest = min(wins[t] for t in farthest)
                drop = [t for t in farthest if wins[t] == lowest]
            if len(drop) != 1:
                self.log(context, current, 'h2h_outlier:silent:' + kind, current)
                break
            retained = tuple(t for t in current if t != drop[0])
            self.log(context, current, 'h2h_outlier:' + kind, retained)
            current = retained
        if len(current) == count:
            return list(current)
        config = self.config
        criteria = dict(config.criteria)
        if config.h2h_exhausted_after_group:
            criteria[context] = [k for k in criteria[context] if k != 'H2H']
        self.config = replace(config, criteria=criteria, processing_order='whole_group')
        self.log(context, current, 'h2h_outlier:fallback:' + ('skip_h2h' if config.h2h_exhausted_after_group else 'h2h'), current)
        try:
            return self.cluster_remainder(current, context, count, config.h2h_outlier_fallback)
        finally:
            self.config = config

    def cluster(self, group, context, count):
        current = tuple(sorted(group, key=lambda t: self.fallback_key(t, self.config.iteration_order)))
        while len(current) > max(count, 2):
            wins = dict(zip(current, procedure_features(self.data, current)['group_h2h_wins']))
            clusters = defaultdict(list)
            for team in current:
                clusters[wins[team]].append(team)
            largest = max(map(len, clusters.values()))
            leaders = [pool for pool in clusters.values() if len(pool) == largest]
            if len(clusters) == 1 or (largest > 1 and len(leaders) > 1):
                kind = 'all_equal' if len(clusters) == 1 else 'tied_largest'
                self.log(context, current, 'h2h_cluster:' + kind, current)
                break
            if largest == 1:
                retained = [t for t in current if wins[t] != min(wins.values())]
                criterion = 'h2h_cluster:all_distinct'
            else:
                retained = list(leaders[0])
                criterion = 'h2h_cluster:unique_largest'
                if len(retained) < count:
                    criterion += ':overshoot_fill'
                    rest = [t for t in current if t not in retained]
                    for value in sorted({wins[t] for t in rest}, reverse=True):
                        tier = [t for t in rest if wins[t] == value]
                        needed = count - len(retained)
                        retained.extend(tier if len(tier) <= needed else self.cluster_remainder(tier, context, needed))
                        if len(retained) == count:
                            break
            self.log(context, current, criterion, retained)
            current = tuple(retained)
        if len(current) > count:
            self.log(context, current, 'h2h_cluster:fallback', current)
            return self.cluster_remainder(current, context, count)
        return list(current)

    def cluster_remainder(self, group, context, count, method=None):
        config = self.config
        self.config = replace(config, method=method or config.h2h_cluster_fallback, worst_first_contexts=[])
        self._procedure_fallback = True
        try:
            if len(group) == 2:
                chosen = self.select(group, context, reduce=False)
                return ([chosen] + [t for t in group if t != chosen])[:count]
            return self.rank_group(group, context)[:count]
        finally:
            self.config = config
            self._procedure_fallback = False

    def procedure(self, group, context, count):
        if self._procedure_fallback or len(group) < 3 or count >= len(group):
            return None
        ranked = self.seed_rank(group, context)
        if ranked is not None:
            return ranked[:count]
        if self.config.group_method == 'outlier_chain' and context in self.config.outlier_chain_contexts:
            return self.outlier_chain(group, context, count)
        if self.config.group_method == 'h2h_outlier' and context in self.config.h2h_outlier_contexts:
            return self.outlier(group, context, count)
        if self.config.group_method == 'h2h_cluster' and context in self.config.h2h_cluster_contexts:
            return self.cluster(group, context, count)
        shape = 'diff_div' if len({self.season['teams'][t]['div'] for t in group}) == len(group) else 'same_div'
        steps = self.config.group_procedures.get(context, {}).get(shape, [])
        if not steps:
            return None
        current = tuple(sorted(group, key=lambda t: self.fallback_key(t, self.config.iteration_order)))
        position = 0
        while position < len(steps) and len(current) > count:
            step = steps[position]
            position += 1
            values = procedure_features(self.data, current)
            retained = group_step(current, values.get(step['feature']), step['action'])
            criterion = f'procedure:{step["feature"]}:{step["action"]}'
            if len(retained) < count:
                self.log(context, current, criterion + ':overshoot_skip', current)
                continue
            if retained != current:
                self.log(context, current, criterion, retained)
                current = retained
                if self.config.group_procedure_mode == 'restart':
                    position = 0
        if len(current) > count:
            self.log(context, current, 'procedure:fallback', current)
            self._procedure_fallback = True
            try:
                if len(current) == 2:
                    chosen = self.select(current, context, reduce=False)
                    return [chosen][:count]
                return self.rank_group(current, context)[:count]
            finally:
                self._procedure_fallback = False
        return list(current)

    def select(self, group, context, first=0, reduce=True):
        group = sorted(group, key=lambda t: self.fallback_key(t, self.config.iteration_order))
        if self.config.group_method == 'madden27':
            return self.madden27_rank(group, context)[0]
        if len(group) == 1:
            return group[0]
        chosen = self.procedure(group, context, 1)
        if chosen is not None:
            return chosen[0]
        c = self.config
        last = self.beat_none(group, context)
        if last:
            self.log(context, group, 'beat_none_last', [t for t in group if t != last])
            return self.select([t for t in group if t != last], context, reduce=reduce)
        if reduce and context != 'division_title' and c.processing_order == 'division_first':
            divisions = defaultdict(list)
            for t in group:
                divisions[self.season['teams'][t]['div']].append(t)
            if len(divisions) == 1 or (len(group) > 2 and c.one_team_per_division):
                representatives = [self.representative(pool, context)
                                   if context in ('wc_qualify', 'wc_seed') and c.wc_representative_selection != 'checklist'
                                   else min(pool, key=self.division_ranks.get)
                                   if c.representative_context == 'division_title' and all(t in self.division_ranks for t in pool)
                                   else self.select(pool, c.representative_context, reduce=False)
                                   for pool in divisions.values()]
                if len(representatives) < len(group):
                    self.log(context, group, 'division_reduction', representatives)
                    return self.select(representatives, context, reduce=False)
        criteria = c.criteria[context]
        if c.method in ('single_key', 'pairwise_sort') and len(group) > 2:
            return self.sort_group(group, context)[0]
        for pos in range(first, len(criteria)):
            criterion = criteria[pos]
            values = self.values(group, criterion, context)
            if values is None or len(set(values.values())) == 1:
                continue
            if (c.method == 'worst_first' or context in c.worst_first_contexts) and len(group) > 2:
                worst = min(values.values())
                remaining = [t for t in group if values[t] != worst]
            else:
                best = max(values.values())
                remaining = [t for t in group if values[t] == best]
            self.log(context, group, criterion, remaining)
            return self.select(remaining, context, 0 if c.restart_after_elimination or len(remaining) == 2 else pos+1, reduce=reduce)
        chosen = min(group, key=self.fallback_key)
        self.log(context, group, 'FALLBACK', [chosen])
        return chosen

    def beat_none(self, group, context):
        if not self.config.beat_none_last or context not in self.config.beat_none_last_contexts or len(group) < 3:
            return None
        indices = [self.data['index'][t] for t in group]
        wins = self.data['h2h_wins'][np.ix_(indices, indices)]
        none = [t for t, row in zip(group, wins) if not row.any()]
        return none[0] if len(none) == 1 else None

    def representative(self, pool, context):
        indices = [self.data['index'][t] for t in pool]
        values = {}
        for t, i in zip(pool, indices):
            n = int(self.data['h2h_games'][i, indices].sum())
            if not n and self.config.h2h_no_games == 'skip':
                return self.select(pool, self.config.representative_context, reduce=False)
            values[t] = (Fraction(int(self.data['h2h_wins'][i, indices].sum()) * 2
                                  + int(self.data['h2h_ties'][i, indices].sum()) * int(self.config.tie_weight * 2), 2*n)
                         if n else Fraction(1, 2) if self.config.h2h_no_games == 'half' else Fraction(0))
        target = min(values.values()) if self.config.wc_representative_selection == 'h2h_loser' else max(values.values())
        tied = [t for t in pool if values[t] == target]
        return self.select(tied, self.config.representative_context, reduce=False)

    def madden27_rank(self, group, context):
        group = sorted(group)
        if len(group) < 2:
            return group
        criteria = self.config.criteria[context]
        for criterion in criteria:
            values = self.values(group, criterion, context)
            if len(group) == 2:
                a, b = group
                if abs(float(values[a]) - float(values[b])) < 1e-12:
                    continue
                return sorted(group, key=lambda t: -values[t])
            clusters = defaultdict(list)
            for t in group:
                clusters[round(float(values[t]), 9)].append(t)
            if len(clusters) == 1:
                continue
            largest = max(map(len, clusters.values()))
            if largest == 1:
                return sorted(group, key=lambda t: -values[t])
            big = [v for v, ts in clusters.items() if len(ts) == largest]
            rest = sorted((v for v in clusters if v not in big), reverse=True)
            if not rest:
                continue
            keep = [t for v in big for t in clusters[v]]
            ordered = self.madden27_rank(keep, context)
            for v in rest:
                ordered += self.madden27_rank(clusters[v], context)
            self.log(context, group, 'madden27:' + criterion, ordered)
            return ordered
        return group

    def rank_group(self, group, context):
        if self.config.group_method == 'madden27':
            return self.madden27_rank(group, context)
        group = sorted(group, key=lambda t: self.fallback_key(t, self.config.iteration_order))
        if len(group) < 2:
            return group
        ranked = self.seed_rank(group, context)
        if ranked is not None:
            return ranked
        chosen = self.procedure(group, context, 1)
        if chosen is not None:
            return chosen + self.rank_group([t for t in group if t not in chosen], context)
        last = self.beat_none(group, context)
        if last:
            self.log(context, group, 'beat_none_last', [t for t in group if t != last])
            return self.rank_group([t for t in group if t != last], context) + [last]
        if len(group) == 2 and self.config.wc_representative_selection != 'checklist':
            chosen = self.select(group, context, reduce=False)
            return [chosen] + [t for t in group if t != chosen]
        divisions = {self.season['teams'][t]['div'] for t in group}
        reduction = context != 'division_title' and self.config.processing_order == 'division_first' and (len(divisions) == 1 or (self.config.one_team_per_division and len(divisions) < len(group)))
        if reduction and context in ('wc_qualify', 'wc_seed') and self.config.wc_representative_selection != 'checklist':
            pools = defaultdict(list)
            for t in group:
                pools[self.season['teams'][t]['div']].append(t)
            keep = [self.representative(pool, context) for pool in pools.values()]
            self.log(context, group, 'division_reduction', keep)
            return self.rank_group(keep, context) + self.rank_group([t for t in group if t not in keep], context)
        if len(group) == 2 or reduction or self.config.h2h_group_rank != 'group_pct' or self.config.method != 'nfl_best_first' or context in self.config.worst_first_contexts:
            chosen = self.select(group, context)
            return [chosen] + self.rank_group([t for t in group if t != chosen], context)
        for criterion in self.config.criteria[context]:
            values = self.values(group, criterion, context)
            if values is None or len(set(values.values())) == 1:
                continue
            tiers = [[t for t in group if values[t] == v] for v in sorted(set(values.values()), reverse=True)]
            self.log(context, group, criterion, [t for tier in tiers for t in tier])
            return [t for tier in tiers for t in self.rank_group(tier, context)]
        return sorted(group, key=self.fallback_key)

    def order(self, pool, context, count=None):
        pending, result = set(pool), []
        while pending and (count is None or len(result) < count):
            pct = {t: self.ratio(self.data['final'], self.data['index'][t]) for t in pending}
            if self.config.group_method == 'madden27':
                pct = {t: round(float(v), 9) for t, v in pct.items()}
            top = max(pct.values())
            group = [t for t in pending if pct[t] == top]
            divisions = {self.season['teams'][t]['div'] for t in group}
            reduction = context != 'division_title' and self.config.processing_order == 'division_first' and (len(divisions) == 1 or (self.config.one_team_per_division and len(divisions) < len(group)))
            chosen = self.madden27_rank(group, context) if self.config.group_method == 'madden27' else self.seed_rank(group, context)
            if chosen is None:
                chosen = self.procedure(group, context, min(len(group), count-len(result)) if count is not None else 1)
            if chosen is not None:
                pass
            elif self.config.h2h_group_rank == 'group_pct' or self.beat_none(group, context):
                chosen = self.rank_group(group, context)
            elif self.config.method in ('single_key', 'pairwise_sort') and len(group) > 2 and not reduction:
                chosen = self.sort_group(group, context)
            else:
                chosen = [self.select(group, context)]
            if count is not None:
                chosen = chosen[:count-len(result)]
            result.extend(chosen)
            pending.difference_update(chosen)
        return result

    def seed(self):
        result = {}
        for conf in sorted({v['conf'] for v in self.season['teams'].values()}):
            start = len(self.trace)
            members = {t for t, v in self.season['teams'].items() if v['conf'] == conf}
            divisions = defaultdict(list)
            for t in sorted(members):
                divisions[self.season['teams'][t]['div']].append(t)
            winners = {}
            for div, pool in divisions.items():
                ordered = self.order(pool, 'division_title')
                winners[div] = ordered[0]
                self.division_ranks.update({t: i for i, t in enumerate(ordered)})
            dw = self.order(winners.values(), 'dw_seed')
            qualified = self.order(members - set(dw), 'wc_qualify', max(0, self.config.playoff_field_size-len(dw)))
            wc = qualified if self.config.group_method == 'madden27' else self.order(qualified, 'wc_seed')
            result[conf] = dict(seeds=dw + wc, division_winners=winners, trace=self.trace[start:])
        return result


def seed(season, config=None):
    return Engine(season, config).seed()

REGISTRY['learned_v1'] = Config(**dict(asdict(REGISTRY['plain5']), group_procedures=load_procedures(
    Path(__file__).resolve().parent / 'procedures/learned_v1.json')))

REGISTRY['cluster'] = Config(**dict(asdict(REGISTRY['plain5']), group_method='h2h_cluster',
    invert_h2h_contexts=['dw_seed', 'wc_seed'], beat_none_last_contexts=['dw_seed', 'wc_seed']))
REGISTRY['cluster_all'] = Config(**dict(asdict(REGISTRY['cluster']), h2h_cluster_contexts=list(CONTEXTS),
    invert_h2h_contexts=[], beat_none_last_contexts=[]))

for name, recompute, exhausted in (
        ('outlier_once_skip', False, True), ('outlier_once_h2h', False, False),
        ('outlier_recomp_skip', True, True), ('outlier_recomp_h2h', True, False)):
    REGISTRY[name] = Config(**dict(asdict(REGISTRY['cluster']), group_method='h2h_outlier',
        h2h_outlier_recompute=recompute, h2h_exhausted_after_group=exhausted))

REGISTRY['outlier_seed'] = Config(**dict(asdict(REGISTRY['outlier_once_h2h']),
    h2h_outlier_contexts=list(CONTEXTS), invert_h2h_contexts=[], beat_none_last_contexts=[]))

REGISTRY['chain_best'] = Config(**dict(asdict(REGISTRY['outlier_once_skip']), group_method='outlier_chain',
    chain_restart='same', chain_mean='current', chain_keep_pair_h2h=False,
    outlier_chain_criteria=['H2H', 'DIV', 'COM', 'CONF', 'SOV', 'SOS', 'NET_CONF', 'NET_ALL']))
REGISTRY['chain_best_h2h'] = Config(**dict(asdict(REGISTRY['chain_best']), chain_keep_pair_h2h=True))

REGISTRY['chain_seed_dw'] = Config(**dict(asdict(REGISTRY['chain_best']), seed_rank_method='outlier_chain',
    seed_rank_contexts=['dw_seed']))
REGISTRY['chain_seed_wc'] = Config(**dict(asdict(REGISTRY['chain_best']), seed_rank_method='outlier_chain',
    seed_rank_contexts=['wc_seed']))
REGISTRY['chain_seed_both'] = Config(**dict(asdict(REGISTRY['chain_best']), seed_rank_method='outlier_chain'))
REGISTRY['chain_seed_shortcut'] = Config(**dict(asdict(REGISTRY['chain_seed_both']), seed_rank_beat_none=True))
REGISTRY['chain_seed_three'] = Config(**dict(asdict(REGISTRY['chain_seed_both']), seed_rank_three_only=True))

REGISTRY['chain_seed'] = Config(**asdict(REGISTRY['chain_seed_three']))

REGISTRY['chain_seed_pair'] = Config(**dict(asdict(REGISTRY['chain_seed']), seed_final_pair='checklist'))
REGISTRY['chain_seed_pair4'] = Config(**dict(asdict(REGISTRY['chain_seed_pair']), seed_rank_three_only=False))
