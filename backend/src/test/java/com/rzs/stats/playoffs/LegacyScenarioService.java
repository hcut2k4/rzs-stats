package com.rzs.stats.playoffs;

import java.util.*;
import java.util.concurrent.*;
import static com.rzs.stats.playoffs.ClinchAnalyzer.*;

class LegacyScenarioService {
    public record Condition(int gameId, String winner) {}
    public record Entry(String text, List<Condition> conditions) {}
    public record GoalScenarios(String status, List<Entry> clinchedBy, List<Entry> eliminatedBy) {}
    public record Goals(GoalScenarios playoffs, GoalScenarios division, GoalScenarios oneSeed) {}
    public record Scenarios(int remainingGames, String assumes, Goals goals) {}
    enum Classification { UNKNOWN, IN, OUT }
    static final int RELEVANT_CAP = 12;

    public Scenarios scenarios(SeasonStateLoader.State state, String abbr, String rules) {
        var season = new Season(state.teams(), state.completedGames(), state.remainingGames().stream()
                .map(g -> new Matchup(g.week(), g.home(), g.away())).toList());
        int n = season.remaining().size();
        if (n == 0 || n > 16 || !completeSchedule(season)) return null;
        var values = classify(season, abbr, rules);
        return new Scenarios(n, "No tie games; point-differential tiebreaks are treated as unknown",
                new Goals(describe(state, values[0]), describe(state, values[1]), describe(state, values[2])));
    }

    static Classification[][] classify(Season season, String abbr, String rules) {
        int count = 1 << season.remaining().size();
        var values = new Classification[Goal.values().length][count];
        String conference = season.teams().stream().filter(t -> t.abbr().equals(abbr)).findFirst().orElseThrow().conference();
        var futureTeams = new HashSet<String>();
        season.remaining().forEach(g -> { futureTeams.add(g.home()); futureTeams.add(g.away()); });
        int workers = Math.min(8, Runtime.getRuntime().availableProcessors());
        try (var executor = Executors.newFixedThreadPool(workers)) {
            var tasks = new ArrayList<Callable<Void>>();
            for (int worker = 0; worker < workers; worker++) {
                int start = worker * count / workers, end = (worker + 1) * count / workers;
                tasks.add(() -> {
                    var games = new ArrayList<>(season.completed());
                    season.remaining().forEach(g -> games.add(outcome(g, 0)));
                    for (int assignment = start; assignment < end; assignment++) {
                        for (int i = 0; i < season.remaining().size(); i++)
                            games.set(season.completed().size() + i, outcome(season.remaining().get(i),
                                    (assignment & (1 << i)) != 0 ? 0 : 1));
                        var result = rules.equals("madden") ? MaddenSeeding.madden27().seed(season.teams(), games)
                                : PlayoffSeeding.seedForPicture(season.teams(), games);
                        boolean unknown = ambiguousConferences(result, futureTeams).contains(conference);
                        for (var goal : Goal.values()) values[goal.ordinal()][assignment] = unknown ? Classification.UNKNOWN
                                : achieved(result, abbr, goal) ? Classification.IN : Classification.OUT;
                    }
                    return null;
                });
            }
            for (var future : executor.invokeAll(tasks)) future.get();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Scenario search interrupted", e);
        } catch (ExecutionException e) {
            throw new IllegalStateException("Scenario search failed", e.getCause());
        }
        return values;
    }

    static GoalScenarios describe(SeasonStateLoader.State state, Classification[] values) {
        if (Arrays.stream(values).allMatch(v -> v == Classification.IN)) return new GoalScenarios("in", List.of(), List.of());
        if (Arrays.stream(values).allMatch(v -> v == Classification.OUT)) return new GoalScenarios("out", List.of(), List.of());
        var relevant = new ArrayList<Integer>();
        for (int i = 0; i < state.remainingGames().size(); i++) {
            int bit = 1 << i;
            for (int a = 0; a < values.length; a++) if (values[a] != values[a ^ bit]) {
                relevant.add(i); break;
            }
        }
        if (relevant.size() > RELEVANT_CAP) return new GoalScenarios("open", List.of(), List.of());
        return new GoalScenarios("open", entries(state, values, relevant, Classification.IN).stream().limit(6).toList(),
                entries(state, values, relevant, Classification.OUT).stream().limit(6).toList());
    }

    static List<Entry> entries(SeasonStateLoader.State state, Classification[] values, List<Integer> relevant, Classification target) {
        int r = relevant.size(), size = 1;
        var powers = new int[r];
        for (int i = 0; i < r; i++) { powers[i] = size; size *= 3; }
        var sufficient = new boolean[size];
        var entries = new ArrayList<Entry>();
        // Ternary digits are free, away wins, home wins. Children have larger codes.
        for (int code = size - 1; code >= 0; code--) {
            int free = -1, assignment = 0;
            for (int i = 0; i < r; i++) {
                int digit = code / powers[i] % 3;
                if (digit == 0) free = i;
                if (digit == 2) assignment |= 1 << relevant.get(i);
            }
            sufficient[code] = free < 0 ? values[assignment] == target
                    : sufficient[code + powers[free]] && sufficient[code + 2 * powers[free]];
        }
        for (int code = 1; code < size; code++) {
            if (!sufficient[code]) continue;
            boolean prime = true;
            for (int i = 0; i < r; i++) {
                int digit = code / powers[i] % 3;
                if (digit != 0 && sufficient[code - digit * powers[i]]) { prime = false; break; }
            }
            if (!prime) continue;
            var conditions = new ArrayList<Condition>();
            for (int i = 0; i < r; i++) {
                int digit = code / powers[i] % 3;
                if (digit == 0) continue;
                var game = state.remainingGames().get(relevant.get(i));
                conditions.add(new Condition(game.gameId(), digit == 2 ? game.home() : game.away()));
            }
            conditions.sort(Comparator.comparing((Condition c) -> phrase(state, c)).thenComparingInt(Condition::gameId));
            entries.add(new Entry(String.join(" and ", conditions.stream().map(c -> phrase(state, c)).toList()), List.copyOf(conditions)));
        }
        entries.sort(Comparator.comparingInt((Entry e) -> e.conditions().size()).thenComparing(Entry::text));
        return List.copyOf(entries);
    }

    private static String phrase(SeasonStateLoader.State state, Condition condition) {
        var game = state.remainingGames().stream().filter(g -> g.gameId() == condition.gameId()).findFirst().orElseThrow();
        String loser = condition.winner().equals(game.home()) ? game.away() : game.home();
        return state.identities().get(condition.winner()).displayName() + " beat " + state.identities().get(loser).displayName();
    }
}
