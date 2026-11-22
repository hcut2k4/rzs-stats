from contextlib import redirect_stdout
from io import StringIO
from itertools import combinations
import subprocess
import sys
import unittest

from research.seeding.facts import facts
from research.seeding.mine import (feature_scores, feature_values, learn_list, load_rows,
                                   group_consistent, group_features, group_step, learn_group_list,
                                   print_group_list,
                                   print_direction, season_rows, selftest, set_credit,
                                   strict_pairs, wilson)
from research.seeding.tests.test_seeding import game, season_with_records


class MineTests(unittest.TestCase):
    def group_row(self, features, qualified, identity='synthetic'):
        size = len(next(iter(features.values())))
        cache = {}
        for n in range(1, size+1):
            for current in combinations(range(size), n):
                values = {name: tuple(v[i] for i in current) for name, v in features.items()}
                values.update({'inverted_' + name: tuple(-v for v in scores)
                               for name, scores in list(values.items())})
                cache[current] = values
        return dict(id=identity, size=size, qualified=qualified, group_cache=cache,
                    category='WC3P', divisions=size, ambiguous=False)

    def test_group_steps_preserve_every_qualifier_without_overshooting(self):
        current = (0, 1, 2, 3)
        for action in ('KEEP_BEST', 'DROP_WORST', 'KEEP_BEST_ONE', 'DROP_WORST_ONE'):
            retained = group_step(current, (0, 1, 2, 3), action)
            self.assertEqual(group_consistent(retained, {1, 3}), action.startswith('DROP'))
            self.assertFalse(group_consistent(retained, {0, 3}))
        self.assertFalse(group_consistent((0,), {0, 1}))
        self.assertTrue(group_consistent((0, 1, 2), {0, 1}))
        self.assertEqual(group_step(current, (1, 1, 1, 1), 'DROP_WORST'), current)
        self.assertEqual(group_step(current, (0, 0, 1, 1), 'DROP_WORST_ONE'), current)
        self.assertEqual(group_step(current, (0, 0, 1, 1), 'KEEP_BEST_ONE'), current)
        self.assertEqual(group_step(current, (None, 0, 1, 2), 'DROP_WORST'), current)

    def test_group_list_recovers_beat_none_then_division_selection(self):
        rows = [self.group_row({'beat_none': (0, 0, 1), 'division_pct': (.8, .2, 1)}, {0})
                for _ in range(8)]
        rows += [self.group_row({'beat_none': (0, 0, 1), 'division_pct': (.2, .2, 1)}, {0, 1})
                 for _ in range(8)]
        learned, remaining, credit, first = learn_group_list(rows)
        self.assertEqual([(s['feature'], s['action']) for s in learned],
                         [('inverted_beat_none', 'KEEP_BEST'), ('division_pct', 'KEEP_BEST')])
        self.assertTrue(all(s['correct'] == s['support'] for s in learned))
        self.assertEqual(credit, 16)
        self.assertFalse(remaining)
        self.assertEqual(first[0]['support'], 16)
        output = StringIO()
        with redirect_stdout(output):
            print_group_list(rows, 'WC3P')
        self.assertIn('subset=diff-div groups=16', output.getvalue())
        self.assertIn('subset=same-div groups=0', output.getvalue())
        self.assertIn('Unexplained groups=0/16', output.getvalue())

    def test_group_list_recovers_unique_inverted_h2h_elimination(self):
        rows = [self.group_row({'group_h2h_pct': (1, .5, 0)}, {1, 2}) for _ in range(8)]
        rows += [self.group_row({'group_h2h_pct': (1, 1, 0)}, {0, 1}) for _ in range(8)]
        learned, remaining, credit, _ = learn_group_list(rows, max_steps=1)
        self.assertEqual([(s['feature'], s['action']) for s in learned],
                         [('inverted_group_h2h_pct', 'DROP_WORST_ONE')])
        self.assertEqual((learned[0]['support'], learned[0]['correct']), (8, 8))
        self.assertEqual(len(remaining), 8)
        self.assertAlmostEqual(credit, 8 + 8/3)

    def test_restart_recomputes_h2h_sweeps_and_common_opponents(self):
        season = season_with_records(dict(A=14, B=13, C=12, D=11, E=10, F=9, G=8))
        season['games'] = [game(0, 'A', 'B'), game(1, 'C', 'A'), game(2, 'C', 'B')]
        row = dict(size=3, group=('A', 'B', 'C'), data=facts(season))
        original = group_features(row, (0, 1, 2))
        self.assertEqual(original['beat_all_others'], (0, 0, 1))
        self.assertEqual(group_features(row, (0, 1))['group_h2h_pct'], (1, 0))
        self.assertEqual(group_features(row, (0, 1), False)['group_h2h_pct'], (.5, 0))
        self.assertEqual(group_features(row, (0, 1))['beat_all_others'], (1, 0))
        self.assertEqual(group_features(row, (0, 1))['common_pct'], (0, 0))
        empty = group_features(row, (2,))
        self.assertEqual(empty['group_h2h_pct'], (.5,))
        self.assertEqual(empty['group_h2h_played_pct'], (None,))

    def test_failed_group_steps_receive_no_credit_and_resolved_groups_stop(self):
        rows = [self.group_row({'x': (0, 1, 2)}, {2}) for _ in range(8)]
        rows.append(self.group_row({'x': (0, 1, 2)}, {0, 2}))
        learned, remaining, credit, _ = learn_group_list(rows)
        self.assertEqual(len(learned), 1)
        self.assertEqual(credit, 8)
        self.assertFalse(remaining)
        learned, remaining, credit, _ = learn_group_list(rows, max_steps=0)
        self.assertFalse(learned)
        self.assertEqual(len(remaining), 9)
        self.assertEqual(credit, 3)
        self.assertFalse(learn_group_list(rows, min_support=10)[0])

    def test_group_rows_keep_observed_sets_ids_and_division_subsets(self):
        season = season_with_records(dict(A=14, B=13, C=12, D=11, E=10, F=10, G=10, H=10))
        rows = season_rows((season, 'thru_cal_wk18', True))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['qualified'], {0, 1, 2})
        self.assertEqual(rows[0]['id'], 'TEST-s0/AFC/WC3P/E,F,G,H')
        output = StringIO()
        with redirect_stdout(output):
            print_group_list(rows, 'WC3P', 'same-div', max_steps=0, restart=False)
        self.assertIn('subset=same-div groups=1 restart=False', output.getvalue())
        self.assertIn('accuracy=0.250', output.getvalue())
        self.assertIn(rows[0]['id'], output.getvalue())

    def test_feature_ties_receive_exact_random_set_probability(self):
        self.assertEqual(set_credit((1, 1, 1, 1), {0, 1}), 1/6)
        self.assertEqual(set_credit((2, 1, 1, 0), {0, 1}), .5)
        self.assertEqual(set_credit((2, 1, 1, 0), {1, 2}), 0)
        self.assertEqual(set_credit((0, 1, 1), {0}, False), 1)

    def test_drop_worst_is_reported_only_for_one_eliminated_team(self):
        row = dict(features={'x': (1, 2, 3)}, qualified={1, 2}, size=3)
        scores = feature_scores([row])
        self.assertEqual(len([s for s in scores if s[3] == 'drop-worst']), 2)
        row['qualified'] = {2}
        self.assertFalse(any(s[3] == 'drop-worst' for s in feature_scores([row])))

    def test_fresh_and_all_are_refused_before_loading_data(self):
        for split in ('fresh', 'all'):
            with self.assertRaises(ValueError):
                load_rows(split)
            with self.assertRaises(ValueError):
                load_rows(split, groups=True)
            for command in ('features', 'group-list'):
                result = subprocess.run([sys.executable, '-m', 'research.seeding.mine', command,
                                         '--category', 'WC3P', '--split', split], capture_output=True, text=True)
                self.assertEqual(result.returncode, 2)

    def test_group_features_include_zero_game_default_and_no_label_fields(self):
        season = season_with_records(dict(A=14, B=13, C=12, D=11, E=10, F=9, G=8))
        values = feature_values(facts(season), ('A', 'B', 'C'))
        self.assertEqual(values['group_h2h_pct'], (.5, .5, .5))
        self.assertEqual(values['group_h2h_games'], (0, 0, 0))
        self.assertEqual(values['beat_none'], (1, 1, 1))
        self.assertFalse({'seed', 'rank', 'playoffStatus', 'teamId'} & values.keys())
        self.assertNotIn('common_min4_pct', values)
        self.assertNotIn('opponent_h2h_pct', values)

    def test_h2h_counts_wins_games_and_distinct_members_separately(self):
        season = season_with_records(dict(A=14, B=13, C=12, D=11, E=10, F=9, G=8))
        season['games'] = [game(0, 'A', 'B'), game(1, 'A', 'B'), game(2, 'A', 'C', 10, 10)]
        values = feature_values(facts(season), ('A', 'B', 'C'))
        self.assertEqual(values['group_h2h_wins'], (2, 0, 0))
        self.assertEqual(values['group_members_beaten'], (1, 0, 0))
        self.assertEqual(values['group_h2h_games'], (3, 2, 1))
        self.assertAlmostEqual(values['group_h2h_pct'][0], 2.5/3)
        self.assertEqual(values['group_h2h_pct'][2], .5)

    def test_cutoff_applies_to_discovery_features(self):
        season = season_with_records(dict(A=14, B=13, C=12, D=11, E=10, F=9, G=8))
        season['games'] = [game(16, 'A', 'B'), game(17, 'B', 'A', 40, 0)]
        early = feature_values(facts(season, 'thru_cal_wk17'), ('A', 'B'))
        full = feature_values(facts(season), ('A', 'B'))
        self.assertEqual(early['opponent_h2h_pct'], (1, 0))
        self.assertEqual(full['opponent_h2h_pct'], (.5, .5))

    def test_only_strict_unambiguous_pairs_enter_the_list(self):
        base = dict(category='DSEED', size=2, strict=True, pool=False, ambiguous=False)
        rows = [base, dict(base, pool=True, strict=False), dict(base, size=3),
                dict(base, ambiguous=True), dict(base, strict=False)]
        selected, ambiguous, excluded = strict_pairs(rows, 'DSEED')
        self.assertEqual(selected, [base])
        self.assertEqual((ambiguous, excluded), (1, 2))

    def test_seed_outcomes_follow_bracket_order_and_skip_ambiguous_brackets(self):
        season = season_with_records(dict(A=15, B=14, C=14, D=11, E=10, F=9, G=8))
        rows = season_rows((season, 'thru_cal_wk18'))
        pair = next(r for r in rows if r['category'] == 'DSEED')
        self.assertEqual(pair['qualified'], {0})
        self.assertTrue(pair['strict'])
        season['playoff_games'] = season['playoff_games'][:3]
        rows = season_rows((season, 'thru_cal_wk18'))
        pair = next(r for r in rows if r['category'] == 'DSEED')
        self.assertTrue(pair['ambiguous'])
        self.assertEqual(strict_pairs(rows, 'DSEED')[0], [])

    def test_later_criteria_use_only_pairs_tied_on_earlier_criteria(self):
        rows = [dict(features={'a': (1, 0), 'b': (0, 1)}, qualified={0}) for _ in range(16)]
        rows += [dict(features={'a': (0, 0), 'b': (1, 0)}, qualified={0}) for _ in range(8)]
        learned, remaining = learn_list(rows)
        self.assertEqual([s['feature'] for s in learned], ['a', 'b'])
        self.assertEqual([s['support'] for s in learned], [16, 8])
        self.assertFalse(remaining)
        self.assertFalse(learn_list(rows[:7])[0])

    def test_threeplus_team_events_count_groups_as_independent_units(self):
        row = dict(category='WC3P', size=3, divisions=2, qualified={0},
                   features={'group_h2h_pct': (.5, .5, .5), 'beat_none': (1, 1, 1), 'group_h2h_games': (0, 0, 0)})
        output = StringIO()
        with redirect_stdout(output):
            print_direction([row])
        self.assertIn('0.67/1', output.getvalue())
        self.assertIn('0.33/1', output.getvalue())
        self.assertNotIn('n=3', output.getvalue())

    def test_wilson_handles_empty_and_perfect_scores(self):
        self.assertIn('NA', wilson(0, 0))
        self.assertIn('[0.722,1.000]', wilson(10, 10))

    def test_real_schedules_recover_planted_comparator_and_direction(self):
        self.assertTrue(selftest().startswith('PASS:'))


if __name__ == '__main__':
    unittest.main()
