package com.rzs.stats.service;

import com.rzs.stats.model.dto.EloConfig;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class EloService {
    public record Team(int teamId, String abbrName, String displayName) {}
    public record OwnerChange(int season, int week, int teamId, String abbr) {}
    public record Game(Integer gameId, Long id, int season, int stage, int week,
                       Team home, Team away, int homeScore, int awayScore) {}
    public record Result(Game game, double homePregameElo, double awayPregameElo,
                         double homeWinProbability, double awayWinProbability, long margin,
                         double movMultiplier, double pointsMoved, double homePostgameElo, double awayPostgameElo) {}
    public record Snapshot(Team team, int season, int week, boolean seasonStart, boolean ownerReset, double startElo,
                           double endElo, double change, double prevElo, int rank, int prevRank, int gamesCounted) {}
    public record Timeline(EloConfig config, List<Snapshot> history, List<Result> games) {
        public Timeline {
            history = List.copyOf(history);
            games = List.copyOf(games);
        }
    }

    public double probability(double ratingA, double ratingB, EloConfig config) {
        return 1 / (1 + Math.pow(10, (ratingB - ratingA) / config.divisor()));
    }

    public double regress(double rating, EloConfig config) {
        return config.initialRating() + (rating - config.initialRating()) * config.offseasonRetention();
    }

    public Result play(Game game, double home, double away, EloConfig config) {
        long margin = Math.abs((long) game.homeScore() - game.awayScore());
        double multiplier = 1;
        if (config.movEnabled() && margin != 0) {
            double winnerDiff = game.homeScore() > game.awayScore() ? home - away : away - home;
            double denominator = 2.2 + 0.001 * winnerDiff;
            double adjusted = Math.log1p(Math.min(margin, config.marginCap())) * 2.2 / denominator;
            if (denominator > 0 && Double.isFinite(adjusted)) multiplier = adjusted;
        }
        double expected = probability(home + config.homeFieldAdvantage(), away, config);
        double actual = game.homeScore() > game.awayScore() ? 1 : game.homeScore() == game.awayScore() ? 0.5 : 0;
        double points = config.k() * multiplier * (actual - expected);
        return new Result(game, home, away, expected, 1 - expected, margin, multiplier, points,
                home + points, away - points);
    }

    public Timeline compute(List<Game> input, Collection<Team> teams, EloConfig config) {
        return compute(input, teams, config, List.of());
    }

    public Timeline compute(List<Game> input, Collection<Team> teams, EloConfig config, List<OwnerChange> changes) {
        Map<Integer, Map<Integer, Set<Integer>>> changesByWeek = new HashMap<>();
        for (OwnerChange change : changes) {
            changesByWeek.computeIfAbsent(change.season(), season -> new HashMap<>())
                    .computeIfAbsent(change.week(), week -> new HashSet<>()).add(change.teamId());
        }
        List<Game> games = input.stream().sorted(Comparator.comparingInt(Game::season)
                .thenComparingInt(Game::stage).thenComparingInt(Game::week)
                .thenComparing(Game::id, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(Game::gameId, Comparator.nullsLast(Comparator.naturalOrder()))).toList();
        Map<Integer, Team> teamMap = new TreeMap<>();
        teams.forEach(t -> teamMap.put(t.teamId(), t));
        games.forEach(g -> { teamMap.put(g.home().teamId(), g.home()); teamMap.put(g.away().teamId(), g.away()); });
        Map<Integer, Double> ratings = new HashMap<>();
        teamMap.keySet().forEach(id -> ratings.put(id, config.initialRating()));
        Map<Integer, Integer> counts = new HashMap<>();
        Map<Integer, Integer> previousRanks = ranks(ratings);
        List<Snapshot> history = new ArrayList<>();
        List<Result> results = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        Integer previousSeason = null;
        int index = 0;
        while (index < games.size()) {
            Game first = games.get(index);
            Map<Integer, Double> previousElos = new HashMap<>(ratings);
            boolean seasonStart = !Objects.equals(previousSeason, first.season());
            if (previousSeason != null && seasonStart) ratings.replaceAll((id, rating) -> regress(rating, config));
            Set<Integer> ownerResets = new HashSet<>();
            if (!seasonStart) {
                for (int id : changesByWeek.getOrDefault(first.season(), Map.of()).getOrDefault(first.week(), Set.of())) {
                    if (!teamMap.containsKey(id)) continue;
                    ratings.put(id, regress(ratings.get(id), config));
                    ownerResets.add(id);
                }
            }
            Map<Integer, Double> starts = new HashMap<>(ratings);
            while (index < games.size() && games.get(index).season() == first.season() && games.get(index).week() == first.week()) {
                Game game = games.get(index++);
                String key = game.season() + ":" + (game.gameId() != null ? game.gameId() : game.id());
                if (!seen.add(key)) continue;
                int h = game.home().teamId(), a = game.away().teamId();
                Result result = play(game, ratings.get(h), ratings.get(a), config);
                results.add(result);
                ratings.put(h, result.homePostgameElo());
                ratings.put(a, result.awayPostgameElo());
                counts.merge(h, 1, Integer::sum);
                counts.merge(a, 1, Integer::sum);
            }
            Map<Integer, Integer> currentRanks = ranks(ratings);
            for (Team team : teamMap.values()) {
                int id = team.teamId();
                history.add(new Snapshot(team, first.season(), first.week(), seasonStart, ownerResets.contains(id), starts.get(id),
                        ratings.get(id), ratings.get(id) - starts.get(id), previousElos.get(id), currentRanks.get(id), previousRanks.get(id), counts.getOrDefault(id, 0)));
            }
            previousRanks = currentRanks;
            previousSeason = first.season();
        }
        return new Timeline(config, history, results);
    }

    private Map<Integer, Integer> ranks(Map<Integer, Double> ratings) {
        List<Integer> ids = ratings.keySet().stream().sorted(Comparator
                .<Integer>comparingDouble(ratings::get).reversed().thenComparingInt(Integer::intValue)).toList();
        Map<Integer, Integer> ranks = new HashMap<>();
        for (int i = 0; i < ids.size(); i++) ranks.put(ids.get(i), i + 1);
        return ranks;
    }
}
