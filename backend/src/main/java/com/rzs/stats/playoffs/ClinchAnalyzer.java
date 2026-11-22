package com.rzs.stats.playoffs;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Function;

import static com.rzs.stats.playoffs.PlayoffSeeding.*;

public final class ClinchAnalyzer {
    public enum Goal { PLAYOFFS, DIVISION, ONE_SEED }
    public enum Marker { CLINCHED, ELIMINATED, NONE }
    public record Matchup(int week, String home, String away) {}
    public record Season(List<Team> teams, List<Game> completed, List<Matchup> remaining) {
        public Season {
            teams = List.copyOf(teams); completed = List.copyOf(completed); remaining = List.copyOf(remaining);
            var names = new HashSet<String>();
            for (var team : teams) if (!names.add(team.abbr())) throw new IllegalArgumentException("Duplicate team");
            for (var game : completed) {
                validate(names, game.week(), game.home(), game.away());
                if (game.homeScore() < 0 || game.awayScore() < 0) throw new IllegalArgumentException("Negative score");
            }
            for (var game : remaining) validate(names, game.week(), game.home(), game.away());
        }
    }
    public record Analysis(Map<String, Map<Goal, Marker>> markers, boolean exhaustive, long seeded) {}
    private record Pair(String team, Goal goal) {}

    private ClinchAnalyzer() {}

    private static void validate(Set<String> names, int week, String home, String away) {
        if (week < 0 || week > 17 || home.equals(away) || !names.contains(home) || !names.contains(away))
            throw new IllegalArgumentException("Invalid regular-season matchup");
    }

    public static Analysis analyze(Season season, Function<List<Game>, Result> seeder, Duration budget) {
        return analyze(season, seeder, budget, 12);
    }

