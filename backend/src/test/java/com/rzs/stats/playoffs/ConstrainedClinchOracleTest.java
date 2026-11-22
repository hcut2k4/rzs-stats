package com.rzs.stats.playoffs;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.*;

import static com.rzs.stats.playoffs.ClinchAnalyzer.*;
import static com.rzs.stats.playoffs.PlayoffSeeding.*;
import static org.junit.jupiter.api.Assertions.*;

class ConstrainedClinchOracleTest {
    private long outcomes, checks, markers, additional;
    record Fixture(List<Team> teams, List<Game> games) {}

    @Test
    void forcedWinsPreserveEveryProvenMarkerAcrossUnknownMarginsAndOtherResults() throws Exception {
        for (int i = 0; i < 120; i++) {
            var season = ClinchOracleTest.league(0x50415448L + i, 1 + i % 4, i % 2 == 0);
            String team = i % 3 == 0 ? season.remaining().getFirst().away() : season.remaining().getFirst().home();
            verify(season, team);
        }
        var mapper = new ObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        Map<String, Fixture> fixtures;
        try (var in = getClass().getResourceAsStream("/playoffs/rzs-seasons.json")) {
            fixtures = mapper.readValue(in, new TypeReference<>() {});
        }
        var f = fixtures.get("104");
        var head = f.games().stream().filter(g -> Set.of(g.home(), g.away()).equals(Set.of("WAS", "PHI"))).toList();
        for (var game : head) {
            var completed = new ArrayList<>(f.games()); completed.remove(game);
            var season = new Season(f.teams(), completed, List.of(new Matchup(game.week(), game.home(), game.away())));
            verify(season, "WAS");
            var analysis = analyze(season, gs -> MaddenSeeding.madden27().seed(f.teams(), gs), Duration.ofSeconds(20), 12,
                    wins(season, "WAS"));
            assertNotEquals(Marker.CLINCHED, analysis.markers().get("WAS").get(Goal.PLAYOFFS));
        }
        assertTrue(markers > 0);
        assertTrue(additional > 0);
        System.out.printf("Constrained oracle: %d leagues, %d outcomes, %d markers, %d checks, %d search additions%n",
                120 + head.size(), outcomes, markers, checks, additional);
    }

    static Map<Matchup, SimulationService.Outcome> wins(Season season, String team) {
        var forced = new HashMap<Matchup, SimulationService.Outcome>();
        for (var g : season.remaining()) {
            if (g.home().equals(team)) forced.put(g, SimulationService.Outcome.HOME);
            else if (g.away().equals(team)) forced.put(g, SimulationService.Outcome.AWAY);
        }
        return forced;
    }

    private void verify(Season season, String team) {
        var forced = wins(season, team);
        var full = analyze(season, gs -> MaddenSeeding.madden27().seed(season.teams(), gs), Duration.ofSeconds(20), 12, forced);
        var records = analyze(season, gs -> { throw new AssertionError("Layer 1 called seeder"); }, Duration.ZERO, 12, forced);
        assertTrue(full.exhaustive());
        markers += ClinchOracleTest.count(full) + ClinchOracleTest.count(records);
        additional += ClinchOracleTest.count(full) - ClinchOracleTest.count(records);
        enumerate(season, forced, new ArrayList<>(season.completed()), 0, List.of(full, records));
    }

