package com.rzs.stats.playoffs;

public class MaddenSeedingBenchmark {
    public static void main(String[] args) throws Exception {
        var seasons = MaddenSeedingFixtureTest.seasons();
        var model = MaddenSeeding.madden27();
        int iterations = 20_000;
        long checksum = 0;
        for (int i = 0; i < 5_000; i++) {
            var season = seasons.get(i % seasons.size());
            checksum += model.seed(season.teams(), season.games()).trace().size();
        }
        long start = System.nanoTime();
        for (int i = 0; i < iterations; i++) {
            var season = seasons.get(i % seasons.size());
            checksum += model.seed(season.teams(), season.games()).trace().size();
        }
        System.out.printf("Madden27: %.4f ms per full 32-team season (%d seasons; checksum %d)%n",
                (System.nanoTime() - start) / 1e6 / iterations, iterations, checksum);
    }
}
