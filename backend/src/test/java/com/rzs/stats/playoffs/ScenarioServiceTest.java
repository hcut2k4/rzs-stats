package com.rzs.stats.playoffs;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rzs.stats.service.EloService;
import org.junit.jupiter.api.Test;
import java.util.*;
import java.util.stream.IntStream;
import static com.rzs.stats.playoffs.ClinchAnalyzer.*;
import static com.rzs.stats.playoffs.PlayoffSeeding.*;
import static com.rzs.stats.playoffs.ScenarioService.*;
import static org.junit.jupiter.api.Assertions.*;

class ScenarioServiceTest {
    private final ScenarioService service = new ScenarioService();

    static SeasonStateLoader.State state(Season season) {
        var ids = new HashMap<String, EloService.Team>();
        for (var t : season.teams()) ids.put(t.abbr(), new EloService.Team(ids.size(), t.abbr(), "Team " + t.abbr()));
        var remaining = IntStream.range(0, season.remaining().size()).mapToObj(i -> {
            var g = season.remaining().get(i);
            return new SeasonStateLoader.RemainingGame(i, g.week(), g.home(), g.away(), 0, 0);
        }).toList();
        return new SeasonStateLoader.State(1, season.teams(), ids, season.completed(), remaining, 16, 17);
    }

    @Test
    void primeConditionsCoverExactlyTheProvenOutcomesInRandomRealEngineLeagues() {
        int open = 0;
        for (int seed = 0; seed < 60; seed++) {
            var season = ClinchOracleTest.league(seed + 143L, 1 + seed % 4, seed % 2 == 0);
            var state = state(season);
            String team = season.teams().get(seed % 16).abbr();
            for (var rules : List.of("madden", "nfl")) {
                var actual = service.scenarios(state, team, rules);
                var goals = List.of(actual.goals().playoffs(), actual.goals().division(), actual.goals().oneSeed());
                for (int a = 0; a < 1 << season.remaining().size(); a++) {
                    var games = new ArrayList<>(season.completed());
                    for (int i = 0; i < season.remaining().size(); i++) games.add(outcome(season.remaining().get(i), (a & (1 << i)) != 0 ? 0 : 1));
                    var result = rules.equals("madden") ? MaddenSeeding.madden27().seed(season.teams(), games) : PlayoffSeeding.seedForPicture(season.teams(), games);
                    var future = new HashSet<String>();
                    season.remaining().forEach(g -> { future.add(g.home()); future.add(g.away()); });
                    boolean unknown = ambiguousConferences(result, future).contains(season.teams().get(seed % 16).conference());
                    for (var goal : Goal.values()) {
                        var row = goals.get(goal.ordinal());
                        boolean in = !unknown && achieved(result, team, goal), out = !unknown && !achieved(result, team, goal);
                        if (row.status().equals("open")) {
                            open++;
                            checkCoverage(row.clinchedBy(), state, a, in);
                            checkCoverage(row.eliminatedBy(), state, a, out);
                        } else assertEquals(row.status().equals("in") ? in : out, true);
                    }
                }
            }
        }
        assertTrue(open > 0);
    }

    private void checkCoverage(List<Entry> entries, SeasonStateLoader.State state, int assignment, boolean expected) {
        assertTrue(entries.size() < 6, "Coverage fixture must avoid truncation");
        assertEquals(expected, entries.stream().anyMatch(e -> matches(e.conditions(), state, assignment)));
        for (var e : entries) for (var c : e.conditions()) {
            var relaxed = new ArrayList<>(e.conditions()); relaxed.remove(c);
            assertTrue(IntStream.range(0, 1 << state.remainingGames().size()).anyMatch(a ->
                    matches(relaxed, state, a) && !entries.stream().anyMatch(other -> matches(other.conditions(), state, a))),
                    "Removing any condition must include an unproven outcome");
        }
    }

    private boolean matches(List<Condition> conditions, SeasonStateLoader.State state, int assignment) {
        return conditions.stream().allMatch(c -> {
            var g = state.remainingGames().get(c.gameId());
            return c.winner().equals((assignment & (1 << c.gameId())) != 0 ? g.home() : g.away());
        });
    }

    private Season race() {
        var teams = List.of(new Team("A", "AFC", "East"), new Team("B", "AFC", "East"));
        var games = new ArrayList<Game>();
        for (int w = 0; w < 16; w++) games.add(new Game(w, "A", "B", w < 8 ? 7 : 0, w < 8 ? 0 : 7));
        return new Season(teams, games, List.of(new Matchup(17, "A", "B")));
    }

