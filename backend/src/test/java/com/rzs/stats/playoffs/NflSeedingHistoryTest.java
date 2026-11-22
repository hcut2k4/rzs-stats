package com.rzs.stats.playoffs;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class NflSeedingHistoryTest {
    // These seasons use oracle strength conventions that differ from the official definition.
    private static final Set<Integer> EXCLUDED_STRENGTH_SEASONS = Set.of(2002, 2008, 2012, 2014, 2018, 2019, 2022);

    private record Standing(int season, String conference, String division, String team,
                            int wins, int losses, int ties, int divisionRank, double sov, double sos, Integer seed) {}
    private record Season(List<Standing> standings, PlayoffSeeding.Result result) {}

    private List<Season> seasons() throws IOException {
        var standings = new TreeMap<Integer, List<Standing>>();
        var standingLines = Files.readAllLines(Path.of("src/test/resources/nfl/standings.csv"));
        for (var line : standingLines.subList(1, standingLines.size())) {
            var c = line.split(",", -1);
            var row = new Standing(Integer.parseInt(c[0]), c[1], c[2], c[3], Integer.parseInt(c[4]),
                    Integer.parseInt(c[5]), Integer.parseInt(c[6]), Integer.parseInt(c[7]),
                    Double.parseDouble(c[8]), Double.parseDouble(c[9]), c[10].isEmpty() ? null : Integer.valueOf(c[10]));
            standings.computeIfAbsent(row.season(), k -> new ArrayList<>()).add(row);
        }
        var games = new HashMap<Integer, List<PlayoffSeeding.Game>>();
        var lines = Files.readAllLines(Path.of("src/test/resources/nfl/games.csv"));
        for (var line : lines.subList(1, lines.size())) {
            var c = line.split(",");
            games.computeIfAbsent(Integer.parseInt(c[0]), k -> new ArrayList<>()).add(new PlayoffSeeding.Game(
                    Integer.parseInt(c[1]), c[4], c[2], Integer.parseInt(c[5]), Integer.parseInt(c[3])));
        }
        var result = new ArrayList<Season>();
        for (var entry : standings.entrySet()) {
            var teams = entry.getValue().stream().map(s -> new PlayoffSeeding.Team(s.team(), s.conference(), s.division())).toList();
            result.add(new Season(entry.getValue(), PlayoffSeeding.seed(teams, games.get(entry.getKey()))));
        }
        assertEquals(24, result.size());
        return result;
    }

    @Test
    void reproducesEveryPlayoffSeedAndDivisionRankFrom2002Through2025() throws IOException {
        var failures = new ArrayList<String>();
        var unresolved = new ArrayList<String>();
        for (var season : seasons()) {
            var result = season.result();
            int year = season.standings().getFirst().season();
            var conferences = new TreeSet<>(result.conferences().keySet());
            conferences.addAll(result.unresolvedConferences().keySet());
            assertEquals(Set.of("AFC", "NFC"), conferences, "Conferences in " + year);
            result.unresolvedConferences().forEach((conference, ranks) ->
                    unresolved.add(year + " " + conference + " depends on unresolved division order " + ranks));
            for (var conference : result.conferences().entrySet()) {
                int playoffCount = year < 2020 ? 6 : 7;
                assertEquals(16, conference.getValue().stream().mapToInt(r -> r.teams().size()).sum());
                for (var rank : conference.getValue()) {
                    if (rank.status() == PlayoffSeeding.Status.UNRESOLVED) {
                        unresolved.add(year + " " + conference.getKey() + " positions " + rank.position() + " " + rank.teams() + " " + rank.unresolvedAt());
                    }
                    if (rank.position() > playoffCount) continue;
                    var expected = new TreeSet<String>();
                    season.standings().stream().filter(s -> s.conference().equals(conference.getKey()) && s.seed() != null
                            && s.seed() >= rank.position() && s.seed() < rank.position() + rank.teams().size()).forEach(s -> expected.add(s.team()));
                    if (rank.position() + rank.teams().size() - 1 <= playoffCount) {
                        if (!expected.equals(rank.teams())) failures.add(year + " " + conference.getKey() + " seed " + rank.position() + " expected " + expected + " got " + rank);
                    } else if (!rank.teams().containsAll(expected)) {
                        failures.add(year + " " + conference.getKey() + " playoff boundary expected " + expected + " got " + rank);
                    }
                }
            }
            for (var standing : season.standings()) {
                var rank = result.divisionRanks().get(standing.team());
                var expected = new TreeSet<String>();
                season.standings().stream().filter(s -> s.division().equals(standing.division())
                        && s.divisionRank() >= rank.position() && s.divisionRank() < rank.position() + rank.teams().size()).forEach(s -> expected.add(s.team()));
                if (!rank.teams().equals(expected)) failures.add(year + " " + standing.team() + " division expected " + expected + " got " + rank);
            }
            result.trace().stream().filter(t -> t.status() == PlayoffSeeding.Status.UNRESOLVED
                    && !t.context().contains("wild cards") && !t.context().contains("division winners"))
                    .forEach(t -> unresolved.add(year + " division " + t));
        }
        System.out.println("NFL history UNRESOLVED ranking groups: " + unresolved.size());
        unresolved.forEach(System.out::println);
        assertTrue(failures.isEmpty(), String.join("\n", failures));
    }

    @Test
    void strengthOfVictoryAndScheduleMatchOracleWhereOracleUsesOfficialDefinition() throws IOException {
        var failures = new ArrayList<String>();
        for (var season : seasons()) {
            for (var standing : season.standings()) {
                var record = season.result().records().get(standing.team());
                String label = standing.season() + " " + standing.team();
                assertEquals(standing.wins(), record.wins(), label + " wins");
                assertEquals(standing.losses(), record.losses(), label + " losses");
                assertEquals(standing.ties(), record.ties(), label + " ties");
                if (EXCLUDED_STRENGTH_SEASONS.contains(standing.season())) continue;
                if (Math.abs(standing.sov() - record.strengthOfVictory()) > 1e-5) failures.add(label + " SOV expected " + standing.sov() + " got " + record.strengthOfVictory());
                if (Math.abs(standing.sos() - record.strengthOfSchedule()) > 1e-5) failures.add(label + " SOS expected " + standing.sos() + " got " + record.strengthOfSchedule());
            }
        }
        System.out.println("NFL oracle SOV/SOS mismatches: " + failures.size());
        assertTrue(failures.isEmpty(), String.join("\n", failures));
    }
}
