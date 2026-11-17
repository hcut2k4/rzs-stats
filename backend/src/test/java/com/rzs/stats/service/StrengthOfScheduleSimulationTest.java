package com.rzs.stats.service;

import com.rzs.stats.model.dto.StandingDto;
import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.repository.TeamRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.lang.reflect.Method;
import java.util.*;
import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@DataJpaTest(showSql = false, properties = "logging.level.org.hibernate=ERROR")
class StrengthOfScheduleSimulationTest {
    private static final long SEED = 2026111601L;
    private static final double EPS = 1e-9;
    @Autowired GameRepository realGames;
    @Autowired TeamRepository realTeams;

    record Game(int season, int stage, int week, int status, int home, int away, int hs, int as) {
        boolean involves(int t) { return home == t || away == t; }
        int opponent(int t) { return home == t ? away : home; }
    }

    record League(long seed, int size, int season, List<Game> games) {
        League withGames(List<Game> replacement) { return new League(seed, size, season, replacement); }
        List<Game> played(int source) {
            return games.stream().filter(g -> g.season == source && g.stage == 1
                    && g.week >= 0 && g.week <= 17 && g.status >= 2).toList();
        }
        List<Game> schedule(int team, boolean played) {
            return games.stream().filter(g -> g.season == season && g.stage == 1
                    && g.week >= 0 && g.week <= 17 && (g.status >= 2) == played && g.involves(team)).toList();
        }
        @Override public String toString() {
            return "seed=" + seed + ", season=" + season + ", subject IDs preserved, games=" + games;
        }
    }

    static class Results {
        final Map<String, long[]> counts = new LinkedHashMap<>();
        final Map<String, String> failures = new LinkedHashMap<>();
        void check(String name, Double expected, Double actual, double tolerance, Supplier<String> scenario) {
            long[] count = counts.computeIfAbsent(name, k -> new long[2]);
            count[0]++;
            if (same(expected, actual, tolerance)) return;
            count[1]++;
            if (!failures.containsKey(name)) failures.put(name,
                    "expected=" + expected + ", actual=" + actual + "; " + scenario.get());
        }
        void finish() {
            counts.forEach((name, n) -> System.out.printf("PROPERTY %s checks=%d failures=%d%n", name, n[0], n[1]));
            failures.forEach((name, detail) -> System.out.println("REPRO " + name + " " + detail));
            assertTrue(failures.isEmpty(), () -> String.join("\n", failures.values()));
        }
    }

    @Test
    void randomizedLeaguesFollowTheScheduleAndRawGameOracle() throws Exception {
        Results results = new Results();
        // Probe unrounded single-opponent contributions without changing the season supplying their ratings.
        Method contribution = StatsService.class.getDeclaredMethod("calculateOppPyPat", int.class, java.util.Collection.class, Map.class);
        contribution.setAccessible(true);
        for (int i = 0; i < 400; i++) {
            League league = generate(SEED + i, 2 + i % 31, i);
            Map<Integer, StandingDto> actual = run(league);
            for (int team = 1; team <= league.size; team++) {
                StandingDto dto = actual.get(team);
                int t = team;
                for (boolean prev : List.of(false, true)) {
                    String mode = prev ? " Prev" : " Curr";
                    for (String property : List.of("Played", "Left", "Total direct", "Total formula", "Bounded", "Edges")) {
                        double tolerance = property.equals("Total formula") ? 0.0001 + EPS
                                : property.equals("Total direct") ? 0.0001 + EPS : EPS;
                        Double[] values = values(league, dto, team, prev, property);
                        results.check(property + mode, values[0], values[1], tolerance,
                                () -> minimize(league, t, prev, property, tolerance));
                    }
                }
                List<Game> played = league.played(league.season);
                int[] totals = totals(played, team, -1);
                double py = pyPat(totals);
                long wins = played.stream().filter(g -> g.involves(t)
                        && (g.home == t ? g.hs > g.as : g.as > g.hs)).count();
                long ties = played.stream().filter(g -> g.involves(t) && g.hs == g.as).count();
                results.check("PyPAT", rounded(py), dto.getPythagoreanPat(), EPS, () -> league.toString());
                results.check("Tie record and luck", 1.0,
                        dto.getWins() == wins && dto.getTies() == ties && dto.getGamesPlayed() == totals[2]
                                && same(Math.round((wins + ties * 0.5 - py * totals[2]) * 10.0) / 10.0,
                                dto.getWinDiff(), EPS) ? 1.0 : 0.0, EPS, () -> league.toString());
            }
            for (boolean prev : List.of(false, true)) {
                List<Game> source = league.played(prev ? league.season - 1 : league.season);
                Map<Integer, StatsService.TeamStats> stats = new HashMap<>();
                for (Game g : source) {
                    stats.computeIfAbsent(g.home, k -> new StatsService.TeamStats()).addGame(g.hs, g.as, g.away);
                    stats.computeIfAbsent(g.away, k -> new StatsService.TeamStats()).addGame(g.as, g.hs, g.home);
                }
                StatsService service = new StatsService(mock(GameRepository.class), mock(TeamRepository.class));
                for (int t = 1; t <= league.size; t++) {
                    for (int o = 1; o <= league.size; o++) {
                        if (o == t) continue;
                        int[] raw = totals(source, o, t);
                        // An opponent with no games left after H2H removal is unratable: null, not 0.0
                        Double used = sosValue(contribution.invoke(service, t, Set.of(o), stats));
                        Double want = raw[2] == 0 ? null : pyPat(raw);
                        int subject = t, opponent = o;
                        Supplier<String> context = () -> league + ", subject=" + subject + ", opponent=" + opponent
                                + ", expected=" + want + ", actual=" + used;
                        results.check("H2H contribution" + (prev ? " Prev" : " Curr"), 1.0,
                                same(want, used, EPS) ? 1.0 : 0.0, EPS, context);
                        int[] excluded = stats.containsKey(o) ? stats.get(o).statsExcluding(t) : new int[3];
                        results.check("H2H raw totals" + (prev ? " Prev" : " Curr"), 1.0,
                                Arrays.equals(raw, excluded) ? 1.0 : 0.0, EPS, context);
                    }
                }
            }
        }
        results.finish();
    }

