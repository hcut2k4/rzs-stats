package com.rzs.stats.playoffs;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.rzs.stats.playoffs.SimulationService.*;

class SimulationServiceTest {
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    record Fixture(List<PlayoffSeeding.Team> teams, List<PlayoffSeeding.Game> games) {}
    final SimulationService simulator = new SimulationService();

    static SeasonStateLoader.State season(boolean completed) throws Exception {
        Fixture fixture;
        try (var input = SimulationServiceTest.class.getResourceAsStream("/playoffs/sim-full-season.json")) {
            fixture = new ObjectMapper().readValue(input, Fixture.class);
        }
        var remaining = new ArrayList<SeasonStateLoader.RemainingGame>();
        int id = 0;
        for (var g : fixture.games()) remaining.add(new SeasonStateLoader.RemainingGame(++id, g.week(), g.home(), g.away(), 0, 0));
        return new SeasonStateLoader.State(2, fixture.teams(), Map.of(), completed ? fixture.games() : List.of(),
                completed ? List.of() : remaining, completed ? 17 : null, completed ? null : 0);
    }

    static Map<Integer, Double> probabilities(SeasonStateLoader.State state) {
        var probs = new HashMap<Integer, Double>();
        state.remainingGames().forEach(g -> probs.put(g.gameId(), 0.55));
        return probs;
    }

    @Test
    void oddsConserveEveryConferenceSpotAndDivisionTitle() throws Exception {
        var state = season(false);
        var result = simulator.simulate(state, probabilities(state), Map.of(), 500, 42, Rules.MADDEN);
        for (var conference : List.of("AFC", "NFC")) {
            var members = state.teams().stream().filter(t -> t.conference().equals(conference)).toList();
            assertThat(members.stream().mapToLong(t -> result.teams().get(t.abbr()).playoffs()).sum()).isEqualTo(7 * 500);
            assertThat(members.stream().mapToLong(t -> result.teams().get(t.abbr()).oneSeed()).sum()).isEqualTo(500);
        }
        for (var division : state.teams().stream().map(PlayoffSeeding.Team::division).distinct().toList()) {
            assertThat(state.teams().stream().filter(t -> t.division().equals(division))
                    .mapToLong(t -> result.teams().get(t.abbr()).division()).sum()).isEqualTo(500);
        }
        result.teams().values().forEach(c -> assertThat(c.seedCounts().stream().mapToLong(Long::longValue).sum()).isEqualTo(c.playoffs()));
    }

    @Test
    void forcedResultsAndCompletedSeasonEqualExactSeeding() throws Exception {
        var state = season(false);
        var forced = new HashMap<Integer, Outcome>();
        state.remainingGames().forEach(g -> forced.put(g.gameId(), g.gameId() % 3 == 0 ? Outcome.TIE : Outcome.HOME));
        var result = simulator.simulate(state, Map.of(), forced, 50, 42, Rules.MADDEN);
        var exact = MaddenSeeding.madden27().seed(state.teams(), simulator.games(state, Map.of(), forced, 0, 42));
        assertExact(result, exact, 50);
        var completed = season(true);
        var finished = simulator.simulate(completed, Map.of(), Map.of(), 500, 42, Rules.MADDEN);
        assertThat(finished.simulations()).isZero();
        assertExact(finished, MaddenSeeding.madden27().seed(completed.teams(), completed.completedGames()), 1);
    }

    private void assertExact(Simulation result, PlayoffSeeding.Result exact, int denominator) {
        exact.conferences().values().forEach(ranks -> ranks.forEach(rank -> {
            String team = rank.teams().iterator().next();
            var count = result.teams().get(team);
            assertThat(count.playoffs()).isEqualTo(rank.position() <= 7 ? denominator : 0);
            assertThat(count.oneSeed()).isEqualTo(rank.position() == 1 ? denominator : 0);
            assertThat(count.division()).isEqualTo(exact.divisionRanks().get(team).position() == 1 ? denominator : 0);
            for (int i = 0; i < 7; i++) assertThat(count.seedCounts().get(i)).isEqualTo(rank.position() == i + 1 ? (long) denominator : 0L);
        }));
    }

    @Test
    void forcingOneGamePreservesEveryOtherGameIncludingMargins() throws Exception {
        var state = season(false);
        var probs = probabilities(state);
        for (int sim = 0; sim < 100; sim++) {
            var baseline = simulator.games(state, probs, Map.of(), sim, 42);
            for (var outcome : Outcome.values()) {
                var forced = simulator.games(state, probs, Map.of(state.remainingGames().getFirst().gameId(), outcome), sim, 42);
                assertThat(forced.subList(1, forced.size())).isEqualTo(baseline.subList(1, baseline.size()));
                assertThat(Integer.signum(forced.getFirst().homeScore() - forced.getFirst().awayScore()))
                        .isEqualTo(outcome == Outcome.HOME ? 1 : outcome == Outcome.AWAY ? -1 : 0);
            }
            assertThat(baseline).allMatch(g -> g.homeScore() != g.awayScore());
        }
    }

