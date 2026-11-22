package com.rzs.stats.playoffs;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Nested;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.repository.TeamRepository;
import com.rzs.stats.repository.GameRepository;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.ForkJoinPool;
import java.util.stream.IntStream;

import static com.rzs.stats.playoffs.ClinchAnalyzer.*;
import static com.rzs.stats.playoffs.PlayoffSeeding.*;
import static org.junit.jupiter.api.Assertions.*;

class ClinchAdversarialTest {
    record Fixture(List<Team> teams, List<Game> games) {}
    record Case(String name, Season season) {}
    record Claim(String mode, String team, Goal goal, Marker marker) {}
    record Counts(long leagues, long outcomes, long markers, long checks) {
        Counts plus(Counts b) {
            return new Counts(leagues + b.leagues, outcomes + b.outcomes, markers + b.markers, checks + b.checks);
        }
    }

    @Test
    void fiveThroughSevenRemainingGamesWithLevelRecordsAndHeadToHeadGroups() throws Exception {
        for (int n = 5; n <= 7; n++) {
            var cases = new ArrayList<Case>();
            for (int sample = 0; sample < (n == 5 ? 10 : n == 6 ? 4 : 1); sample++)
                cases.add(new Case("balanced-n" + n + "-" + sample, balanced(n, sample)));
            verify("balanced-n" + n, cases);
        }
    }

    @Test
    void thirtyTwoTeamFixturesWithFortyRandomSubsetsPerRemainingGameCount() throws Exception {
        for (var entry : fixtures().entrySet()) {
            var f = entry.getValue();
            assertEquals(32, f.teams().size());
            assertEquals(8, f.teams().stream().map(Team::division).distinct().count());
            var random = new Random(0xAD103104L + entry.getKey().hashCode());
            var cases = new ArrayList<Case>();
            for (int k = 1; k <= 4; k++) {
                var used = new HashSet<Set<Integer>>();
                while (used.size() < 40) {
                    var indexes = new TreeSet<Integer>();
                    while (indexes.size() < k) indexes.add(random.nextInt(f.games().size()));
                    if (used.add(indexes)) cases.add(new Case(entry.getKey() + "-k" + k + "-" + indexes, remove(f, indexes)));
                }
            }
            verify(entry.getKey(), cases);
        }
    }

    @Test
    void byeWeeksAndConcentratedSchedulesIncludingGamesOutsideTheRace() throws Exception {
        var cases = new ArrayList<Case>();
        for (var entry : fixtures().entrySet()) {
            var f = entry.getValue();
            var teams = new HashMap<String, Team>();
            f.teams().forEach(t -> teams.put(t.abbr(), t));
            var finalResult = MaddenSeeding.madden27().seed(f.teams(), f.games());
            var outside = new HashSet<String>();
            finalResult.conferences().values().forEach(ranks -> ranks.stream().filter(r -> r.position() > 10)
                    .forEach(r -> outside.addAll(r.teams())));
            for (String kind : List.of("division", "cross-conference", "outside-race", "bye")) {
                var indexes = new ArrayList<Integer>();
                for (int i = 0; i < f.games().size(); i++) {
                    var g = f.games().get(i);
                    boolean eligible = switch (kind) {
                        case "division" -> teams.get(g.home()).division().equals(f.teams().getFirst().division())
                                && teams.get(g.away()).division().equals(f.teams().getFirst().division());
                        case "cross-conference" -> !teams.get(g.home()).conference().equals(teams.get(g.away()).conference());
                        case "outside-race" -> outside.contains(g.home()) && outside.contains(g.away());
                        default -> g.home().equals(f.teams().getFirst().abbr()) || g.away().equals(f.teams().getFirst().abbr());
                    };
                    if (eligible) indexes.add(i);
                }
                assertTrue(indexes.size() >= 3, entry.getKey() + " " + kind);
                for (int sample = 0; sample < 4; sample++) {
                    Collections.shuffle(indexes, new Random(501L + sample));
                    var season = remove(f, new HashSet<>(indexes.subList(0, 3)));
                    assertTrue(season.teams().stream().map(t -> season.completed().stream()
                            .filter(g -> g.home().equals(t.abbr()) || g.away().equals(t.abbr())).count()).distinct().count() > 1);
                    cases.add(new Case(entry.getKey() + "-" + kind + "-" + sample, season));
                    if (kind.equals("bye")) {
                        var incomplete = new ArrayList<>(season.completed());
                        incomplete.removeFirst();
                        cases.add(new Case(entry.getKey() + "-unlisted-bye-" + sample,
                                new Season(season.teams(), incomplete, season.remaining())));
                    }
                }
            }
        }
        verify("schedule-shapes", cases);
    }