    @Test
    void everyTeamSharesOneEnumerationAndMatchesIndependentPerTeamClassification() {
        var season = ClinchOracleTest.league(294, 4, true);
        var state = state(season);
        var caches = new org.springframework.cache.caffeine.CaffeineCacheManager();
        try (var resource = new ComputeGate(2, 1000, 30000)) {
            var shared = new ScenarioService(caches, resource);
            SimulationService.resetSeedings();
            for (var team : season.teams()) shared.scenarios(state, team.abbr(), "madden");
            assertEquals(1 << season.remaining().size(), SimulationService.seedings());
            var all = classifyAll(season, "madden");
            for (var team : season.teams()) {
                var values = new Classification[Goal.values().length][1 << season.remaining().size()];
                var future = new HashSet<String>();
                season.remaining().forEach(g -> { future.add(g.home()); future.add(g.away()); });
                for (int a = 0; a < values[0].length; a++) {
                    var games = new ArrayList<>(season.completed());
                    for (int j = 0; j < season.remaining().size(); j++) games.add(outcome(season.remaining().get(j), (a & (1 << j)) != 0 ? 0 : 1));
                    var result = MaddenSeeding.madden27().seed(season.teams(), games);
                    boolean unknown = ambiguousConferences(result, future).contains(team.conference());
                    for (var goal : Goal.values()) values[goal.ordinal()][a] = unknown ? Classification.UNKNOWN
                            : achieved(result, team.abbr(), goal) ? Classification.IN : Classification.OUT;
                }
                assertArrayEquals(values, all.get(team.abbr()));
                var actual = shared.scenarios(state, team.abbr(), "madden");
                assertEquals(new Goals(describe(state, values[0]), describe(state, values[1]), describe(state, values[2])), actual.goals());
            }
        }
    }

    @Test
    void oneFinalWinClinchesAndUsesWinnerFirstDisplayNames() {
        for (var rules : List.of("madden", "nfl")) {
            var result = service.scenarios(state(race()), "A", rules);
            assertEquals("open", result.goals().division().status());
            assertEquals(List.of(new Entry("Team A beat Team B", List.of(new Condition(0, "A")))), result.goals().division().clinchedBy());
            assertEquals("Team B beat Team A", result.goals().division().eliminatedBy().getFirst().text());
        }
    }

    @Test
    void zeroOrSeventeenRemainingGamesAndIncompleteSchedulesAreInapplicable() {
        var season = race();
        assertNull(service.scenarios(state(new Season(season.teams(), season.completed(), List.of())), "A", "madden"));
        assertNull(service.scenarios(state(new Season(season.teams(), List.of(), Collections.nCopies(17, season.remaining().getFirst()))), "A", "madden"));
        assertNull(service.scenarios(state(new Season(season.teams(), season.completed().subList(1, 16), season.remaining())), "A", "madden"));
    }

    @Test
    void marginDependentOutcomesMakeNoClaim() {
        var teams = ClinchOracleTest.league(1, 0, true).teams();
        var games = new ArrayList<Game>();
        for (int w = 0; w < 17; w++) for (int t = 0; t < 8; t++)
            if (w != 16 || t >= 2) games.add(new Game(w, "T%02d".formatted(t), "T%02d".formatted(t + 8), 0, 0));
        var season = new Season(teams, games, List.of(new Matchup(17, "T00", "T08"), new Matchup(17, "T01", "T09")));
        var values = classify(season, "T00", "madden");
        assertEquals(Classification.UNKNOWN, values[Goal.DIVISION.ordinal()][3]);
        var row = service.scenarios(state(season), "T00", "madden").goals().division();
        assertFalse(row.clinchedBy().stream().anyMatch(e -> matches(e.conditions(), state(season), 3)));
        assertFalse(row.eliminatedBy().stream().anyMatch(e -> matches(e.conditions(), state(season), 3)));
    }

    record Fixture(List<Team> teams, List<Game> games) {}
    private Fixture historical() throws Exception {
        var mapper = new ObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        try (var in = getClass().getResourceAsStream("/playoffs/rzs-seasons.json")) {
            return mapper.<Map<String, Fixture>>readValue(in, new TypeReference<>() {}).get("104");
        }
    }

    @Test
    void aMaddenWinDoesNotProveClinchingInTheNonMonotonicWashingtonRace() throws Exception {
        var fixture = historical();
        var games = new ArrayList<>(fixture.games());
        var game = games.stream().filter(g -> Set.of(g.home(), g.away()).equals(Set.of("WAS", "PHI"))).findFirst().orElseThrow();
        games.remove(game);
        var season = new Season(fixture.teams(), games, List.of(new Matchup(game.week(), game.home(), game.away())));
        var row = service.scenarios(state(season), "WAS", "madden").goals().playoffs();
        assertNotEquals("in", row.status());
        assertTrue(row.clinchedBy().stream().noneMatch(e -> e.conditions().stream().allMatch(c -> c.winner().equals("WAS"))));
        var values = classify(season, "WAS", "madden")[0];
        assertEquals(Classification.OUT, values[game.home().equals("WAS") ? 1 : 0]);
    }

