package com.rzs.stats.playoffs;

import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class DietBaselineTest {
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void sharedPassPreservesSeparateOddsChampionshipAndEveryTeamsWinBuckets(boolean completed) throws Exception {
        var state = SimulationServiceTest.season(completed);
        var probs = SimulationServiceTest.probabilities(state);
        var simulator = new SimulationService();
        var old = new LegacySimulationOracle();
        for (var rules : SimulationService.Rules.values()) {
            var legacyRules = LegacySimulationOracle.Rules.valueOf(rules.name());
            var shared = simulator.championship(state, probs, 2000, 917, rules, (h, a, n) -> n ? .51 : .58);
            var bracket = old.championship(state, probs, 2000, 917, legacyRules, (h, a, n) -> n ? .51 : .58);
            assertThat(shared.teams()).usingRecursiveComparison().isEqualTo(bracket.teams());
            var baseline = old.simulate(state, probs, Map.of(), 2000, 917, legacyRules);
            var odds = completed ? simulator.simulate(state, probs, Map.of(), 2000, 917, rules) : shared.baseline();
            assertThat(odds.teams()).usingRecursiveComparison().isEqualTo(baseline.teams());
            for (var team : state.teams()) {
                var tracked = old.simulate(state, probs, Map.of(), 2000, 917, legacyRules, false, team.abbr());
                var buckets = shared.baseline().allWins().get(team.abbr());
                if (completed) {
                    var normalized = new TreeMap<Integer, SimulationService.WinBucket>();
                    buckets.forEach((w, b) -> normalized.put(w, new SimulationService.WinBucket(b.simulations() / 2000,
                            b.playoffs() / 2000, b.division() / 2000, b.oneSeed() / 2000)));
                    buckets = normalized;
                }
                assertThat(buckets).usingRecursiveComparison().isEqualTo(tracked.wins());
            }
        }
    }

    @Test
    void conditionedRisksIdentifyTheSameTopGameAsPairedRuns() {
        var teams = new ArrayList<PlayoffSeeding.Team>();
        for (int i = 0; i < 8; i++) teams.add(new PlayoffSeeding.Team("T" + i, "AFC", "East"));
        var played = new ArrayList<PlayoffSeeding.Game>();
        for (int i = 0; i < 5; i++) for (int j = i + 1; j < 8; j++)
            played.add(new PlayoffSeeding.Game(0, "T" + i, "T" + j, 30, 0));
        played.add(new PlayoffSeeding.Game(0, "T5", "T6", 0, 30));
        played.add(new PlayoffSeeding.Game(0, "T6", "T7", 30, 0));
        var remaining = List.of(new SeasonStateLoader.RemainingGame(1, 17, "T5", "T7", 5, 7),
                new SeasonStateLoader.RemainingGame(2, 17, "T0", "T1", 0, 1));
        var state = new SeasonStateLoader.State(2, teams, Map.of(), played, remaining, 16, 17);
        var simulator = new SimulationService();
        var probs = Map.of(1, .5, 2, .5);
        var conditioned = simulator.conditioned(state, probs, Map.of(), 1000, 42, SimulationService.Rules.MADDEN, "T7");
        var paired = new HashMap<Integer, Double>();
        for (var g : remaining) {
            var home = simulator.simulate(state, probs, Map.of(g.gameId(), SimulationService.Outcome.HOME), 1000, 42, SimulationService.Rules.MADDEN, true);
            var away = simulator.simulate(state, probs, Map.of(g.gameId(), SimulationService.Outcome.AWAY), 1000, 42, SimulationService.Rules.MADDEN, true);
            paired.put(g.gameId(), (home.teams().get("T7").playoffs() - away.teams().get("T7").playoffs()) / 1000.0);
        }
        int top = conditioned.swings().entrySet().stream().max(Comparator.comparingDouble(e -> Math.abs(e.getValue()))).orElseThrow().getKey();
        int oldTop = paired.entrySet().stream().max(Comparator.comparingDouble(e -> Math.abs(e.getValue()))).orElseThrow().getKey();
        assertThat(top).isEqualTo(1).isEqualTo(oldTop);
        assertThat(Math.signum(conditioned.swings().get(top))).isEqualTo(Math.signum(paired.get(top)));
    }
}
