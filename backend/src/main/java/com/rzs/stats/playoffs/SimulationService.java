package com.rzs.stats.playoffs;

import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.IntStream;

@Service
public class SimulationService {
    public enum Outcome { HOME, AWAY, TIE }
    public enum Rules { MADDEN, NFL }
    public record Counts(long playoffs, long division, long oneSeed, List<Long> seedCounts) {}
    public record WinBucket(long simulations, long playoffs, long division, long oneSeed) {}
    public record Simulation(int simulations, Map<String, Counts> teams, Map<Integer, WinBucket> wins) {}

    public Simulation simulate(SeasonStateLoader.State state, Map<Integer, Double> probs,
                               Map<Integer, Outcome> forced, int sims, long seed, Rules rules) {
        return simulate(state, probs, forced, sims, seed, rules, false);
    }

    public Simulation simulate(SeasonStateLoader.State state, Map<Integer, Double> probs,
                               Map<Integer, Outcome> forced, int sims, long seed, Rules rules,
                               boolean varyForcedMargins) {
        return simulate(state, probs, forced, sims, seed, rules, varyForcedMargins, null);
    }

    public Simulation simulate(SeasonStateLoader.State state, Map<Integer, Double> probs,
                               Map<Integer, Outcome> forced, int sims, long seed, Rules rules,
                               boolean varyForcedMargins, String trackTeam) {
        if (sims <= 0) throw new IllegalArgumentException("Simulations must be positive");
        var ids = new HashSet<Integer>();
        for (var game : state.remainingGames()) {
            if (!ids.add(game.gameId())) throw new IllegalArgumentException("Duplicate game id");
            if (!forced.containsKey(game.gameId())) {
                Double p = probs.get(game.gameId());
                if (p == null || !Double.isFinite(p) || p < 0 || p > 1) throw new IllegalArgumentException("Invalid probability for " + game.gameId());
            }
        }
        if (!ids.containsAll(forced.keySet()) || forced.values().stream().anyMatch(Objects::isNull)) throw new IllegalArgumentException("Invalid forced game");
        var index = new HashMap<String, Integer>();
        for (int i = 0; i < state.teams().size(); i++) index.put(state.teams().get(i).abbr(), i);
        if (trackTeam != null && !index.containsKey(trackTeam)) throw new IllegalArgumentException("Unknown tracked team");
        int buckets = trackTeam == null ? 0 : 1 + (int) (state.completedGames().stream()
                .filter(g -> g.home().equals(trackTeam) || g.away().equals(trackTeam)).count()
                + state.remainingGames().stream().filter(g -> g.home().equals(trackTeam) || g.away().equals(trackTeam)).count());
        int runs = state.remainingGames().isEmpty() ? 1 : sims;
        long[][] totals = IntStream.range(0, runs).parallel().collect(
                () -> new long[state.teams().size() + (trackTeam == null ? 0 : buckets)][10],
                (counts, simulation) -> {
                    var result = seed(state.teams(), games(state, probs, forced, simulation, seed, varyForcedMargins), rules);
                    if (trackTeam != null) {
                        int wins = result.records().get(trackTeam).wins();
                        var bucket = counts[state.teams().size() + wins];
                        bucket[0]++;
                        for (var goal : ClinchAnalyzer.Goal.values())
                            if (ClinchAnalyzer.achieved(result, trackTeam, goal)) bucket[goal.ordinal() + 1]++;
                    }
                    result.divisionRanks().forEach((team, rank) -> {
                        if (rank.position() == 1) counts[index.get(team)][1]++;
                    });
                    result.conferences().values().forEach(ranks -> ranks.forEach(rank -> {
                        if (rank.position() <= 7) {
                            var row = counts[index.get(rank.teams().iterator().next())];
                            row[0]++;
                            if (rank.position() == 1) row[2]++;
                            row[rank.position() + 2]++;
                        }
                    }));
                }, (a, b) -> {
                    for (int t = 0; t < a.length; t++) for (int c = 0; c < 10; c++) a[t][c] += b[t][c];
                });
        var counts = new TreeMap<String, Counts>();
        index.forEach((team, i) -> {
            var row = totals[i];
            counts.put(team, new Counts(row[0], row[1], row[2], Arrays.stream(row, 3, 10).boxed().toList()));
        });
        var wins = new TreeMap<Integer, WinBucket>();
        if (trackTeam != null) for (int w = 0; w < buckets; w++) {
            var row = totals[state.teams().size() + w];
            if (row[0] > 0) wins.put(w, new WinBucket(row[0], row[1], row[2], row[3]));
        }
        return new Simulation(state.remainingGames().isEmpty() ? 0 : sims, Collections.unmodifiableMap(counts), Collections.unmodifiableMap(wins));
    }

    public List<PlayoffSeeding.Game> games(SeasonStateLoader.State state, Map<Integer, Double> probs,
                                          Map<Integer, Outcome> forced, int simulation, long seed) {
        return games(state, probs, forced, simulation, seed, false);
    }

    public List<PlayoffSeeding.Game> games(SeasonStateLoader.State state, Map<Integer, Double> probs,
                                          Map<Integer, Outcome> forced, int simulation, long seed,
                                          boolean varyForcedMargins) {
        var games = new ArrayList<>(state.completedGames());
        for (var game : state.remainingGames()) {
            long counter = mix(seed ^ mix(simulation) ^ mix(Integer.toUnsignedLong(game.gameId()) + 0x632be59bd9b4e019L));
            var outcome = forced.get(game.gameId());
            if (outcome == null) outcome = (counter >>> 11) * 0x1.0p-53 < probs.get(game.gameId()) ? Outcome.HOME : Outcome.AWAY;
            long marginCounter = forced.containsKey(game.gameId()) && !varyForcedMargins ? mix(seed ^ game.gameId()) : mix(counter);
            int margin = MARGINS[(int) Long.remainderUnsigned(marginCounter, MARGINS.length)];
            games.add(outcomeGame(game.week(), game.home(), game.away(), outcome, margin));
        }
        return games;
    }

    // Loser scores 20; margins 1, 3, 7, 10, 14, 21 are equally likely; forced ties score 20-20.
    private static final int[] MARGINS = {1, 3, 7, 10, 14, 21};

    public static PlayoffSeeding.Game outcomeGame(int week, String home, String away, Outcome outcome, int margin) {
        if (margin <= 0) throw new IllegalArgumentException("Margin must be positive");
        return new PlayoffSeeding.Game(week, home, away, 20 + (outcome == Outcome.HOME ? margin : 0),
                20 + (outcome == Outcome.AWAY ? margin : 0));
    }

    static PlayoffSeeding.Result seed(List<PlayoffSeeding.Team> teams, List<PlayoffSeeding.Game> games, Rules rules) {
        return rules == Rules.MADDEN ? MaddenSeeding.madden27().seed(teams, games) : PlayoffSeeding.seedForPicture(teams, games);
    }

    static long mix(long z) {
        z = (z ^ (z >>> 30)) * 0xbf58476d1ce4e5b9L;
        z = (z ^ (z >>> 27)) * 0x94d049bb133111ebL;
        return z ^ (z >>> 31);
    }
}