    @Test
    void duplicatingMeetingsMovesPlayedByTheGameWeightedAmount() {
        Results results = new Results();
        for (int i = 0; i < 200; i++) {
            long seed = SEED + 10000 + i;
            Random rng = new Random(seed);
            List<Game> games = new ArrayList<>();
            for (int season : List.of(0, 1)) {
                games.add(game(season, 1, 2, 30 + rng.nextInt(70), 0));
                games.add(game(season, 1, 3, 30 + rng.nextInt(70), 0));
                games.add(game(season, 2, 3, 1 + rng.nextInt(60), 0));
            }
            League base = new League(seed, 3, 1, new ArrayList<>(games));
            StandingDto before = run(base).get(1);
            for (int copies = 1; copies <= 2; copies++) {
                games.add(games.get(3));
                League duplicate = base.withGames(new ArrayList<>(games));
                StandingDto after = run(duplicate).get(1);
                for (boolean prev : List.of(false, true)) {
                    List<Game> source = duplicate.played(prev ? 0 : 1);
                    double opponent = pyPat(totals(source, 2, 1));
                    double mean = mean(base.schedule(1, true), source, 1);
                    double expected = rounded((2 * mean + copies * opponent) / (2 + copies));
                    double actual = prev ? after.getOppPyPatPrev() : after.getOppPyPatCurr();
                    double old = prev ? before.getOppPyPatPrev() : before.getOppPyPatCurr();
                    results.check("Duplicate to " + (copies + 1) + " meetings" + (prev ? " Prev" : " Curr"),
                            expected, actual, EPS, () -> minimize(duplicate, 1, prev, "Played", EPS));
                    results.check("Duplicate must move" + (prev ? " Prev" : " Curr"), 1.0,
                            actual > old && actual < opponent ? 1.0 : 0.0, EPS,
                            () -> "before=" + old + "; " + minimize(duplicate, 1, prev, "Played", EPS));
                }
            }
        }
        results.finish();
    }