    @Test
    void winningAgainstARivalCanLoseTheDivisionAtTheSameFinalRecord() {
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
                boolean win = i < (t == 2 ? 8 : 7);
                completed.add(new Game(i % 18, team, opponent, win ? 7 : 0, win ? 0 : 7));
                capacity.merge(team, -1, Integer::sum); capacity.merge(opponent, -1, Integer::sum);
            }
        }
        while (capacity.values().stream().mapToInt(Integer::intValue).sum() > 0) {
            var pair = capacity.keySet().stream().filter(t -> capacity.get(t) > 0)
                    .sorted(Comparator.<String>comparingInt(capacity::get).reversed().thenComparing(t -> t)).limit(2).toList();
            completed.add(new Game(0, pair.get(0), pair.get(1), 0, 0));
            pair.forEach(t -> capacity.merge(t, -1, Integer::sum));
        }
        var season = new Season(teams, completed, remaining);
        var state = state(season);
        var values = classify(season, "T00", "madden")[Goal.DIVISION.ordinal()];
        assertEquals(Classification.IN, values[2]);
        assertEquals(Classification.OUT, values[5]);
        var row = service.scenarios(state, "T00", "madden").goals().division();
        checkCoverage(row.clinchedBy(), state, 2, true);
        checkCoverage(row.clinchedBy(), state, 5, false);
        checkCoverage(row.eliminatedBy(), state, 5, true);
    }

    @Test
    void twelveRelevantGamesProduceSortedPrimeConditionsBeforeTruncation() {
        var source = ClinchOracleTest.league(4, 8, false);
        var games = new ArrayList<>(source.completed());
        var remaining = new ArrayList<>(source.remaining());
        while (remaining.size() < 12) {
            var game = games.removeLast();
            remaining.add(new Matchup(game.week(), game.home(), game.away()));
        }
        var state = state(new Season(source.teams(), games, remaining));
        var values = new Classification[1 << 12];
        Arrays.fill(values, Classification.IN);
        values[0] = Classification.OUT;
        var relevant = IntStream.range(0, 12).boxed().toList();
        var primes = entries(state, values, relevant, Classification.IN);
        assertEquals(12, primes.size());
        assertTrue(primes.stream().allMatch(e -> e.conditions().size() == 1));
        assertEquals(primes.stream().map(Entry::text).sorted().toList(), primes.stream().map(Entry::text).toList());
        var row = describe(state, values);
        assertEquals(primes.subList(0, 6), row.clinchedBy());
        assertEquals(12, row.eliminatedBy().getFirst().conditions().size());
    }

    @Test
    void relevantGameCapKeepsStatusAndSuppressesConditions() {
        var source = ClinchOracleTest.league(4, 8, false);
        var games = new ArrayList<>(source.completed());
        var remaining = new ArrayList<>(source.remaining());
        while (remaining.size() < 13) {
            var game = games.removeLast();
            remaining.add(new Matchup(game.week(), game.home(), game.away()));
        }
        var state = state(new Season(source.teams(), games, remaining));
        var values = new Classification[1 << 13];
        for (int a = 0; a < values.length; a++) values[a] = Integer.bitCount(a) % 2 == 0 ? Classification.IN : Classification.OUT;
        assertEquals(new GoalScenarios("open", List.of(), List.of()), describe(state, values));
        Arrays.fill(values, Classification.IN);
        assertEquals("in", describe(state, values).status());
        Arrays.fill(values, Classification.OUT);
        assertEquals("out", describe(state, values).status());
    }

    @Test
    void reportsFullThirtyTwoTeamSixteenGameEnumerationRuntime() throws Exception {
        var fixture = historical();
        var completed = new ArrayList<>(fixture.games());
        var remaining = new ArrayList<Matchup>();
        for (var game : fixture.games()) if (game.week() == 17) {
            remaining.add(new Matchup(game.week(), game.home(), game.away())); completed.remove(game);
        }
        assertEquals(16, remaining.size());
        var state = state(new Season(fixture.teams(), completed, remaining));
        try (var gate = new ComputeGate(2, 10000, 120000)) {
            var measured = new ScenarioService(new org.springframework.cache.caffeine.CaffeineCacheManager(), gate);
            for (var rules : List.of("madden", "nfl")) {
                long start = System.nanoTime();
                assertNotNull(measured.scenarios(state, "WAS", rules));
                System.out.printf("Scenario benchmark %s: 32 teams, 16 games, 65,536 outcomes, %.3f seconds%n", rules, (System.nanoTime() - start) / 1e9);
            }
        }
    }
}
