package com.rzs.stats.playoffs;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.*;

import static com.rzs.stats.playoffs.ClinchAnalyzer.*;
import static com.rzs.stats.playoffs.PlayoffSeeding.*;
import static org.junit.jupiter.api.Assertions.*;

class ClinchAnalyzerTest {
    record Fixture(List<Team> teams, List<Game> games, Map<String, List<String>> maddenSeeds) {}
    private Analysis run(Season season) {
        return analyze(season, games -> MaddenSeeding.madden27().seed(season.teams(), games), Duration.ofSeconds(20));
    }

    @Test
    void incompleteScheduleUsesOnlyConservativeRecordMath() {
        var full = ClinchOracleTest.league(1, 2, true);
        var incomplete = new Season(full.teams(), full.completed().subList(1, full.completed().size()), full.remaining());
        var result = analyze(incomplete, games -> { throw new AssertionError("Incomplete schedule seeded"); }, Duration.ofSeconds(1));
        assertFalse(result.exhaustive());
    }

    @Test
    void capAndExpiredBudgetReturnOnlyRecordMath() {
        var season = ClinchOracleTest.league(2, 4, false);
        var baseline = analyze(season, games -> { throw new AssertionError(); }, Duration.ZERO);
        assertEquals(baseline.markers(), analyze(season, games -> { throw new AssertionError(); }, Duration.ofSeconds(1), 3).markers());
        var timed = analyze(season, games -> {
            long end = System.nanoTime() + Duration.ofMillis(30).toNanos();
            while (System.nanoTime() < end) Thread.onSpinWait();
            return MaddenSeeding.madden27().seed(season.teams(), games);
        }, Duration.ofMillis(1));
        assertFalse(timed.exhaustive());
        assertEquals(baseline.markers(), timed.markers());
    }

    @Test
    void alphabeticalFallbackWithIdenticalResultsCannotProveDivisionTitle() {
        var season = marginSeason(false);
        var equal = new ArrayList<>(season.completed());
        season.remaining().forEach(g -> equal.add(new Game(g.week(), g.home(), g.away(), 1, 0)));
        var seeded = MaddenSeeding.madden27().seed(season.teams(), equal);
        assertTrue(seeded.pointTies().stream().anyMatch(t -> t.divisionTitle() && t.step() == TiebreakerRules.Step.ALPHABETICAL
                && t.tied().containsAll(Set.of("T00", "T01"))));
        assertEquals(1, seeded.divisionRanks().get("T00").position());
        equal.set(equal.size() - 1, new Game(17, "T01", "T09", 35, 0));
        assertEquals(1, MaddenSeeding.madden27().seed(season.teams(), equal).divisionRanks().get("T01").position());
        var result = run(season);
        assertTrue(result.exhaustive());
        assertEquals(Marker.NONE, result.markers().get("T00").get(Goal.DIVISION));
        assertEquals(Marker.NONE, result.markers().get("T01").get(Goal.DIVISION));
    }

    @Test
    void completedAlphabeticalFallbackUsesExactFinalOrder() {
        var source = marginSeason(false);
        var games = new ArrayList<>(source.completed());
        source.remaining().forEach(g -> games.add(new Game(g.week(), g.home(), g.away(), 0, 0)));
        var result = run(new Season(source.teams(), games, List.of()));
        var seeded = MaddenSeeding.madden27().seed(source.teams(), games);
        for (var team : source.teams()) for (var goal : Goal.values())
            assertEquals(ClinchAnalyzer.achieved(seeded, team.abbr(), goal) ? Marker.CLINCHED : Marker.ELIMINATED,
                    result.markers().get(team.abbr()).get(goal));
    }

    @Test
    void nflReportsUnsplitMarginStepsAndUnresolvedDivisionTies() {
        var teams = List.of(new Team("A", "AFC", "East"), new Team("B", "AFC", "East"));
        var games = new ArrayList<Game>();
        for (int week = 0; week < 17; week++) games.add(new Game(week, "A", "B", 0, 0));
        var result = PlayoffSeeding.seed(teams, games);
        assertTrue(result.unresolvedConferences().containsKey("AFC"));
        for (var step : List.of(TiebreakerRules.Step.COMBINED_RANKING_CONFERENCE,
                TiebreakerRules.Step.COMBINED_RANKING_ALL, TiebreakerRules.Step.NET_POINTS_COMMON,
                TiebreakerRules.Step.NET_POINTS_ALL, TiebreakerRules.Step.NET_TOUCHDOWNS))
            assertTrue(result.pointTies().stream().anyMatch(t -> t.step() == step && t.divisionTitle()
                    && t.conference().equals("AFC") && t.tied().equals(Set.of("A", "B"))));
    }

    @Test
    void unknownMarginsCannotProvePointDifferentialDivisionTitle() {
        var season = marginSeason(true);
        var result = run(season);
        assertEquals(Marker.NONE, result.markers().get("T00").get(Goal.DIVISION));
        assertEquals(Marker.NONE, result.markers().get("T01").get(Goal.DIVISION));
    }