    @Test
    void exclusionChangesTheScheduleOfADominantTeam() {
        Results results = new Results();
        for (int i = 0; i < 100; i++) {
            long seed = SEED + 20000 + i;
            Random rng = new Random(seed);
            List<Game> games = new ArrayList<>();
            for (int season : List.of(0, 1)) {
                games.add(game(season, 1, 2, 60 + rng.nextInt(40), 0));
                games.add(game(season, 1, 3, 60 + rng.nextInt(40), 0));
                games.add(game(season, 2, 3, 10 + rng.nextInt(20), 10 + rng.nextInt(20)));
            }
            League league = new League(seed, 3, 1, games);
            StandingDto actual = run(league).get(1);
            for (boolean prev : List.of(false, true)) {
                List<Game> source = league.played(prev ? 0 : 1);
                double expected = rounded(mean(league.schedule(1, true), source, 1));
                double raw = (pyPat(totals(source, 2, -1)) + pyPat(totals(source, 3, -1))) / 2;
                double used = prev ? actual.getOppPyPatPrev() : actual.getOppPyPatCurr();
                results.check("Exclusion bites" + (prev ? " Prev" : " Curr"), expected, used, EPS,
                        () -> league + ", expected=" + expected + ", actual=" + used + ", raw=" + raw);
                assertTrue(Math.abs(expected - raw) > 0.25, "seed=" + seed);
            }
        }
        results.finish();
    }

    @Test
    void identicalTeamsHaveSymmetricSchedulesAndZeroLuck() {
        Results results = new Results();
        for (int i = 0; i < 100; i++) {
            long seed = SEED + 30000 + i;
            Random rng = new Random(seed);
            int size = 3 + rng.nextInt(30);
            List<Game> games = new ArrayList<>();
            int score = 1 + rng.nextInt(50);
            for (int a = 1; a <= size; a++) {
                for (int b = a + 1; b <= size; b++) {
                    for (int season : List.of(0, 1)) games.add(game(season, a, b, score, score));
                    Game future = new Game(1, 1, 17, i % 2, a, b, 0, 0);
                    for (int copy = 0; copy <= i % 3; copy++) games.add(future);
                }
            }
            League league = new League(seed, size, 1, games);
            for (StandingDto dto : run(league).values()) {
                for (boolean prev : List.of(false, true)) {
                    for (double value : List.of(prev ? dto.getOppPyPatPrev() : dto.getOppPyPatCurr(),
                            prev ? dto.getOppPyPatRemainingPrev() : dto.getOppPyPatRemainingCurr(),
                            prev ? dto.getOppPyPatTotalPrev() : dto.getOppPyPatTotalCurr())) {
                        results.check("Identical symmetry" + (prev ? " Prev" : " Curr"), 0.5, value, EPS, () -> league.toString());
                    }
                }
                results.check("Identical luck", 0.0, dto.getWinDiff(), EPS, () -> league.toString());
            }
        }
        results.finish();
    }

    @Test
    void realRepositoryQueriesExcludePreseasonAndPlayoffs() {
        Results results = new Results();
        for (int i = 0; i < 32; i++) {
            realGames.deleteAllInBatch();
            realTeams.deleteAllInBatch();
            League league = generate(SEED + 40000 + i, 2 + i % 7, i);
            List<TeamEntity> teams = realTeams.saveAll(teams(league.size));
            realGames.saveAllAndFlush(entities(league, teams));
            StatsService service = new StatsService(realGames, realTeams);
            Map<Integer, StandingDto> before = byTeam(service.computeStandings(league.season));
            List<Game> noise = new ArrayList<>();
            for (int season : List.of(league.season - 1, league.season)) {
                for (int status = 0; status <= 3; status++) {
                    noise.add(new Game(season, 0, 0, status, 1, 2, 999, 0));
                    noise.add(new Game(season, 1, 18, status, 1, 2, 0, 999));
                    noise.add(new Game(season, 1, 22, status, 2, 1, 999, 0));
                }
            }
            List<GameEntity> extra = entities(league.withGames(noise), teams);
            for (int j = 0; j < extra.size(); j++) extra.get(j).setGameId(100000 + j);
            realGames.saveAllAndFlush(extra);
            Map<Integer, StandingDto> after = byTeam(service.computeStandings(league.season));
            for (int t = 1; t <= league.size; t++) {
                StandingDto a = before.get(t), b = after.get(t);
                Double[] first = numbers(a), second = numbers(b);
                for (int j = 0; j < first.length; j++) {
                    int index = j;
                    results.check("Scope real H2", first[j], second[j], EPS,
                            () -> league + ", added=" + noise + ", field=" + index
                                    + ", expected=" + first[index] + ", actual=" + second[index]);
                }
            }
        }
        results.finish();
    }

    private static Double[] numbers(StandingDto s) {
        return new Double[]{s.getPythagoreanPat(), s.getOppPyPatCurr(), s.getOppPyPatPrev(),
                s.getOppPyPatRemainingCurr(), s.getOppPyPatRemainingPrev(), s.getOppPyPatTotalCurr(), s.getOppPyPatTotalPrev()};
    }

