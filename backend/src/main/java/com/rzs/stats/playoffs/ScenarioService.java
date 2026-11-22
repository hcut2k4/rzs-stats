package com.rzs.stats.playoffs;

import org.springframework.stereotype.Service;
import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import static com.rzs.stats.playoffs.ClinchAnalyzer.*;

@Service
public class ScenarioService {
    public record Condition(int gameId, String winner) {}
    public record Entry(String text, List<Condition> conditions) {}
    public record GoalScenarios(String status, List<Entry> clinchedBy, List<Entry> eliminatedBy) {}
    public record Goals(GoalScenarios playoffs, GoalScenarios division, GoalScenarios oneSeed) {}
    public record Scenarios(int remainingGames, String assumes, Goals goals) {}
    enum Classification { UNKNOWN, IN, OUT }
    static final int RELEVANT_CAP = 12;

    private final CacheManager caches;
    private final ComputeGate gate;

    public ScenarioService() { this(new CaffeineCacheManager(), new ComputeGate(2, 10000)); }

    @Autowired
    public ScenarioService(CacheManager caches, ComputeGate gate) { this.caches = caches; this.gate = gate; }

    public Scenarios scenarios(SeasonStateLoader.State state, String abbr, String rules) {
        var season = new Season(state.teams(), state.completedGames(), state.remainingGames().stream()
                .map(g -> new Matchup(g.week(), g.home(), g.away())).toList());
        int n = season.remaining().size();
        if (n == 0 || n > 16 || !completeSchedule(season)) return null;
        try {
            var all = caches.getCache("playoffScenarios").get(new org.springframework.cache.interceptor.SimpleKey(season, rules),
                    () -> gate.execute(() -> classifyAll(season, rules)));
            var values = all.get(abbr);
            return gate.execute(() -> new Scenarios(n, "No tie games; point-differential tiebreaks are treated as unknown",
                    new Goals(describe(state, values[0]), describe(state, values[1]), describe(state, values[2]))));
        } catch (org.springframework.cache.Cache.ValueRetrievalException e) {
            if (e.getCause() instanceof RuntimeException cause) throw cause;
            throw e;
        }
    }

    static Classification[][] classify(Season season, String abbr, String rules) {
        return classifyAll(season, rules).get(abbr);
    }

    static Map<String, Classification[][]> classifyAll(Season season, String rules) {
        int count = 1 << season.remaining().size();
        var values = new HashMap<String, Classification[][]>();
        season.teams().forEach(t -> values.put(t.abbr(), new Classification[Goal.values().length][count]));
        var futureTeams = new HashSet<String>();
        season.remaining().forEach(g -> { futureTeams.add(g.home()); futureTeams.add(g.away()); });
        var games = new ArrayList<>(season.completed());
        season.remaining().forEach(g -> games.add(outcome(g, 0)));
        for (int assignment = 0; assignment < count; assignment++) {
            ComputeGate.checkpoint();
            for (int i = 0; i < season.remaining().size(); i++)
                games.set(season.completed().size() + i, outcome(season.remaining().get(i), (assignment & (1 << i)) != 0 ? 0 : 1));
            var result = SimulationService.seed(season.teams(), games,
                    rules.equals("madden") ? SimulationService.Rules.MADDEN : SimulationService.Rules.NFL);
            var ambiguous = ambiguousConferences(result, futureTeams);
            for (var team : season.teams()) for (var goal : Goal.values())
                values.get(team.abbr())[goal.ordinal()][assignment] = ambiguous.contains(team.conference()) ? Classification.UNKNOWN
                        : achieved(result, team.abbr(), goal) ? Classification.IN : Classification.OUT;
        }
        return Map.copyOf(values);
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
            ComputeGate.checkpoint();
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
