package com.rzs.stats.service;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class EloCalibrationService {
    public record Bucket(double low, double high, int games, double predicted, double actual) {}
    public record Report(int games, double brier, double coinFlipBrier, List<Bucket> buckets) {}

    private final EloHistoryService history;

    public EloCalibrationService(EloHistoryService history) {
        this.history = history;
    }

    @Cacheable(value = "eloCalibration", key = "#season == null ? 'all' : #season", sync = true)
    public Report report(Integer season) {
        int[] counts = new int[10];
        double[] predicted = new double[10];
        double[] actual = new double[10];
        int games = 0;
        double brier = 0;
        double coinFlipBrier = 0;
        for (EloService.Result result : history.getTimeline().games()) {
            EloService.Game game = result.game();
            if (game.stage() != 1 || game.week() < 0 || game.week() > 17
                    || season != null && game.season() != season) continue;
            double probability = result.homeWinProbability();
            double outcome = game.homeScore() > game.awayScore() ? 1 : game.homeScore() == game.awayScore() ? 0.5 : 0;
            int bucket = Math.min((int) (probability * 10), 9);
            counts[bucket]++;
            predicted[bucket] += probability;
            actual[bucket] += outcome;
            games++;
            brier += (probability - outcome) * (probability - outcome);
            coinFlipBrier += (0.5 - outcome) * (0.5 - outcome);
        }
        List<Bucket> buckets = new ArrayList<>();
        for (int i = 0; i < counts.length; i++) {
            if (counts[i] == 0) continue;
            buckets.add(new Bucket(i / 10.0, (i + 1) / 10.0, counts[i],
                    predicted[i] / counts[i], actual[i] / counts[i]));
        }
        return new Report(games, games == 0 ? 0 : brier / games,
                games == 0 ? 0 : coinFlipBrier / games, List.copyOf(buckets));
    }
}
