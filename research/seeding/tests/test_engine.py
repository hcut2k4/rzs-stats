from dataclasses import asdict
import json
import io
from contextlib import redirect_stdout
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from research.seeding.card import case_card
from research.seeding.engine import Engine, Config, DIVISION, WILDCARD, CONTEXTS, configuration, seed
from research.seeding.evaluate import guard_fresh, wilson, score, decision_id, evaluate_season, diff_results
from research.seeding.observe import Decision, observe
from research.seeding.tests.test_seeding import game, season_with_records


def tie_season():
    return dict(id='TIE', league='TIE', split='train',
                teams={t: dict(conf='AFC', div='East', teamId=i) for i, t in enumerate('ABC')},
                games=[game(0, 'A', 'B'), game(1, 'C', 'A'), game(2, 'B', 'C')], playoff_games=[])


class EngineTests(unittest.TestCase):
    def test_procedure_selects_a_different_qualifying_set_than_nfl(self):
        season = tie_season()
        season['games'] = [game(0, 'A', 'B'), game(1, 'B', 'C'),
                           game(2, 'B', 'C'), game(3, 'C', 'A')]
        steps = [dict(feature='inverted_group_h2h_wins', action='KEEP_BEST')]
        engine = Engine(season, dict(group_procedures={'wc_qualify': {'same_div': steps}}))
        self.assertEqual(set(engine.procedure('ABC', 'wc_qualify', 2)), {'A', 'C'})
        self.assertEqual(Engine(season).rank_group('ABC', 'wc_qualify')[:2], ['B', 'C'])
        self.assertEqual(engine.select('AB', 'wc_qualify', reduce=False), 'A')
        self.assertTrue(any(t['criterion'].startswith('procedure:') for t in engine.trace))

    def test_qualification_uses_all_available_spots_before_legacy_group_rules(self):
        season = tie_season()
        season['teams']['X'] = dict(conf='NFC', div='West', teamId=3)
        season['games'] = [game(0, 'A', 'B'), game(1, 'B', 'X'), game(2, 'C', 'X'),
                           game(3, 'X', 'A'), game(4, 'X', 'C')]
        steps = [dict(feature='inverted_group_h2h_wins', action='KEEP_BEST')]
        engine = Engine(season, dict(group_procedures={'wc_qualify': {'same_div': steps}}))
        self.assertEqual(set(engine.order('ABC', 'wc_qualify', 2)), {'B', 'C'})
        self.assertEqual(set(engine.order('ABC', 'wc_qualify', 3)), set('ABC'))
        self.assertIn('A', Engine(season).order('ABC', 'wc_qualify', 2))

    def test_procedure_restarts_the_list_and_recomputes_features(self):
        season = tie_season()
        season['teams']['D'] = dict(conf='AFC', div='East', teamId=3)
        season['games'] = [game(0, 'A', 'B'), game(1, 'B', 'C'),
                           game(2, 'C', 'B'), game(3, 'D', 'A', 40, 0)]
        steps = [dict(feature='group_h2h_wins', action='DROP_WORST_ONE'),
                 dict(feature='points_for', action='DROP_WORST_ONE')]
        engine = Engine(season, dict(group_procedure_mode='restart', group_procedures={'wc_qualify': {'same_div': steps}}))
        self.assertEqual(set(engine.procedure('ABCD', 'wc_qualify', 2)), {'B', 'C'})
        changed = [t['criterion'] for t in engine.trace if t['criterion'] != 'procedure:fallback']
        self.assertEqual(changed, ['procedure:points_for:DROP_WORST_ONE',
                                   'procedure:group_h2h_wins:DROP_WORST_ONE'])

    def test_procedure_skips_overshoots_and_uses_context_pair_checklist(self):
        season = tie_season()
        season['games'] = [game(0, 'A', 'B'), game(1, 'A', 'C'), game(2, 'B', 'C')]
        steps = [dict(feature='group_h2h_wins', action='KEEP_BEST_ONE'),
                 dict(feature='group_h2h_wins', action='DROP_WORST_ONE')]
        engine = Engine(season, dict(group_procedures={'wc_qualify': {'same_div': steps}}))
        self.assertEqual(set(engine.procedure('ABC', 'wc_qualify', 2)), {'A', 'B'})
        self.assertTrue(engine.trace[0]['criterion'].endswith(':overshoot_skip'))
        steps[:] = [dict(feature='group_h2h_wins', action='DROP_WORST_ONE')]
        self.assertEqual(engine.procedure('ABC', 'wc_qualify', 1), ['A'])
        engine.config.group_procedures['wc_qualify']['same_div'] = [
            dict(feature='group_h2h_games', action='KEEP_BEST')]
        season['games'] = [game(0, 'A', 'B')]
        engine = Engine(season, engine.config)
        self.assertEqual(engine.procedure('ABC', 'wc_qualify', 1), ['A'])
        self.assertTrue(any(t['criterion'] == 'procedure:fallback' for t in engine.trace))

    def test_procedure_json_round_trip_and_base_config(self):
        from research.seeding.evaluate import load_config
        from research.seeding.engine import load_procedures
        payload = {'wc_qualify': {'diff_div': [dict(feature='beat_none', action='DROP_WORST_ONE')]},
                   'metadata': {'split': 'train'}}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'procedure.json'
            path.write_text(json.dumps(payload))
            config = load_config(json.dumps(dict(base='plain5', group_procedures='@' + str(path))))
            self.assertEqual(config.group_procedures, load_procedures(path))
            self.assertEqual(configuration(dict(group_procedures=payload)).group_procedures, config.group_procedures)
            self.assertEqual(configuration(asdict(config)), config)
            self.assertEqual(config.wc_representative_selection, 'h2h_loser')
        for step in (dict(feature='typo', action='KEEP_BEST'), dict(feature='beat_none', action='DROP')):
            with self.assertRaises(ValueError):
                configuration(dict(group_procedures={'wc_qualify': {'same_div': [step]}}))

    def test_planted_group_procedure_is_recovered_and_runs_in_engine(self):
        from research.seeding.mine import learn_group_list
        from research.seeding.facts import facts
        season = tie_season()
        season['games'] = [game(0, 'A', 'B'), game(1, 'A', 'C'), game(2, 'B', 'C')]
        rows = [dict(size=3, group=tuple('ABC'), data=facts(season), qualified={1, 2}) for _ in range(8)]
        learned, remaining, credit, _ = learn_group_list(rows, max_steps=1)
        steps = [{k: step[k] for k in ('feature', 'action')} for step in learned]
        self.assertFalse(remaining)
        self.assertEqual(credit, 8)
        engine = Engine(season, dict(group_procedures={'wc_qualify': {'same_div': steps}}))
        self.assertEqual(set(engine.procedure('ABC', 'wc_qualify', 2)), {'B', 'C'})

    def test_group_inversion_preserves_normal_two_team_head_to_head(self):
        season = tie_season()
        season['games'] = [game(0, 'A', 'B'), game(1, 'B', 'C'),
                           game(2, 'B', 'C'), game(3, 'C', 'A')]
        config = dict(invert_h2h=True, h2h_group_rank='group_pct')
        normal = Engine(season)
        global_inverse = Engine(season, config)
        scoped = Engine(season, dict(config, invert_h2h_scope='groups_3plus'))
        self.assertEqual(normal.select('AB', 'division_title'), 'A')
        self.assertEqual(global_inverse.select('AB', 'division_title'), 'B')
        self.assertEqual(scoped.select('AB', 'division_title'), 'A')
        self.assertEqual(scoped.select('ABC', 'division_title'), 'C')

    def test_only_team_with_no_wins_goes_last_before_other_criteria(self):
        season = tie_season()
        season['games'] = [game(0, 'B', 'C'), game(1, 'C', 'B')]
        config = dict(criteria={c: ['FALLBACK'] for c in CONTEXTS}, processing_order='whole_group')
        for context in CONTEXTS[1:]:
            with self.subTest(context=context):
                self.assertEqual(Engine(season, config).rank_group('ABC', context), list('ABC'))
                engine = Engine(season, dict(config, beat_none_last=True))
                self.assertEqual(engine.rank_group('ABC', context), list('BCA'))
                self.assertEqual(engine.select('ABC', context), 'B')
        self.assertEqual(Engine(season, dict(config, beat_none_last=True)).select('ABC', 'division_title'), 'A')
        enabled = Engine(season, dict(config, beat_none_last=True, beat_none_last_contexts=['division_title']))
        self.assertEqual(enabled.rank_group('ABC', 'division_title'), list('BCA'))
        self.assertEqual(enabled.select('ABC', 'wc_qualify'), 'A')
        season['games'] = [game(0, 'B', 'C')]
        self.assertEqual(Engine(season, dict(config, beat_none_last=True)).rank_group('ABC', 'wc_seed'), list('ABC'))

    def test_ties_do_not_count_as_beating_an_opponent(self):
        season = tie_season()
        season['games'] = [game(0, 'A', 'B', 10, 10), game(1, 'B', 'C'), game(2, 'C', 'B')]
        engine = Engine(season, dict(beat_none_last=True, processing_order='whole_group'))
        self.assertEqual(engine.rank_group('ABC', 'wc_qualify')[-1], 'A')

    def test_beat_none_team_stays_last_when_order_selects_multiple_slots(self):
        season = tie_season()
        season['teams']['X'] = dict(conf='NFC', div='West')
        season['games'] = [game(0, 'A', 'X'), game(1, 'X', 'A'),
                           game(2, 'B', 'C'), game(3, 'C', 'B')]
        config = dict(processing_order='whole_group', criteria={'wc_qualify': ['FALLBACK']})
        self.assertEqual(Engine(season, config).order('ABC', 'wc_qualify', 2), list('AB'))
        engine = Engine(season, dict(config, beat_none_last=True))
        self.assertEqual(engine.order('ABC', 'wc_qualify', 2), list('BC'))

    def test_group_percentage_replaces_the_nfl_sweep_and_preserves_ranked_tiers(self):
        season = tie_season()
        season['games'] = [game(0, 'A', 'B'), game(1, 'A', 'B'),
                           game(2, 'B', 'C'), game(3, 'C', 'A')]
        config = dict(processing_order='whole_group', criteria={'wc_seed': ['H2H', 'FALLBACK']})
        self.assertEqual(Engine(season, config).rank_group('ABC', 'wc_seed'), list('ABC'))
        ranked = Engine(season, dict(config, h2h_group_rank='group_pct'))
        self.assertEqual(ranked.rank_group('ABC', 'wc_seed'), list('ACB'))
        season['games'] = [game(0, 'A', 'B'), game(1, 'A', 'C'), game(2, 'C', 'A'),
                           game(3, 'B', 'C'), game(4, 'B', 'C')]
        ranked = Engine(season, dict(config, h2h_group_rank='group_pct', invert_h2h=True,
                                     invert_h2h_scope='groups_3plus'))
        self.assertEqual(ranked.rank_group('ABC', 'wc_seed'), list('CAB'))

    def test_wild_card_representative_can_keep_the_head_to_head_loser_or_winner(self):
        season = tie_season()
        season['teams']['C']['div'] = 'West'
        season['games'] = [game(0, 'A', 'B')]
        config = dict(criteria={'wc_qualify': ['FALLBACK'], 'wc_seed': ['FALLBACK']})
        for context in ('wc_qualify', 'wc_seed'):
            with self.subTest(context=context):
                self.assertEqual(Engine(season, config).select('ABC', context), 'A')
                loser = Engine(season, dict(config, wc_representative_selection='h2h_loser'))
                self.assertEqual(loser.select('ABC', context), 'B')
                reversed_checklist = dict(config, directions={'division_title': {'H2H': 'asc'}})
                self.assertEqual(Engine(season, reversed_checklist).select('ABC', context), 'B')
                winner = Engine(season, dict(reversed_checklist, wc_representative_selection='h2h_winner'))
                self.assertEqual(winner.select('ABC', context), 'A')

    def test_three_division_mates_use_combined_head_to_head_for_the_representative(self):
        season = tie_season()
        season['games'] = [game(0, 'A', 'B'), game(1, 'B', 'C'),
                           game(2, 'B', 'C'), game(3, 'C', 'A')]
        config = dict(criteria={'division_title': ['FALLBACK']})
        self.assertEqual(Engine(season, config).select('ABC', 'wc_qualify'), 'A')
        for mode, expected in [('h2h_loser', 'C'), ('h2h_winner', 'B')]:
            engine = Engine(season, dict(config, wc_representative_selection=mode))
            self.assertEqual(engine.select('ABC', 'wc_qualify'), expected)

    def test_plain5_orders_division_representatives_before_reconsidering_the_rest(self):
        season = tie_season()
        season['teams']['C']['div'] = 'West'
        season['games'] = [game(0, 'A', 'B'), game(1, 'B', 'C'),
                           game(2, 'B', 'C'), game(3, 'C', 'A')]
        self.assertEqual(Engine(season, 'plain').rank_group('ABC', 'wc_qualify'), list('CAB'))
        engine = Engine(season, 'plain5')
        self.assertEqual(engine.rank_group('ABC', 'wc_qualify'), list('BCA'))
        self.assertEqual(engine.rank_group('AB', 'wc_qualify'), list('AB'))

    def test_beat_none_elimination_precedes_division_representative_selection(self):
        season = tie_season()
        season['teams']['C']['div'] = 'West'
        season['games'] = [game(0, 'B', 'A'), game(1, 'B', 'C'), game(2, 'C', 'B')]
        config = dict(wc_representative_selection='h2h_loser', criteria={'wc_qualify': ['FALLBACK']})
        self.assertEqual(Engine(season, config).select('ABC', 'wc_qualify'), 'A')
        engine = Engine(season, dict(config, beat_none_last=True))
        self.assertEqual(engine.select('ABC', 'wc_qualify'), 'B')
        self.assertEqual(engine.trace[0]['criterion'], 'beat_none_last')

    def test_named_configs_keep_nfl_defaults_and_use_documented_checklists(self):
        self.assertEqual(asdict(configuration('nfl')), asdict(Config()))
        wc = configuration('div_checklist_wc')
        for context in ('division_title', 'wc_qualify', 'wc_seed'):
            self.assertEqual(wc.criteria[context], list(DIVISION))
            self.assertEqual(wc.common_min_games[context], 0)
        self.assertEqual(wc.criteria['dw_seed'], list(WILDCARD))
        plain = configuration('plain')
        self.assertEqual(plain.processing_order, 'whole_group')
        self.assertEqual(plain.worst_first_contexts, ['division_title'])
        self.assertEqual(configuration('plain5').wc_representative_selection, 'h2h_loser')
        season = tie_season()
        season['games'] = [game(0, 'A', 'B'), game(1, 'B', 'C'), game(2, 'B', 'C'), game(3, 'C', 'A')]
        self.assertEqual(Engine(season, 'plain').select('ABC', 'division_title'), 'A')
        self.assertEqual(Engine(season, 'plain').select('ABC', 'dw_seed'), 'C')

    def test_new_switches_reject_invalid_values(self):
        for key, value in [('invert_h2h_scope', 'pairs'), ('h2h_group_rank', 'wins'),
                           ('wc_representative_selection', 'loser'), ('beat_none_last', 1),
                           ('beat_none_last_contexts', ['other']), ('beat_none_last_contexts', 'wc_seed'),
                           ('invert_h2h_contexts', ['other']), ('worst_first_contexts', ['other'])]:
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                configuration({key: value})

    def test_plain_qualifies_the_field_before_seeding_the_three_wild_cards(self):
        teams = {t: dict(conf='AFC', div=d) for t, d in zip('ABCDWXYZ', 'ABCDABCD')}
        teams['O'] = dict(conf='NFC', div='Other')
        games = [game(0, 'B', 'D'), game(1, 'D', 'C')]
        for t, wins, losses in [('A', 2, 2), ('B', 1, 2), ('C', 2, 1), ('D', 1, 1),
                                ('W', 3, 0), ('X', 3, 0), ('Y', 3, 0), ('Z', 3, 0)]:
            games.extend(game(0, t, 'O') for _ in range(wins))
            games.extend(game(0, 'O', t) for _ in range(losses))
        season = dict(teams=teams, games=games)
        self.assertEqual(Engine(season, 'plain').order('ABCD', 'wc_qualify', 3), list('CDA'))
        self.assertEqual(seed(season, 'plain')['AFC']['seeds'], list('WXYZCAD'))

    def test_best_first_and_worst_first_choose_different_three_way_winners(self):
        season = tie_season()
        season['teams']['X'] = dict(conf='NFC', div='West', teamId=4)
        season['games'] = [game(0, 'A', 'B'), game(1, 'B', 'C'), game(2, 'B', 'C'),
                           game(3, 'C', 'A'), game(4, 'A', 'X'), game(5, 'X', 'A'),
                           game(6, 'X', 'B'), game(7, 'C', 'X')]
        best = seed(season)['AFC']
        worst = seed(season, dict(method='worst_first'))['AFC']
        self.assertEqual(best['division_winners']['East'], 'B')
        self.assertEqual(best['seeds'], list('BCA'))
        self.assertEqual(worst['division_winners']['East'], 'A')

    def test_cutoff_changes_tiebreak_but_not_final_tied_group(self):
        season = tie_season()
        season['games'] = [game(16, 'B', 'A'), game(17, 'A', 'B', 40, 0)]
        config = dict(criteria={'division_title': ['NET_ALL', 'FALLBACK']})
        full = seed(season, config)['AFC']
        early = seed(season, dict(config, tiebreak_stats_cutoff='thru_cal_wk17'))['AFC']
        self.assertEqual(full['division_winners']['East'], 'A')
        self.assertEqual(early['division_winners']['East'], 'B')
        self.assertEqual(full['trace'][0]['tied_group'], ['A', 'B'])
        self.assertEqual(early['trace'][0]['tied_group'], ['A', 'B'])

    def test_predictions_ignore_madden_labels(self):
        season = season_with_records(dict(A=14, B=13, C=12, D=11, E=10, F=9, G=8))
        expected = seed(season)
        season['madden_seeds'] = {'AFC': list('GFEDCBA')}
        self.assertEqual(seed(season), expected)

    def test_qualification_and_seeding_have_separate_comparators(self):
        season = season_with_records(dict(A=14, B=13, C=12, D=11, E=10, F=10, G=10, H=10),
                                     dict(E='A', F='B', G='C', H='D'))
        result = seed(season, dict(criteria={'wc_qualify': ['FALLBACK'], 'wc_seed': ['FALLBACK']},
                                   directions={'wc_seed': {'FALLBACK': 'asc'}}))['AFC']['seeds']
        self.assertEqual(result[:4], list('ABCD'))
        self.assertEqual(result[4:], list('GFE'))

    def test_single_key_keeps_the_original_group_metrics_for_the_entire_order(self):
        season = tie_season()
        season['teams']['X'] = dict(conf='NFC', div='West', teamId=4)
        season['games'] = [game(0, 'A', 'B'), game(1, 'B', 'C'), game(2, 'B', 'C'),
                           game(3, 'C', 'A'), game(4, 'A', 'X'), game(5, 'X', 'A'),
                           game(6, 'X', 'B'), game(7, 'C', 'X')]
        engine = Engine(season, dict(method='single_key'))
        self.assertEqual(engine.order('ABC', 'division_title'), list('BAC'))

    def test_representative_can_use_the_wild_card_comparator_without_reducing_again(self):
        engine = Engine(tie_season(), dict(representative_context='wc_qualify',
                                          criteria={'wc_qualify': ['FALLBACK']}))
        self.assertEqual(engine.select('ABC', 'wc_qualify'), 'A')

    def test_config_objects_and_dicts_have_same_defaults_and_reject_unknowns(self):
        self.assertEqual(asdict(configuration({})), asdict(Config()))
        with self.assertRaises(ValueError):
            configuration({'typo': True})
        with self.assertRaises(ValueError):
            configuration({'method': 'typo'})

    def test_h2h_empty_record_policy_and_inversion(self):
        season = tie_season()
        season['games'] = [game(0, 'B', 'C')]
        for policy, value in [('half', .5), ('zero', 0), ('skip', None)]:
            engine = Engine(season, dict(h2h_no_games=policy, h2h_measure='pct'))
            values = engine.values(list('ABC'), 'H2H', 'division_title')
            if value is None:
                self.assertIsNone(values)
            else:
                self.assertEqual(values['A'], value)
                self.assertEqual(values['B'], 1)
                self.assertEqual(values['C'], 0)
        engine = Engine(tie_season(), dict(invert_h2h=True))
        self.assertEqual(engine.select(['A', 'B'], 'division_title'), 'B')

    def test_processing_order_changes_whether_division_rivals_are_reduced_first(self):
        season = tie_season()
        season['teams']['C']['div'] = 'West'
        season['games'] = [game(0, 'A', 'B', 20, 10), game(1, 'B', 'C', 100, 0)]
        config = dict(criteria={'wc_qualify': ['NET_ALL', 'FALLBACK']})
        first = Engine(season, config)
        whole = Engine(season, dict(config, processing_order='whole_group'))
        self.assertEqual(first.select('ABC', 'wc_qualify'), 'A')
        self.assertEqual(whole.select('ABC', 'wc_qualify'), 'B')