    private Season marginSeason(boolean differential) {
        var teams = ClinchOracleTest.league(1, 0, true).teams();
        var games = new ArrayList<Game>();
        for (int week = 0; week < 16; week++) for (int t = 0; t < 8; t++) {
            int hs = 0, as = 0;
            if (differential && t < 2 && week < 2) {
                hs = week == 0 ? (t == 0 ? 35 : 1) : 0;
                as = week == 1 ? 1 : 0;
            }
            games.add(new Game(week, "T%02d".formatted(t), "T%02d".formatted(t + 8), hs, as));
        }
        for (int t = 2; t < 8; t++) games.add(new Game(17, "T%02d".formatted(t), "T%02d".formatted(t + 8), 0, 0));
        return new Season(teams, games, List.of(new Matchup(17, "T00", "T08"), new Matchup(17, "T01", "T09")));
    }

    @Test
    void completedHistoricalSeasonsMarkExactlyTheirFinalResults() throws Exception {
        for (var fixture : fixtures().values()) {
            var season = new Season(fixture.teams(), fixture.games(), List.of());
            var result = run(season);
            var seeded = MaddenSeeding.madden27().seed(season.teams(), season.completed());
            assertTrue(result.exhaustive());
            for (var team : season.teams()) for (var goal : Goal.values()) {
                assertEquals(ClinchAnalyzer.achieved(seeded, team.abbr(), goal) ? Marker.CLINCHED : Marker.ELIMINATED,
                        result.markers().get(team.abbr()).get(goal), team.abbr() + " " + goal);
            }
            ClinchOracleTest.implications(result);
        }
    }

    @Test
    void washingtonSweepingTiedRivalDoesNotEstablishPlayoffClinch() throws Exception {
        var fixture = fixtures().get("104");
        var original = MaddenSeeding.madden27().seed(fixture.teams(), fixture.games());
        assertFalse(ClinchAnalyzer.achieved(original, "WAS", Goal.PLAYOFFS));
        assertTrue(original.trace().stream().anyMatch(t -> t.tied().equals(Set.of("WAS", "PHI", "DET"))
                && t.step() == TiebreakerRules.Step.HEAD_TO_HEAD && t.biggestSetFirst()
                && t.groupWins().get("WAS") == 2 && !t.remaining().contains("WAS")));
        var h2h = fixture.games().stream().filter(g -> Set.of(g.home(), g.away()).equals(Set.of("WAS", "PHI")))
                .findFirst().orElseThrow();
        var loss = fixture.games().stream().filter(g -> g.home().equals("WAS") && g.homeScore() < g.awayScore()
                || g.away().equals("WAS") && g.awayScore() < g.homeScore()).findFirst().orElseThrow();
        var games = new ArrayList<>(fixture.games());
        games.remove(h2h); games.remove(loss);
        var remaining = List.of(new Matchup(h2h.week(), h2h.home(), h2h.away()),
                new Matchup(loss.week(), loss.home(), loss.away()));
        var season = new Season(fixture.teams(), games, remaining);
        var result = run(season);
        assertTrue(result.exhaustive());
        assertEquals(Marker.NONE, result.markers().get("WAS").get(Goal.PLAYOFFS));
    }

    @Test
    void seventhBestRecordCanMissBehindWeakerDivisionWinner() {
        var teams = new ArrayList<Team>();
        for (int i = 0; i < 16; i++) teams.add(new Team("A" + i, "AFC", "D" + i / 4));
        for (int i = 0; i < 16; i++) teams.add(new Team("N" + i, "NFC", "D" + i / 4));
        int[] wins = {14, 12, 11, 10, 13, 12, 9, 0, 8, 7, 6, 5, 8, 7, 6, 5};
        var games = new ArrayList<Game>();
        for (int t = 0; t < 16; t++) for (int week = 0; week < 17; week++)
            games.add(new Game(week, "A" + t, "N" + t, week < wins[t] ? 1 : 0, week < wins[t] ? 0 : 1));
        var season = new Season(teams, games, List.of());
        var records = analyze(season, g -> { throw new AssertionError(); }, Duration.ZERO);
        assertNotEquals(Marker.CLINCHED, records.markers().get("A6").get(Goal.PLAYOFFS));
        assertFalse(ClinchAnalyzer.achieved(MaddenSeeding.madden27().seed(teams, games), "A6", Goal.PLAYOFFS));
    }

    @Test
    void reportsSearchRuntimeAtConfiguredSizes() {
        for (int n : List.of(8, 10, 12)) {
            var source = ClinchOracleTest.league(42, 8, true);
            var games = new ArrayList<>(source.completed());
            var remaining = new ArrayList<>(source.remaining());
            while (remaining.size() < n) {
                var game = games.removeLast();
                remaining.add(new Matchup(game.week(), game.home(), game.away()));
            }
            var season = new Season(source.teams(), games, remaining);
            long start = System.nanoTime();
            var result = run(season);
            System.out.printf("Clinch benchmark n=%d: %.3f s, seeded=%d, exhaustive=%s, markers=%d%n",
                    n, (System.nanoTime() - start) / 1e9, result.seeded(), result.exhaustive(), ClinchOracleTest.count(result));
        }
    }

    private Map<String, Fixture> fixtures() throws Exception {
        try (var input = getClass().getResourceAsStream("/playoffs/rzs-seasons.json")) {
            return new ObjectMapper().readValue(input, new TypeReference<>() {});
        }
    }
}