    @Test
    void beatingTiedRivalCostsWashingtonItsSpotThroughBiggestSetRule() throws Exception {
        var f = fixtures().get("104");
        var original = MaddenSeeding.madden27().seed(f.teams(), f.games());
        assertFalse(achieved(original, "WAS", Goal.PLAYOFFS));
        assertTrue(original.trace().stream().anyMatch(t -> t.tied().equals(Set.of("WAS", "PHI", "DET"))
                && t.biggestSetFirst() && t.step() == TiebreakerRules.Step.HEAD_TO_HEAD
                && t.groupWins().get("WAS") == 2 && !t.remaining().contains("WAS")));
        var loss = IntStream.range(0, f.games().size()).filter(i -> {
            var g = f.games().get(i);
            return g.home().equals("WAS") && g.homeScore() < g.awayScore()
                    || g.away().equals("WAS") && g.awayScore() < g.homeScore();
        }).findFirst().orElseThrow();
        int head = IntStream.range(0, f.games().size()).filter(i -> {
            var g = f.games().get(i);
            return Set.of(g.home(), g.away()).equals(Set.of("WAS", "PHI"));
        }).findFirst().orElseThrow();
        verify("historical-biggest-set", List.of(new Case("104-WAS-PHI", remove(f, Set.of(head, loss)))));
    }

    @Test
    void winningAnotherHeadToHeadGameLosesDivisionAtTheSameFinalRecord() throws Exception {
        var teams = balanced(2).teams();
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
        var loseRival = new ArrayList<>(completed);
        loseRival.addAll(List.of(new Game(17, "T00", "T01", 0, 7), new Game(17, "T00", "T08", 7, 0),
                new Game(17, "T01", "T09", 0, 7)));
        var winRival = new ArrayList<>(completed);
        winRival.addAll(List.of(new Game(17, "T00", "T01", 7, 0), new Game(17, "T00", "T08", 0, 7),
                new Game(17, "T01", "T09", 7, 0)));
        var losing = MaddenSeeding.madden27().seed(teams, loseRival);
        var winning = MaddenSeeding.madden27().seed(teams, winRival);
        assertTrue(achieved(losing, "T00", Goal.DIVISION));
        assertFalse(achieved(winning, "T00", Goal.DIVISION));
        assertEquals(losing.records().get("T00").wins(), winning.records().get("T00").wins());
        verify("hand-built-non-monotonic", List.of(new Case("three-way-nine-wins", season)));
    }

    @Test
    void zeroZeroTiesAndPointDifferentialAloneCanChangeDivisionWinner() throws Exception {
        var teams = balanced(2).teams();
        var completed = new ArrayList<Game>();
        for (int week = 0; week < 16; week++) for (int t = 0; t < 8; t++)
            completed.add(new Game(week, teams.get(t).abbr(), teams.get(t + 8).abbr(), t == 4 ? 1 : 0, 0));
        for (int t = 2; t < 8; t++) completed.add(new Game(17, teams.get(t).abbr(), teams.get(t + 8).abbr(), 0, 0));
        var season = new Season(teams, completed, List.of(new Matchup(17, "T00", "T08"), new Matchup(17, "T01", "T09")));
        var games = new ArrayList<>(completed);
        games.add(new Game(17, "T00", "T08", 7, 0));
        games.add(new Game(17, "T01", "T09", 1, 0));
        assertTrue(achieved(MaddenSeeding.madden27().seed(teams, games), "T00", Goal.DIVISION));
        games.set(games.size() - 1, new Game(17, "T01", "T09", 35, 0));
        assertTrue(achieved(MaddenSeeding.madden27().seed(teams, games), "T01", Goal.DIVISION));
        verify("ties-point-title", List.of(new Case("all-ties", season)));
    }

