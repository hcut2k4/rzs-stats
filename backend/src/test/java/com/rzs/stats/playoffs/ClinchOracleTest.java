package com.rzs.stats.playoffs;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.*;

import static com.rzs.stats.playoffs.ClinchAnalyzer.*;
import static com.rzs.stats.playoffs.PlayoffSeeding.*;
import static org.junit.jupiter.api.Assertions.*;

class ClinchOracleTest {
    private long outcomes, checked, nonNull, layerOneNonNull, additional;

    @Test
    void everyProvenMarkerHoldsAcrossIndependentOutcomesAndMargins() {
        for (int seed = 0; seed < 300; seed++) {
            var season = league(0x43544cL + seed, 1 + seed % 4, seed % 2 == 0);
            var full = analyze(season, games -> MaddenSeeding.madden27().seed(season.teams(), games), Duration.ofSeconds(20));
            var records = analyze(season, games -> { throw new AssertionError("Record math called seeder"); }, Duration.ZERO);
            assertTrue(full.exhaustive(), "seed " + seed);
            nonNull += count(full); layerOneNonNull += count(records);
            additional += count(full) - count(records);
            enumerate(season, new ArrayList<>(season.completed()), 0, full, records, seed);
            implications(full);
        }
        assertTrue(nonNull > 0);
        assertTrue(layerOneNonNull > 0);
        assertTrue(additional > 0, "Oracle must exercise markers proved by search");
        System.out.printf("Clinch oracle: 300 leagues, %d outcomes, %d marker checks, %d non-null exhaustive markers, %d record markers, %d additional markers%n",
                outcomes, checked, nonNull, layerOneNonNull, additional);
    }

    private void enumerate(Season season, ArrayList<Game> games, int depth, Analysis full, Analysis records, int seed) {
        if (depth < season.remaining().size()) {
            var matchup = season.remaining().get(depth);
            for (int outcome = 0; outcome < 7; outcome++) {
                int margin = outcome == 6 ? 0 : new int[]{1, 7, 35}[outcome % 3];
                games.add(new Game(matchup.week(), matchup.home(), matchup.away(), outcome < 3 ? margin : 0,
                        outcome >= 3 && outcome < 6 ? margin : 0));
                enumerate(season, games, depth + 1, full, records, seed);
                games.removeLast();
            }
            return;
        }
        outcomes++;
        var result = MaddenSeeding.madden27().seed(season.teams(), games);
        for (var analysis : List.of(full, records)) {
            analysis.markers().forEach((team, goals) -> goals.forEach((goal, marker) -> {
                if (marker == Marker.NONE) return;
                boolean actual;
                if (goal == Goal.DIVISION) actual = result.divisionRanks().get(team).position() == 1;
                else {
                    int position = result.conferences().values().stream().flatMap(Collection::stream)
                            .filter(r -> r.teams().contains(team)).findFirst().orElseThrow().position();
                    actual = position <= (goal == Goal.ONE_SEED ? 1 : 7);
                }
                checked++;
                if (actual != (marker == Marker.CLINCHED))
                    fail("seed " + seed + " " + team + " " + goal + " " + marker + " games " + games);
            }));
        }
    }

    static long count(Analysis analysis) {
        return analysis.markers().values().stream().flatMap(m -> m.values().stream()).filter(m -> m != Marker.NONE).count();
    }

    static void implications(Analysis analysis) {
        analysis.markers().values().forEach(m -> {
            if (m.get(Goal.ONE_SEED) == Marker.CLINCHED) assertEquals(Marker.CLINCHED, m.get(Goal.DIVISION));
            if (m.get(Goal.DIVISION) == Marker.CLINCHED) assertEquals(Marker.CLINCHED, m.get(Goal.PLAYOFFS));
            if (m.get(Goal.PLAYOFFS) == Marker.ELIMINATED) assertEquals(Marker.ELIMINATED, m.get(Goal.DIVISION));
            if (m.get(Goal.DIVISION) == Marker.ELIMINATED) assertEquals(Marker.ELIMINATED, m.get(Goal.ONE_SEED));
        });
    }

    static Season league(long seed, int remainingCount, boolean balanced) {
        var random = new Random(seed);
        var teams = new ArrayList<Team>();
        for (int i = 0; i < 16; i++) teams.add(new Team("T%02d".formatted(i), i < 8 ? "AFC" : "NFC", "D" + i / 4));
        var completed = new ArrayList<Game>();
        var names = new ArrayList<>(teams.stream().map(Team::abbr).toList());
        for (int round = 0; round < 8; round++) {
            Collections.shuffle(names, random);
            for (int i = 0; i < 16; i += 2) {
                String home = names.get(i), away = names.get(i + 1);
                int hs = random.nextInt(36), as = random.nextInt(36);
                completed.add(new Game(round * 2, home, away, hs, as));
                completed.add(new Game(round * 2 + 1, home, away, balanced ? as : random.nextInt(36), balanced ? hs : random.nextInt(36)));
            }
        }
        Collections.shuffle(names, random);
        var remaining = new ArrayList<Matchup>();
        for (int i = 0; i < 8; i++) {
            String home = names.get(i * 2), away = names.get(i * 2 + 1);
            if (i < remainingCount) remaining.add(new Matchup(17, home, away));
            else completed.add(new Game(17, home, away, random.nextInt(36), random.nextInt(36)));
        }
        return new Season(teams, completed, remaining);
    }
}
