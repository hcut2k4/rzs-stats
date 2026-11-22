package com.rzs.stats.playoffs;

import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.IntStream;

@Service
public class SimulationService {
    public enum Outcome { HOME, AWAY, TIE }
    public enum Rules { MADDEN, NFL }
    public record Counts(long playoffs, long division, long oneSeed, List<Long> seedCounts) {}
    public record Simulation(int simulations, Map<String, Counts> teams) {}
    public record ChampionshipCounts(long round2, long conferenceFinal, long finalCount, long champion) {}
    public record Championship(Simulation baseline, Map<String, ChampionshipCounts> teams) {}
    @FunctionalInterface
    public interface PlayoffProbability {
        double probability(String home, String away, boolean neutral);
    }

    public Championship championship(SeasonStateLoader.State state, Map<Integer, Double> probs,
                                     int sims, long seed, Rules rules, PlayoffProbability playoffProbability) {
        return run(state, probs, Map.of(), sims, seed, rules, false, Objects.requireNonNull(playoffProbability));
    }

    public Simulation simulate(SeasonStateLoader.State state, Map<Integer, Double> probs,
                               Map<Integer, Outcome> forced, int sims, long seed, Rules rules) {
        return simulate(state, probs, forced, sims, seed, rules, false);
    }

    public Simulation simulate(SeasonStateLoader.State state, Map<Integer, Double> probs,
                               Map<Integer, Outcome> forced, int sims, long seed, Rules rules,
                               boolean varyForcedMargins) {
        return run(state, probs, forced, sims, seed, rules, varyForcedMargins, null).baseline();
    }

    private Championship run(SeasonStateLoader.State state, Map<Integer, Double> probs,
                             Map<Integer, Outcome> forced, int sims, long seed, Rules rules,
                             boolean varyForcedMargins, PlayoffProbability playoffProbability) {
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
        boolean bracket = playoffProbability != null;
        int runs = state.remainingGames().isEmpty() && !bracket ? 1 : sims;
        var exact = state.remainingGames().isEmpty() ? seed(state.teams(), state.completedGames(), rules) : null;
        long[][] totals = IntStream.range(0, runs).parallel().collect(
                () -> new long[state.teams().size()][bracket ? 14 : 10],
                (counts, simulation) -> {
                    var result = exact != null ? exact : seed(state.teams(), games(state, probs, forced, simulation, seed, varyForcedMargins), rules);
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
                    if (bracket) bracket(result, index, counts, simulation, seed, playoffProbability);
                }, (a, b) -> {
                    for (int t = 0; t < a.length; t++) for (int c = 0; c < a[t].length; c++) a[t][c] += b[t][c];
                });
        var counts = new TreeMap<String, Counts>();
        index.forEach((team, i) -> {
            var row = totals[i];
            counts.put(team, new Counts(row[0], row[1], row[2], Arrays.stream(row, 3, 10).boxed().toList()));
        });
        var stages = new TreeMap<String, ChampionshipCounts>();
        if (bracket) index.forEach((team, i) -> stages.put(team,
                new ChampionshipCounts(totals[i][10], totals[i][11], totals[i][12], totals[i][13])));
        return new Championship(new Simulation(!bracket && state.remainingGames().isEmpty() ? 0 : sims,
                Collections.unmodifiableMap(counts)), Collections.unmodifiableMap(stages));
    }

    private void bracket(PlayoffSeeding.Result result, Map<String, Integer> index, long[][] counts,
                         int simulation, long seed, PlayoffProbability probability) {
        var finalists = new ArrayList<String>();
        int conference = 0;
        for (var entry : new TreeMap<>(result.conferences()).entrySet()) {
            var seeds = entry.getValue().stream().filter(r -> r.position() <= 7)
                    .sorted(Comparator.comparingInt(PlayoffSeeding.Rank::position))
                    .map(r -> r.teams().iterator().next()).toList();
            if (seeds.size() != 7) throw new IllegalStateException("Championship requires seven seeds per conference");
            var alive = new ArrayList<Integer>();
            alive.add(0);
            int slot = conference++ * 8;
            for (int i = 1; i <= 3; i++) {
                alive.add(winner(seeds, i, 7 - i, simulation, seed, slot++, probability));
            }
            alive.sort(Integer::compare);
            alive.forEach(i -> counts[index.get(seeds.get(i))][10]++);
            var conferenceFinal = new ArrayList<Integer>();
            conferenceFinal.add(winner(seeds, alive.get(0), alive.get(3), simulation, seed, slot++, probability));
            conferenceFinal.add(winner(seeds, alive.get(1), alive.get(2), simulation, seed, slot++, probability));
            conferenceFinal.sort(Integer::compare);
            conferenceFinal.forEach(i -> counts[index.get(seeds.get(i))][11]++);
            String finalist = seeds.get(winner(seeds, conferenceFinal.get(0), conferenceFinal.get(1), simulation, seed, slot, probability));
            counts[index.get(finalist)][12]++;
            finalists.add(finalist);
        }
        if (finalists.size() != 2) throw new IllegalStateException("Championship requires two conferences");
        String champion = draw(simulation, seed, 16) < probability.probability(finalists.get(0), finalists.get(1), true)
                ? finalists.get(0) : finalists.get(1);
        counts[index.get(champion)][13]++;
    }

    private int winner(List<String> seeds, int home, int away, int simulation, long seed, int slot,
                       PlayoffProbability probability) {
        return draw(simulation, seed, slot) < probability.probability(seeds.get(home), seeds.get(away), false) ? home : away;
    }

    private double draw(int simulation, long seed, int slot) {
        // A separate counter domain keeps playoff draws independent of regular-season game IDs.
        return (mix(seed ^ mix(simulation) ^ mix(slot + 0x9e3779b97f4a7c15L)) >>> 11) * 0x1.0p-53;
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