    private static Double[] values(League l, StandingDto s, int t, boolean prev, String property) {
        List<Game> played = l.schedule(t, true), left = l.schedule(t, false);
        List<Game> source = l.played(prev ? l.season - 1 : l.season);
        Double p = prev ? s.getOppPyPatPrev() : s.getOppPyPatCurr();
        Double r = prev ? s.getOppPyPatRemainingPrev() : s.getOppPyPatRemainingCurr();
        Double total = prev ? s.getOppPyPatTotalPrev() : s.getOppPyPatTotalCurr();
        int all = played.size() + left.size();
        return switch (property) {
            case "Played" -> new Double[]{rounded(mean(played, source, t)), p};
            case "Left" -> new Double[]{rounded(mean(left, source, t)), r};
            case "Total direct" -> {
                List<Game> schedule = new ArrayList<>(played);
                schedule.addAll(left);
                yield new Double[]{rounded(mean(schedule, source, t)), total};
            }
            // Total weights each side by the games it actually rated, not by raw game counts
            case "Total formula" -> {
                int pr = rated(played, source, t), lr = rated(left, source, t);
                yield new Double[]{pr + lr == 0 ? null
                        : ((p == null ? 0 : p) * pr + (r == null ? 0 : r) * lr) / (pr + lr), total};
            }
            case "Bounded" -> new Double[]{1.0, p == null || r == null || total != null
                    && total >= Math.min(p, r) - EPS && total <= Math.max(p, r) + EPS ? 1.0 : 0.0};
            case "Edges" -> new Double[]{1.0, (total == null) == (p == null && r == null)
                    && (p != null || same(total, r, EPS))
                    && (r != null || same(total, p, EPS)) ? 1.0 : 0.0};
            default -> throw new IllegalArgumentException(property);
        };
    }

    private static String minimize(League original, int team, boolean prev, String property, double tolerance) {
        League reduced = original;
        boolean changed;
        do {
            changed = false;
            for (int i = 0; i < reduced.games.size(); i++) {
                List<Game> games = new ArrayList<>(reduced.games);
                games.remove(i);
                League candidate = reduced.withGames(games);
                Double[] v = values(candidate, run(candidate).get(team), team, prev, property);
                if (!same(v[0], v[1], tolerance)) {
                    reduced = candidate;
                    changed = true;
                    break;
                }
            }
        } while (changed);
        Double[] v = values(reduced, run(reduced).get(team), team, prev, property);
        return reduced + ", team=" + team + ", mode=" + (prev ? "Prev" : "Curr")
                + ", property=" + property + ", expected=" + v[0] + ", actual=" + v[1]
                + " (no single game can be removed while preserving failure)";
    }

    // null when no game on the list produced a rating: that is no data, not a 0.0 rating
    private static Double mean(List<Game> schedule, List<Game> source, int team) {
        double sum = 0;
        int count = 0;
        for (Game g : schedule) {
            int[] adjusted = totals(source, g.opponent(team), team);
            if (adjusted[2] == 0) continue;
            sum += pyPat(adjusted);
            count++;
        }
        return count == 0 ? null : sum / count;
    }

    private static int rated(List<Game> schedule, List<Game> source, int team) {
        int count = 0;
        for (Game g : schedule) {
            if (totals(source, g.opponent(team), team)[2] > 0) count++;
        }
        return count;
    }

    private static int[] totals(List<Game> games, int team, int exclude) {
        int[] totals = new int[3];
        for (Game g : games) {
            if (!g.involves(team) || g.involves(exclude)) continue;
            totals[0] += g.home == team ? g.hs : g.as;
            totals[1] += g.home == team ? g.as : g.hs;
            totals[2]++;
        }
        return totals;
    }

    private static double pyPat(int[] s) {
        if (s[2] == 0 || s[0] == 0) return 0;
        if (s[1] == 0) return 1;
        double exponent = Math.pow((s[0] + (double) s[1]) / s[2], 0.251);
        return 1.0 / (1.0 + Math.pow((double) s[1] / s[0], exponent));
    }

    // calculateOppPyPat returns a private OppSos record, or null when nothing was ratable
    private static Double sosValue(Object sos) throws Exception {
        if (sos == null) return null;
        Method accessor = sos.getClass().getDeclaredMethod("value");
        accessor.setAccessible(true);
        return (Double) accessor.invoke(sos);
    }