    @Test
    void varyingForcedMarginsKeepsWinnersAndEveryUnpickedDraw() throws Exception {
        var state = season(false);
        var probs = probabilities(state);
        int picked = state.remainingGames().getFirst().gameId();
        var margins = new HashSet<Integer>();
        for (int simulation = 0; simulation < 100; simulation++) {
            var baseline = simulator.games(state, probs, Map.of(), simulation, 42);
            var forced = simulator.games(state, probs, Map.of(picked, Outcome.AWAY), simulation, 42, true);
            assertThat(forced.subList(1, forced.size())).isEqualTo(baseline.subList(1, baseline.size()));
            assertThat(forced.getFirst().awayScore()).isGreaterThan(forced.getFirst().homeScore());
            margins.add(forced.getFirst().awayScore() - forced.getFirst().homeScore());
        }
        assertThat(margins).containsExactlyInAnyOrder(1, 3, 7, 10, 14, 21);
    }

    @Test
    void fixedSeedIsDeterministicAndChangingSeedChangesResults() throws Exception {
        var state = season(false);
        var probs = probabilities(state);
        var first = simulator.simulate(state, probs, Map.of(), 100, 42, Rules.MADDEN);
        assertThat(simulator.simulate(state, probs, Map.of(), 100, 42, Rules.MADDEN)).isEqualTo(first);
        assertThat(simulator.simulate(state, probs, Map.of(), 100, 43, Rules.MADDEN)).isNotEqualTo(first);
    }

    @Test
    void homeWinHelpsHomeTeamInTwoTeamDivisionRace() {
        var teams = new ArrayList<PlayoffSeeding.Team>();
        teams.add(new PlayoffSeeding.Team("A", "AFC", "East"));
        teams.add(new PlayoffSeeding.Team("B", "AFC", "East"));
        var completed = new ArrayList<PlayoffSeeding.Game>();
        for (int i = 0; i < 6; i++) {
            String abbr = "C" + i;
            teams.add(new PlayoffSeeding.Team(abbr, "AFC", "Division" + i / 2));
            completed.add(new PlayoffSeeding.Game(0, abbr, "A", 27, 20));
            completed.add(new PlayoffSeeding.Game(1, abbr, "B", 27, 20));
            if (i % 2 == 1) completed.add(new PlayoffSeeding.Game(2, "C" + (i - 1), abbr, 27, 20));
        }
        var state = new SeasonStateLoader.State(0, teams, Map.of(), completed,
                List.of(new SeasonStateLoader.RemainingGame(1, 17, "A", "B", 1, 2)), 2, 17);
        var win = simulator.simulate(state, Map.of(), Map.of(1, Outcome.HOME), 100, 42, Rules.MADDEN).teams().get("A");
        var loss = simulator.simulate(state, Map.of(), Map.of(1, Outcome.AWAY), 100, 42, Rules.MADDEN).teams().get("A");
        assertThat(win.playoffs()).isEqualTo(100);
        assertThat(loss.playoffs()).isZero();
        assertThat(win.division()).isGreaterThan(loss.division());
        assertThat(win.oneSeed()).isGreaterThanOrEqualTo(loss.oneSeed());
    }

    @Test
    void rejectsMissingProbabilitiesAndUnknownForcedGames() throws Exception {
        var state = season(false);
        assertThatThrownBy(() -> simulator.simulate(state, Map.of(), Map.of(), 10, 42, Rules.MADDEN))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("probability");
        assertThatThrownBy(() -> simulator.simulate(state, probabilities(state), Map.of(-1, Outcome.HOME), 10, 42, Rules.MADDEN))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("forced");
    }

    @Test
    @Tag("benchmark")
    void reportTwentyThousandFullSeasonSimulations() throws Exception {
        var state = season(false);
        var probs = probabilities(state);
        simulator.simulate(state, probs, Map.of(), 1000, 42, Rules.MADDEN);
        long start = System.nanoTime();
        var result = simulator.simulate(state, probs, Map.of(), 20000, 42, Rules.MADDEN);
        System.out.printf("BENCHMARK 20,000 simulations, %d games: %.3f seconds%n", state.remainingGames().size(), (System.nanoTime() - start) / 1e9);
        assertThat(result.simulations()).isEqualTo(20000);
    }
}