    private void verify(String category, List<Case> cases) throws Exception {
        long start = System.nanoTime();
        var pool = new ForkJoinPool(4);
        Counts counts;
        try {
            counts = pool.submit(() -> cases.parallelStream().map(this::verify)
                    .reduce(new Counts(0, 0, 0, 0), Counts::plus)).get();
        } finally {
            pool.shutdownNow();
        }
        assertTrue(counts.outcomes() > 0);
        assertTrue(counts.markers() > 0, category + " must exercise shown markers");
        System.out.printf("Adversarial %s: %d leagues, %d outcomes, %d non-null markers, %d marker checks, %.3f s%n",
                category, counts.leagues(), counts.outcomes(), counts.markers(), counts.checks(), (System.nanoTime() - start) / 1e9);
    }

    private Counts verify(Case c) {
        var s = c.season();
        var records = analyze(s, games -> { throw new AssertionError("Layer 1 called seeder"); }, Duration.ZERO);
        var full = analyze(s, games -> MaddenSeeding.madden27().seed(s.teams(), games), Duration.ofSeconds(20));
        boolean complete = s.teams().stream().allMatch(t -> s.completed().stream()
                .filter(g -> g.home().equals(t.abbr()) || g.away().equals(t.abbr())).count()
                + s.remaining().stream().filter(g -> g.home().equals(t.abbr()) || g.away().equals(t.abbr())).count() == 17);
        assertEquals(complete, full.exhaustive(), c.name());
        var claims = new ArrayList<Claim>();
        for (var mode : Map.of("layer1", records, "layer2", full).entrySet())
            mode.getValue().markers().forEach((team, goals) -> goals.forEach((goal, marker) -> {
                if (marker != Marker.NONE) claims.add(new Claim(mode.getKey(), team, goal, marker));
            }));
        long outcomes = IntStream.range(0, 7).parallel().mapToLong(first -> {
            var games = new ArrayList<>(s.completed());
            games.add(outcome(s.remaining().getFirst(), first));
            return enumerate(c, games, 1, claims);
        }).sum();
        return new Counts(1, outcomes, claims.size(), outcomes * claims.size());
    }

    private long enumerate(Case c, ArrayList<Game> games, int depth, List<Claim> claims) {
        if (depth < c.season().remaining().size()) {
            long count = 0;
            for (int choice = 0; choice < 7; choice++) {
                games.add(outcome(c.season().remaining().get(depth), choice));
                count += enumerate(c, games, depth + 1, claims);
                games.removeLast();
            }
            return count;
        }
        var result = MaddenSeeding.madden27().seed(c.season().teams(), games);
        var positions = new HashMap<String, Integer>();
        result.conferences().values().forEach(ranks -> ranks.forEach(r -> r.teams().forEach(t -> positions.put(t, r.position()))));
        for (var claim : claims) {
            boolean actual = claim.goal() == Goal.DIVISION ? result.divisionRanks().get(claim.team()).position() == 1
                    : positions.get(claim.team()) <= (claim.goal() == Goal.ONE_SEED ? 1 : 7);
            if (actual != (claim.marker() == Marker.CLINCHED))
                fail(c.name() + " " + claim + " season=" + c.season() + " violating completion="
                        + games.subList(c.season().completed().size(), games.size()));
        }
        return 1;
    }

    private static Game outcome(Matchup g, int choice) {
        int margin = choice == 6 ? 0 : new int[]{1, 7, 35}[choice % 3];
        return new Game(g.week(), g.home(), g.away(), choice < 3 ? margin : 0, choice >= 3 && choice < 6 ? margin : 0);
    }

    private static Season remove(Fixture f, Set<Integer> indexes) {
        var completed = new ArrayList<Game>();
        var remaining = new ArrayList<Matchup>();
        for (int i = 0; i < f.games().size(); i++) {
            var g = f.games().get(i);
            if (indexes.contains(i)) remaining.add(new Matchup(g.week(), g.home(), g.away()));
            else completed.add(g);
        }
        return new Season(f.teams(), completed, remaining);
    }

    private static Season balanced(int n) { return balanced(n, 0); }