    private static Double rounded(Double value) { return value == null ? null : Math.round(value * 10000) / 10000.0; }
    private static boolean same(Double a, Double b, double tolerance) {
        return a == null || b == null ? a == b : Math.abs(a - b) <= tolerance;
    }

    private static Game game(int season, int home, int away, int hs, int as) {
        return new Game(season, 1, 0, 2, home, away, hs, as);
    }

    private static League generate(long seed, int size, int index) {
        Random rng = new Random(seed);
        int season = index % 11 == 0 ? 0 : 1;
        List<Game> games = new ArrayList<>();
        double progress = index % 6 == 0 ? 0 : index % 6 == 1 ? 1 : rng.nextDouble();
        for (int source = season - 1; source <= season; source++) {
            if (source < 0) continue;
            for (int a = 1; a <= size; a++) {
                for (int b = a + 1; b <= size; b++) {
                    if (source < season && (a == size || b == size) && index % 3 == 0) continue;
                    if (index % 7 == 0 || rng.nextDouble() > (index % 4 == 0 ? 0.12 : 0.55)) continue;
                    int meetings = (a - 1) / 4 == (b - 1) / 4 ? 2 + index % 2 : 1;
                    for (int m = 0; m < meetings; m++) {
                        int hs = rng.nextInt(61), as = rng.nextInt(61);
                        switch (rng.nextInt(6)) {
                            case 0 -> hs = as;
                            case 1 -> as = 0;
                            case 2 -> { hs = 70 + rng.nextInt(60); as = rng.nextInt(4); }
                            case 3 -> { hs = 0; as = 0; }
                            default -> { }
                        }
                        int status = source < season || rng.nextDouble() < progress ? 2 + rng.nextInt(2) : rng.nextInt(2);
                        games.add(new Game(source, 1, rng.nextInt(18), status, a, b, hs, as));
                    }
                }
            }
        }
        return new League(seed, size, season, games);
    }

    private static Map<Integer, StandingDto> run(League league) {
        GameRepository games = mock(GameRepository.class);
        TeamRepository teams = mock(TeamRepository.class);
        List<TeamEntity> allTeams = teams(league.size);
        List<GameEntity> allGames = entities(league, allTeams);
        when(teams.findAll()).thenReturn(allTeams);
        when(games.findRegularSeasonGames(anyInt(), anyInt(), anyInt(), anyInt())).thenAnswer(call ->
                allGames.stream().filter(g -> g.getSeasonIndex().equals(call.getArgument(0))
                        && g.getStageIndex().equals(call.getArgument(1)) && g.getWeekIndex() >= (int) call.getArgument(2)
                        && g.getWeekIndex() <= (int) call.getArgument(3) && g.getStatus() >= 2).toList());
        when(games.findFutureRegularSeasonGames(anyInt())).thenAnswer(call -> allGames.stream()
                .filter(g -> g.getSeasonIndex().equals(call.getArgument(0)) && g.getStageIndex() == 1
                        && g.getWeekIndex() >= 0 && g.getWeekIndex() <= 17 && g.getStatus() < 2).toList());
        return byTeam(new StatsService(games, teams).computeStandings(league.season));
    }

    private static Map<Integer, StandingDto> byTeam(List<StandingDto> standings) {
        Map<Integer, StandingDto> map = new HashMap<>();
        standings.forEach(s -> map.put(s.getTeamId(), s));
        return map;
    }

    private static List<TeamEntity> teams(int size) {
        List<TeamEntity> teams = new ArrayList<>();
        for (int i = 1; i <= size; i++) {
            TeamEntity team = new TeamEntity();
            team.setTeamId(i);
            team.setDisplayName("T" + i);
            teams.add(team);
        }
        return teams;
    }

    private static List<GameEntity> entities(League league, List<TeamEntity> teams) {
        List<GameEntity> games = new ArrayList<>();
        for (Game g : league.games) {
            GameEntity entity = new GameEntity();
            entity.setGameId(games.size() + 1);
            entity.setSeasonIndex(g.season);
            entity.setStageIndex(g.stage);
            entity.setWeekIndex(g.week);
            entity.setStatus(g.status);
            entity.setHomeTeam(teams.get(g.home - 1));
            entity.setAwayTeam(teams.get(g.away - 1));
            entity.setHomeScore(g.hs);
            entity.setAwayScore(g.as);
            games.add(entity);
        }
        return games;
    }
}