class EvaluationTests(unittest.TestCase):
    def test_wilson_interval_matches_reference_values(self):
        self.assertEqual(wilson(0, 0), (0, 1))
        self.assertAlmostEqual(wilson(0, 10)[0], 0)
        self.assertAlmostEqual(wilson(0, 10)[1], .2775327998628892)
        self.assertAlmostEqual(wilson(5, 10)[0], .236593090512564)
        self.assertAlmostEqual(wilson(5, 10)[1], .763406909487436)
        self.assertAlmostEqual(wilson(10, 10)[0], .7224672001371107)

    def test_fresh_refuses_without_final_and_logs_every_authorized_run(self):
        with tempfile.TemporaryDirectory() as directory:
            for split in ('fresh',):
                log = Path(directory) / f'{split}_log.txt'
                with self.assertRaisesRegex(ValueError, '--final'):
                    guard_fresh(split, False, Config(), log)
                self.assertFalse(log.exists())
                guard_fresh(split, True, Config(), log)
                guard_fresh(split, True, Config(), log)
                self.assertEqual(len(log.read_text().splitlines()), 2)
                self.assertEqual(json.loads(log.read_text().splitlines()[0])['split'], split)

    def test_cli_refuses_fresh_before_loading_corpus(self):
        result = subprocess.run([sys.executable, 'research/seeding/evaluate.py', '--config', 'nfl', '--split', 'fresh'], text=True, capture_output=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn('Fresh access requires --final', result.stderr)

    def test_seed_decision_scores_only_the_relative_order_of_the_tied_teams(self):
        decision = Decision('S', 'L', 'AFC', 'DSEED', ('A', 'C'),
                            dict(qualified=None), True, False, 2, 'train')
        labels = [tuple('ABCDEFG')]
        self.assertTrue(score(decision, dict(seeds=list('BACDFEG')), labels))
        self.assertFalse(score(decision, dict(seeds=list('BCADFEG')), labels))
        self.assertFalse(score(decision, dict(seeds=list('BADEFGH')), labels))
        self.assertEqual(decision_id(decision), 'S|AFC|DSEED|A,C')

    def test_baseline_diff_includes_changed_absolute_seeds_with_the_same_group_order(self):
        row = dict(id='S|AFC|DSEED|A,B', mode='brackets-only', category='DSEED',
                   prediction=['A', 'B'], seed_assignment=list('ABCDEFG'), correct=True)
        baseline = dict(row, seed_assignment=list('CABDEFG'), correct=False)
        output = io.StringIO()
        with redirect_stdout(output):
            diff_results(dict(decisions=[row]), dict(decisions=[baseline]))
        self.assertIn(row['id'], output.getvalue())

    def test_case_card_includes_both_cutoffs_and_config_trace(self):
        season = season_with_records(dict(A=14, B=13, C=12, D=11, E=10, F=9, G=8, H=8))
        decision = next(d for d in observe(season)['decisions'] if d.category == 'WC2')
        card = case_card(season, decision)
        for text in ('thru_cal_wk18', 'thru_cal_wk17', 'H2H', 'SOV/SOS', 'nfl:', 'wc_qualify:', 'matches observed decision:'):
            self.assertIn(text, card)

    def test_bracket_report_does_not_count_fallback_only_decisions(self):
        season = season_with_records(dict(A=14, B=13, C=12, D=11, E=10, F=9, G=8, H=8))
        season['playoff_games'] = []
        result = evaluate_season((season, Config()))
        self.assertFalse(any(r['mode'] == 'brackets-only' for r in result['decisions']))
        self.assertTrue(any(r['mode'] == 'brackets+fallback' for r in result['decisions']))


class ExclusionTests(unittest.TestCase):
    def test_exclusion_removes_only_matching_leagues_and_is_part_of_the_cache_key(self):
        from research.seeding import evaluate as evaluator
        keep = dict(season_with_records(dict(A=14, B=13, C=12, D=11, E=10, F=9, G=8)),
                    id='KEEP-s0', league='KEEP')
        remove = dict(keep, id='M27GM-s0', league='M27GM')
        dev = dict(keep, id='DEV-s0', split='dev')
        original = evaluator.HERE
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ('engine.py', 'evaluate.py', 'observe.py', 'facts.py', 'features.py', 'corpus.py'):
                (root / name).write_bytes((original / name).read_bytes())
            evaluator.HERE = root
            try:
                seasons = [keep, remove, dev]
                filtered = evaluator.evaluate(seasons, 'chain_seed', 'train', workers=1, exclude_leagues=['M27GM'])
                default = evaluator.evaluate(seasons, 'chain_seed', 'train', workers=1)
                self.assertEqual(filtered['seasons'], 1)
                self.assertEqual(default['seasons'], 2)
                for key in ('decisions', 'conferences'):
                    self.assertEqual(filtered[key], [r for r in default[key] if r['id'].startswith('KEEP-s0|')])
                cache = root / 'data/evaluations'
                count = len(list(cache.glob('*.json')))
                for name in ('UNKNOWN1', 'UNKNOWN2'):
                    evaluator.evaluate([keep], 'chain_seed', 'train', workers=1, exclude_leagues=[name])
                self.assertEqual(len(list(cache.glob('*.json'))), count + 2)
                evaluator.evaluate(seasons, 'chain_seed', 'train', workers=1, exclude_leagues=['M27GM', 'M27GM'])
                self.assertEqual(len(list(cache.glob('*.json'))), count + 2)
            finally:
                evaluator.HERE = original

    def test_exclusion_cannot_bypass_the_fresh_guard(self):
        for split in ('fresh',):
            result = subprocess.run([sys.executable, '-m', 'research.seeding.evaluate', '--config', 'chain_seed',
                                     '--split', split, '--exclude-leagues', 'M27GM'], text=True, capture_output=True)
            self.assertEqual(result.returncode, 2)
            self.assertIn('Fresh access requires --final', result.stderr)