    private static Season balanced(int n, int sample) {
        var teams = ClinchOracleTest.league(1, 0, true).teams();
        var completed = new ArrayList<Game>();
        int[][] pairs = {{0, 1, 2, 3}, {0, 2, 1, 3}, {0, 3, 1, 2}};
        for (int week = 0; week < 16; week++) for (int division = 0; division < 4; division++) {
            var p = pairs[(week / 2) % 3];
            for (int j = 0; j < 4; j += 2) {
                String home = teams.get(division * 4 + p[j]).abbr(), away = teams.get(division * 4 + p[j + 1]).abbr();
                int hs = week % 2 == 0 ? 7 + sample : 0, as = week % 2 == 0 ? 0 : 7 + sample;
                if (division == 3 && home.equals("T12")) { hs = 35; as = 0; }
                if (division == 3 && away.equals("T12")) { hs = 0; as = 35; }
                completed.add(new Game(week, home, away, hs, as));
            }
        }
        var remaining = new ArrayList<Matchup>();
        var opponents = new ArrayList<>(teams.subList(8, 16));
        Collections.shuffle(opponents, new Random(813L + sample));
        for (int i = 0; i < 8; i++) {
            var g = new Matchup(17, teams.get(i).abbr(), opponents.get(i).abbr());
            if (i < n) remaining.add(g);
            else completed.add(new Game(17, g.home(), g.away(), 0, 0));
        }
        return new Season(teams, completed, remaining);
    }

    @Nested
    @DataJpaTest(showSql = false)
    class ServiceBoundary {
        @Autowired TeamRepository teams;
        @Autowired GameRepository games;

        @Test
        void realDatabaseServiceRowsRemainSoundWithDefaultSearchAndRecordOnlyRules() throws Exception {
            var f = fixtures().get("104");
            var entities = new HashMap<String, TeamEntity>();
            for (var t : f.teams()) {
                var entity = new TeamEntity();
                entity.setTeamId(entities.size() + 1);
                entity.setAbbrName(t.abbr());
                entity.setDisplayName(t.abbr());
                entity.setConference(t.conference());
                entity.setDivision(t.division());
                entities.put(t.abbr(), teams.save(entity));
            }
            var indexes = new TreeSet<Integer>();
            var random = new Random(10432);
            while (indexes.size() < 4) indexes.add(random.nextInt(f.games().size()));
            for (int i = 0; i < f.games().size(); i++) {
                var g = f.games().get(i);
                var entity = new GameEntity();
                entity.setGameId(i + 1);
                entity.setSeasonIndex(104);
                entity.setStageIndex(1);
                entity.setWeekIndex(g.week());
                entity.setHomeTeam(entities.get(g.home()));
                entity.setAwayTeam(entities.get(g.away()));
                entity.setStatus(indexes.contains(i) ? 1 : 2);
                entity.setHomeScore(indexes.contains(i) ? null : g.homeScore());
                entity.setAwayScore(indexes.contains(i) ? null : g.awayScore());
                games.save(entity);
            }
            games.flush();
            var c = new Case("service-104-" + indexes, remove(f, indexes));
            var claims = new ArrayList<Claim>();
            var loader = new SeasonStateLoader(games);
            for (var rules : List.of("madden", "nfl")) {
                for (var budget : List.of(Duration.ZERO, Duration.ofSeconds(20))) {
                    var response = new ClinchService(loader, 12, budget).clinch(104, rules);
                    assertEquals(32, response.teams().size());
                    assertEquals(rules.equals("madden") && !budget.isZero(), response.exhaustive());
                    for (var row : response.teams()) {
                        var values = new String[]{row.playoffs(), row.division(), row.oneSeed()};
                        for (var goal : Goal.values()) if (values[goal.ordinal()] != null)
                            claims.add(new Claim(rules + "-" + budget, row.team().abbrName(), goal,
                                    Marker.valueOf(values[goal.ordinal()].toUpperCase(Locale.ROOT))));
                    }
                }
            }
            assertFalse(claims.isEmpty());
            long start = System.nanoTime();
            long outcomes = enumerate(c, new ArrayList<>(c.season().completed()), 0, claims);
            System.out.printf("Adversarial service: 1 league, %d outcomes, %d non-null markers, %d marker checks, %.3f s%n",
                    outcomes, claims.size(), outcomes * claims.size(), (System.nanoTime() - start) / 1e9);
        }
    }

    private Map<String, Fixture> fixtures() throws Exception {
        var mapper = new ObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        Map<String, Fixture> result;
        try (var in = getClass().getResourceAsStream("/playoffs/rzs-seasons.json")) {
            result = mapper.readValue(in, new TypeReference<>() {});
        }
        try (var in = getClass().getResourceAsStream("/playoffs/sim-full-season.json")) {
            result.put("sim", mapper.readValue(in, Fixture.class));
        }
        return result;
    }
}