    private void enumerate(Season season, Map<Matchup, SimulationService.Outcome> forced, ArrayList<Game> games,
                           int depth, List<Analysis> analyses) {
        if (depth < season.remaining().size()) {
            var g = season.remaining().get(depth);
            for (int choice = 0; choice < 7; choice++) {
                var outcome = choice < 3 ? SimulationService.Outcome.HOME : choice < 6 ? SimulationService.Outcome.AWAY : SimulationService.Outcome.TIE;
                if (forced.containsKey(g) && forced.get(g) != outcome) continue;
                int margin = choice == 6 ? 1 : new int[]{1, 7, 35}[choice % 3];
                games.add(SimulationService.outcomeGame(g.week(), g.home(), g.away(), outcome, margin));
                enumerate(season, forced, games, depth + 1, analyses);
                games.removeLast();
            }
            return;
        }
        outcomes++;
        var result = MaddenSeeding.madden27().seed(season.teams(), games);
        for (var analysis : analyses) analysis.markers().forEach((t, goals) -> goals.forEach((goal, marker) -> {
            if (marker == Marker.NONE) return;
            checks++;
            assertEquals(marker == Marker.CLINCHED, achieved(result, t, goal), () -> t + " " + goal + " " + season + " " + games);
        }));
    }

    @Test
    void handBuiltThreeWayRaceRemainsSoundWhenHeadToHeadWinsAreForced() {
        var teams = ClinchOracleTest.league(1, 0, true).teams();
        var completed = new ArrayList<Game>(List.of(new Game(0, "T00", "T02", 7, 0),
                new Game(1, "T01", "T00", 7, 0), new Game(2, "T02", "T01", 7, 0)));
        var remaining = List.of(new Matchup(17, "T00", "T01"), new Matchup(17, "T00", "T08"),
                new Matchup(17, "T01", "T09"));
        var capacity = new HashMap<String, Integer>();
        teams.forEach(t -> capacity.put(t.abbr(), 17));
        completed.forEach(g -> { capacity.merge(g.home(), -1, Integer::sum); capacity.merge(g.away(), -1, Integer::sum); });
        remaining.forEach(g -> { capacity.merge(g.home(), -1, Integer::sum); capacity.merge(g.away(), -1, Integer::sum); });
        for (int t = 0; t < 3; t++) {
            String team = teams.get(t).abbr();
            int count = capacity.get(team);
            for (int i = 0; i < count; i++) {
                String opponent = teams.subList(8, 16).stream().map(Team::abbr)
                        .max(Comparator.comparingInt(capacity::get)).orElseThrow();
                completed.add(new Game(i % 18, team, opponent, i < (t == 2 ? 8 : 7) ? 7 : 0,
                        i < (t == 2 ? 8 : 7) ? 0 : 7));
                capacity.merge(team, -1, Integer::sum); capacity.merge(opponent, -1, Integer::sum);
            }
        }
        while (capacity.values().stream().mapToInt(Integer::intValue).sum() > 0) {
            var pair = capacity.keySet().stream().filter(t -> capacity.get(t) > 0)
                    .sorted(Comparator.<String>comparingInt(capacity::get).reversed().thenComparing(t -> t)).limit(2).toList();
            assertEquals(2, pair.size());
            completed.add(new Game(0, pair.get(0), pair.get(1), 0, 0));
            pair.forEach(t -> capacity.merge(t, -1, Integer::sum));
        }
        var season = new Season(teams, completed, remaining);
        verify(season, "T00");
        verify(season, "T01");
        verify(season, "T08");
        System.out.printf("Constrained hand-built oracle: 3 constraints, %d outcomes, %d checks%n", outcomes, checks);
    }

    @Test
    void forcedWinsCountInBothBoundsWhenSearchIsDisabled() {
        var season = new Season(List.of(new Team("A", "AFC", "East"), new Team("B", "AFC", "East")),
                java.util.stream.IntStream.range(0, 16).mapToObj(w -> new Game(w, "A", "B", w < 8 ? 7 : 0, w < 8 ? 0 : 7)).toList(),
                List.of(new Matchup(17, "A", "B")));
        var analysis = analyze(season, gs -> { throw new AssertionError(); }, Duration.ZERO, 0, wins(season, "A"));
        assertFalse(analysis.exhaustive());
        assertEquals(Marker.CLINCHED, analysis.markers().get("A").get(Goal.DIVISION));
        assertEquals(Marker.ELIMINATED, analysis.markers().get("B").get(Goal.DIVISION));
    }
}
