package com.rzs.stats.playoffs;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Path;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class RzsMaddenSeedingTest {
    record Season(List<PlayoffSeeding.Team> teams, List<PlayoffSeeding.Game> games,
                  Map<String, List<String>> maddenSeeds) {}

    @Test
    void nflRulesMatchBothAfcFieldsAndExposeNfcSeedingDifferences() throws IOException {
        var seasons = new ObjectMapper().readValue(Path.of("src/test/resources/playoffs/rzs-seasons.json").toFile(),
                new com.fasterxml.jackson.core.type.TypeReference<Map<String, Season>>() {});
        for (var entry : seasons.entrySet()) {
            var season = entry.getValue();
            var result = PlayoffSeeding.seed(season.teams(), season.games());
            assertTrue(result.unresolvedConferences().isEmpty());
            System.out.println("RZS season " + entry.getKey());
            for (var conference : result.conferences().entrySet()) {
                var seeds = conference.getValue().stream().filter(r -> r.position() <= 7).toList();
                assertTrue(seeds.stream().allMatch(r -> r.status() == PlayoffSeeding.Status.RESOLVED));
                var nfl = seeds.stream().map(r -> r.teams().iterator().next()).toList();
                var madden = season.maddenSeeds().get(conference.getKey());
                System.out.println(conference.getKey() + " NFL    " + nfl);
                System.out.println(conference.getKey() + " Madden " + madden);
                for (int i = 0; i < 7; i++) {
                    if (!nfl.get(i).equals(madden.get(i))) System.out.println("  Disagreement seed " + (i + 1) + ": NFL " + nfl.get(i) + ", Madden " + madden.get(i));
                }
                if (conference.getKey().equals("AFC")) assertEquals(madden, nfl);
                else assertEquals(entry.getKey().equals("103")
                        ? List.of("TB", "GB", "SF", "WAS", "NYG", "AZ", "ATL")
                        : List.of("ATL", "NYG", "CHI", "SF", "NO", "DET", "WAS"), nfl);
            }
            System.out.println("Tie decisions:");
            result.trace().forEach(t -> System.out.println("  " + t.context() + ": " + t.tied() + " -- "
                    + (t.step() == null ? "DIVISION_ORDER" : t.step()) + " --> " + t.remaining() + " " + t.status()));
        }
    }
}