    public static Analysis analyze(Season season, Function<List<Game>, Result> seeder, Duration budget, int cap) {
        var base = records(season);
        var totals = counts(season);
        if (season.remaining().size() > cap || budget.isZero() || budget.isNegative()
                || totals.values().stream().anyMatch(n -> n != 17)) return finish(base, false, 0);
        var open = new ArrayList<Pair>();
        base.forEach((team, goals) -> goals.forEach((goal, marker) -> {
            if (marker == Marker.NONE) open.add(new Pair(team, goal));
        }));
        long deadline = System.nanoTime() + budget.toNanos();
        var executor = Executors.newFixedThreadPool(Math.min(9, Runtime.getRuntime().availableProcessors()));
        var futures = new ArrayList<Future<Search>>();
        int prefix = Math.min(2, season.remaining().size());
        int branches = (int) Math.pow(3, prefix);
        try {
            for (int branch = 0; branch < branches; branch++) {
                int choice = branch;
                var games = new ArrayList<>(season.completed());
                for (int i = 0; i < prefix; i++) {
                    games.add(outcome(season.remaining().get(i), choice % 3)); choice /= 3;
                }
                futures.add(executor.submit(() -> {
                    var search = new Search(season, seeder, open, deadline);
                    search.visit(games, prefix);
                    return search;
                }));
            }
            var seenTrue = new boolean[open.size()];
            var seenFalse = new boolean[open.size()];
            long seeded = 0;
            for (var future : futures) {
                var search = future.get(Math.max(1, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
                if (search.expired) return finish(base, false, 0);
                seeded += search.seeded;
                for (int i = 0; i < open.size(); i++) {
                    seenTrue[i] |= search.yes[i]; seenFalse[i] |= search.no[i];
                }
            }
            if (System.nanoTime() >= deadline) return finish(base, false, 0);
            for (int i = 0; i < open.size(); i++) {
                var pair = open.get(i);
                base.get(pair.team()).put(pair.goal(), !seenFalse[i] ? Marker.CLINCHED : !seenTrue[i] ? Marker.ELIMINATED : Marker.NONE);
            }
            return finish(base, true, seeded);
        } catch (TimeoutException e) {
            return finish(base, false, 0);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return finish(base, false, 0);
        } catch (ExecutionException e) {
            throw new IllegalStateException("Clinch search failed", e.getCause());
        } finally {
            futures.forEach(f -> f.cancel(true));
            executor.shutdownNow();
        }
    }

    public static Game outcome(Matchup game, int outcome) {
        return new Game(game.week(), game.home(), game.away(), outcome == 0 ? 1 : 0, outcome == 1 ? 1 : 0);
    }

    private static final class Search {
        final Season season;
        final Function<List<Game>, Result> seeder;
        final List<Pair> pairs;
        final long deadline;
        final boolean[] yes, no;
        boolean expired;
        long seeded;

        Search(Season season, Function<List<Game>, Result> seeder, List<Pair> pairs, long deadline) {
            this.season = season; this.seeder = seeder; this.pairs = pairs; this.deadline = deadline;
            yes = new boolean[pairs.size()]; no = new boolean[pairs.size()];
        }

        void visit(ArrayList<Game> games, int depth) {
            if (System.nanoTime() >= deadline || Thread.currentThread().isInterrupted()) { expired = true; return; }
            boolean settled = true;
            for (int i = 0; i < pairs.size(); i++) settled &= yes[i] && no[i];
            if (settled) return;
            if (depth < season.remaining().size()) {
                var bounds = records(new Season(season.teams(), games, season.remaining().subList(depth, season.remaining().size())));
                boolean proven = true;
                for (int i = 0; i < pairs.size(); i++) {
                    if (yes[i] && no[i]) continue;
                    var p = pairs.get(i);
                    var marker = bounds.get(p.team()).get(p.goal());
                    if (marker == Marker.CLINCHED) yes[i] = true;
                    else if (marker == Marker.ELIMINATED) no[i] = true;
                    else proven = false;
                }
                if (proven) return;
                for (int outcome = 0; outcome < 3 && !expired; outcome++) {
                    games.add(outcome(season.remaining().get(depth), outcome));
                    visit(games, depth + 1);
                    games.removeLast();
                }
                return;
            }
            var result = seeder.apply(games); seeded++;
            var ambiguous = new HashSet<>(result.unresolvedConferences().keySet());
            var futureTeams = new HashSet<String>();
            season.remaining().forEach(g -> { futureTeams.add(g.home()); futureTeams.add(g.away()); });
            for (var tie : result.pointTies()) {
                var step = tie.step();
                boolean unknown = step == null || step == TiebreakerRules.Step.NET_TOUCHDOWNS
                        || step == TiebreakerRules.Step.COIN_TOSS
                        || step == TiebreakerRules.Step.COMBINED_RANKING_ALL
                        || step == TiebreakerRules.Step.COMBINED_RANKING_CONFERENCE
                        || tie.tied().stream().anyMatch(futureTeams::contains);
                if (unknown) ambiguous.add(tie.conference());
            }
            for (int i = 0; i < pairs.size(); i++) {
                var p = pairs.get(i);
                var conference = season.teams().stream().filter(t -> t.abbr().equals(p.team())).findFirst().orElseThrow().conference();
                if (ambiguous.contains(conference)) { yes[i] = true; no[i] = true; continue; }
                boolean achieved = achieved(result, p.team(), p.goal());
                yes[i] |= achieved; no[i] |= !achieved;
            }
        }
    }

    static boolean achieved(Result result, String team, Goal goal) {
        if (goal == Goal.DIVISION) return result.divisionRanks().get(team).position() == 1;
        return result.conferences().values().stream().flatMap(Collection::stream)
                .anyMatch(r -> r.teams().contains(team) && r.position() <= (goal == Goal.ONE_SEED ? 1 : 7));
    }

    private static Map<String, Integer> counts(Season season) {
        var totals = new HashMap<String, Integer>();
        season.teams().forEach(t -> totals.put(t.abbr(), 0));
        season.completed().forEach(g -> { totals.merge(g.home(), 1, Integer::sum); totals.merge(g.away(), 1, Integer::sum); });
        season.remaining().forEach(g -> { totals.merge(g.home(), 1, Integer::sum); totals.merge(g.away(), 1, Integer::sum); });
        return totals;
    }

    private static Map<String, Map<Goal, Marker>> records(Season season) {
        var totals = counts(season);
        var points = new HashMap<String, Integer>();
        var played = new HashMap<String, Integer>();
        season.teams().forEach(t -> { points.put(t.abbr(), 0); played.put(t.abbr(), 0); });
        season.completed().forEach(g -> {
            points.merge(g.home(), g.homeScore() > g.awayScore() ? 2 : g.homeScore() == g.awayScore() ? 1 : 0, Integer::sum);
            points.merge(g.away(), g.awayScore() > g.homeScore() ? 2 : g.homeScore() == g.awayScore() ? 1 : 0, Integer::sum);
            played.merge(g.home(), 1, Integer::sum); played.merge(g.away(), 1, Integer::sum);
        });
        var min = new HashMap<String, Integer>();
        var max = new HashMap<String, Integer>();
        totals.replaceAll((t, n) -> Math.max(17, n));
        season.teams().forEach(t -> {
            min.put(t.abbr(), points.get(t.abbr()));
            max.put(t.abbr(), points.get(t.abbr()) + 2 * (totals.get(t.abbr()) - played.get(t.abbr())));
        });
        var markers = new TreeMap<String, Map<Goal, Marker>>();
        for (var team : season.teams()) {
            String t = team.abbr();
            boolean division = true, one = true, outDivision = false, outOne = false;
            var threats = new HashMap<String, Integer>();
            var ahead = new HashMap<String, Integer>();
            for (var rival : season.teams()) {
                String u = rival.abbr();
                if (t.equals(u) || !team.conference().equals(rival.conference())) continue;
                boolean above = (long) min.get(t) * totals.get(u) > (long) max.get(u) * totals.get(t);
                boolean below = (long) min.get(u) * totals.get(t) > (long) max.get(t) * totals.get(u);
                one &= above; outOne |= below;
                if (team.division().equals(rival.division())) { division &= above; outDivision |= below; }
                if (!above) threats.merge(rival.division(), 1, Integer::sum);
                if (below) ahead.merge(rival.division(), 1, Integer::sum);
            }
            int wildCards = 7 - (int) season.teams().stream().filter(u -> u.conference().equals(team.conference()))
                    .map(Team::division).distinct().count();
            boolean playoffs = division || threats.values().stream().mapToInt(n -> Math.max(0, n - 1)).sum() < wildCards;
            boolean outPlayoffs = outDivision && ahead.values().stream().mapToInt(n -> Math.max(0, n - 1)).sum() >= wildCards;
            var goals = new EnumMap<Goal, Marker>(Goal.class);
            goals.put(Goal.PLAYOFFS, marker(playoffs, outPlayoffs));
            goals.put(Goal.DIVISION, marker(division, outDivision));
            goals.put(Goal.ONE_SEED, marker(one, outOne));
            markers.put(t, goals);
        }
        return markers;
    }

    private static Marker marker(boolean clinched, boolean eliminated) {
        return clinched ? Marker.CLINCHED : eliminated ? Marker.ELIMINATED : Marker.NONE;
    }

    private static Analysis finish(Map<String, Map<Goal, Marker>> markers, boolean exhaustive, long seeded) {
        var frozen = new TreeMap<String, Map<Goal, Marker>>();
        markers.forEach((team, goals) -> {
            if (goals.get(Goal.ONE_SEED) == Marker.CLINCHED) goals.put(Goal.DIVISION, Marker.CLINCHED);
            if (goals.get(Goal.DIVISION) == Marker.CLINCHED) goals.put(Goal.PLAYOFFS, Marker.CLINCHED);
            if (goals.get(Goal.PLAYOFFS) == Marker.ELIMINATED) goals.put(Goal.DIVISION, Marker.ELIMINATED);
            if (goals.get(Goal.DIVISION) == Marker.ELIMINATED) goals.put(Goal.ONE_SEED, Marker.ELIMINATED);
            frozen.put(team, Map.copyOf(goals));
        });
        return new Analysis(Collections.unmodifiableMap(frozen), exhaustive, seeded);
    }
}
