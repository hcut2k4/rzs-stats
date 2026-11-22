package com.rzs.stats.playoffs;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.IntStream;

import static com.rzs.stats.playoffs.TiebreakerRules.Step.*;
import static org.junit.jupiter.api.Assertions.*;

class MaddenModelTest {
    private final List<PlayoffSeeding.Team> teams = new ArrayList<>();
    private final List<PlayoffSeeding.Game> games = new ArrayList<>();

    @Test
    void reproducesEveryObservedConferenceWhilePreservingTheNflBaseline() throws IOException {
        int maddenMatches = 0, nflMatches = 0, conferences = 0;
        var failures = new ArrayList<String>();
        for (var season : dataset()) {
            var teams = teams(season.get("teams"));
            var games = new ArrayList<PlayoffSeeding.Game>();
            for (var row : season.get("games")) {
                games.add(new PlayoffSeeding.Game(row.get(0).asInt(), row.get(1).asText(), row.get(2).asText(),
                        row.get(3).asInt(), row.get(4).asInt()));
            }
            var madden = MaddenSeeding.m3().seed(teams, games);
            var nfl = PlayoffSeeding.seed(teams, games);
            for (var conference : List.of("AFC", "NFC")) {
                var actual = seeds(madden, conference);
                var official = seeds(nfl, conference);
                var candidates = season.get("seeds").get(conference);
                boolean maddenMatch = matches(candidates, actual), nflMatch = matches(candidates, official);
                var label = season.get("id").asText() + " " + conference;
                System.out.println(label + " M3 " + actual + " " + (maddenMatch ? "MATCH" : "FAIL")
                        + " | NFL " + official + " " + (nflMatch ? "MATCH" : "DIFF"));
                if (maddenMatch) maddenMatches++;
                else failures.add(label + " expected " + candidates + ", got " + actual);
                if (nflMatch) nflMatches++;
                conferences++;
            }
        }
        System.out.println("M3 " + maddenMatches + "/" + conferences + "; NFL " + nflMatches + "/" + conferences);
        assertEquals(34, conferences);
        assertEquals(34, maddenMatches, failures.toString());
        assertEquals(19, nflMatches);
    }

    @Test
    void reproducesTheThreeHeldOutTiesUsingOnlyTheEightCompleteSchedules() throws IOException {
        var partial = new ObjectMapper().readTree(Path.of("src/test/resources/playoffs/sim2026-partial.json").toFile());
        teams.addAll(teams(dataset().get(0).get("teams")));
        var unique = new HashSet<PlayoffSeeding.Game>();
        var schedules = partial.get("schedules");
        assertEquals(8, schedules.size());
        schedules.fields().forEachRemaining(entry -> {
            for (var row : entry.getValue()) {
                boolean home = row.get(1).asText().equals("H");
                unique.add(new PlayoffSeeding.Game(row.get(0).asInt(), home ? entry.getKey() : row.get(2).asText(),
                        home ? row.get(2).asText() : entry.getKey(), row.get(home ? 3 : 4).asInt(), row.get(home ? 4 : 3).asInt()));
            }
        });
        games.addAll(unique);
        schedules.fields().forEachRemaining(entry -> assertEquals(17, games.stream()
                .filter(g -> g.home().equals(entry.getKey()) || g.away().equals(entry.getKey())).count()));
        assertAll(
                () -> assertEquals(List.of("GB"), rank(Set.of("GB", "DET", "CHI"), false, 1)),
                () -> assertEquals(List.of("ATL", "LAR", "GB"), rank(Set.of("ATL", "LAR", "GB"), false, 3)),
                () -> assertEquals(List.of("DET", "PHI"), rank(Set.of("DET", "PHI", "CHI"), true, 2)));
        System.out.println("Held-out M3 3/3: North GB; division winners ATL LAR GB; wild cards DET PHI");
    }

    @Test
    void twoClubTiesUseDivisionRecordBeforeConferenceRecordInEveryContext() {
        team("A", "AFC", "East"); team("B", "AFC", "West");
        team("D", "AFC", "East"); team("E", "AFC", "West");
        team("C", "AFC", "North"); team("X", "NFC", "North");
        win("A", "D"); win("E", "B"); win("C", "A"); win("C", "A");
        win("B", "C"); win("B", "C"); win("A", "X"); win("X", "B");
        assertEquals(List.of("A", "B"), rank(Set.of("A", "B"), false, 2));
        assertEquals(List.of("A", "B"), rank(Set.of("A", "B"), true, 2));
    }

    @Test
    void invertedMultiClubHeadToHeadPlacesTheNoGamesClubBetweenLoserAndWinner() {
        team("A", "AFC", "East"); team("B", "AFC", "West");
        team("C", "AFC", "North"); team("X", "NFC", "West");
        win("A", "B"); win("X", "A"); win("B", "X"); win("C", "X"); win("X", "C");
        assertEquals(List.of("B", "C", "A"), rank(Set.of("A", "B", "C"), false, 3));
        assertEquals(List.of("B", "C", "A"), rank(Set.of("A", "B", "C"), true, 3));
    }

    @Test
    void divisionTitleTiesInvertMultiClubHeadToHeadAndRestartEachTier() {
        for (var club : List.of("A", "B", "C")) team(club, "AFC", "East");
        win("A", "B"); win("A", "B"); win("B", "C"); win("C", "A");
        assertEquals(List.of("B", "C", "A"), rank(Set.of("A", "B", "C"), false, 3));
    }

    @Test
    void aClubWithALossToEveryPeerRanksLastEvenIfItAlsoBeatOneOfThem() {
        team("A", "AFC", "East"); team("B", "AFC", "West"); team("C", "AFC", "North");
        win("B", "A"); win("A", "C"); win("B", "C"); win("C", "B");
        win("B", "A");
        assertEquals(List.of("B", "A", "C"), rank(Set.of("A", "B", "C"), false, 3));
    }

    @Test
    void aSweepWinnerDoesNotAdvanceBeforeInvertedMultiClubHeadToHead() {
        team("A", "AFC", "East"); team("B", "AFC", "West"); team("C", "AFC", "North");
        win("A", "B"); win("A", "C"); win("B", "C"); win("C", "B");
        var ranks = PlayoffSeeding.rankMaddenTie(teams, games, Set.of("A", "B", "C"), false, 3);
        assertEquals(Set.of("B", "C"), ranks.getFirst().teams());
        assertEquals(PlayoffSeeding.Status.UNRESOLVED, ranks.getFirst().status());
        assertEquals(Set.of("A"), ranks.getLast().teams());
    }

    @Test
    void wildCardReductionKeepsTheWorseHeadToHeadClub() {
        team("A", "AFC", "East"); team("B", "AFC", "East"); team("C", "AFC", "West");
        win("A", "B"); win("B", "C");
        assertEquals(List.of("B", "C", "A"), rank(Set.of("A", "B", "C"), true, 3));
    }

    @Test
    void anEarlierWildCardFromTheDivisionRestoresNormalReductionHeadToHeadOnlyAtBetterRecords() {
        team("W", "AFC", "East"); team("H", "AFC", "East");
        team("A", "AFC", "East"); team("B", "AFC", "East");
        team("V", "AFC", "West"); team("C", "AFC", "West"); team("X", "NFC", "North");
        for (int i = 0; i < 4; i++) win("W", "X");
        for (int i = 0; i < 3; i++) win("V", "X");
        win("H", "X"); win("H", "X"); win("W", "H");
        win("A", "B"); win("X", "A"); win("B", "X"); win("C", "X"); win("V", "C");
        win("B", "C"); win("X", "B"); win("C", "X");
        var result = MaddenSeeding.m3().seed(teams, games);
        var wildCards = result.conferences().get("AFC").stream().filter(r -> r.position() >= 3 && r.position() <= 5)
                .map(r -> r.teams().iterator().next()).toList();
        assertEquals(List.of("H", "A", "C"), wildCards);
        assertTrue(result.trace().stream().anyMatch(t -> t.context().contains("division reduction")
                && t.tied().equals(Set.of("A", "B")) && t.step() == HEAD_TO_HEAD && t.remaining().equals(Set.of("A"))));
        assertEquals(List.of("B", "C", "A"), rank(Set.of("A", "B", "C"), true, 3));
    }

    @Test
    void cutoffQualifiersAreOrderedAgainAsAFreshTwoClubTie() {
        team("A", "AFC", "East"); team("B", "AFC", "West");
        team("C", "AFC", "North"); team("D", "AFC", "North"); team("X", "NFC", "West");
        win("A", "B"); win("X", "A"); win("B", "X"); win("C", "D"); win("X", "C");
        assertEquals(List.of("B", "C", "A"), rank(Set.of("A", "B", "C"), true, 3));
        assertEquals(List.of("C", "B"), rank(Set.of("A", "B", "C"), true, 2));
    }

    @Test
    void identicalRecordsRemainUnresolvedAtTheCutoffInsteadOfUsingAlphabeticalOrder() {
        team("A", "AFC", "East"); team("B", "AFC", "West"); team("C", "AFC", "North");
        games.add(new PlayoffSeeding.Game(0, "A", "B", 10, 10));
        games.add(new PlayoffSeeding.Game(1, "B", "C", 10, 10));
        games.add(new PlayoffSeeding.Game(2, "C", "A", 10, 10));
        var ranks = PlayoffSeeding.rankMaddenTie(teams, games, Set.of("A", "B", "C"), true, 2);
        assertEquals(1, ranks.size());
        assertEquals(Set.of("A", "B", "C"), ranks.getFirst().teams());
        assertEquals(PlayoffSeeding.Status.UNRESOLVED, ranks.getFirst().status());
        assertEquals(NET_POINTS_ALL, ranks.getFirst().unresolvedAt());
    }

    private JsonNode dataset() throws IOException {
        return new ObjectMapper().readTree(Path.of("src/test/resources/playoffs/analysis/dataset.json").toFile());
    }

    private List<PlayoffSeeding.Team> teams(JsonNode source) {
        var result = new ArrayList<PlayoffSeeding.Team>();
        source.fields().forEachRemaining(entry -> result.add(new PlayoffSeeding.Team(entry.getKey(),
                entry.getValue().get("conf").asText(), entry.getValue().get("div").asText())));
        return result;
    }

    private boolean matches(JsonNode candidates, List<String> actual) {
        for (var candidate : candidates) {
            var expected = new ArrayList<String>();
            candidate.forEach(t -> expected.add(t.asText()));
            if (expected.equals(actual)) return true;
        }
        return false;
    }

    private List<String> seeds(PlayoffSeeding.Result result, String conference) {
        return IntStream.rangeClosed(1, 7).mapToObj(position -> result.conferences().getOrDefault(conference, List.of()).stream()
                .filter(r -> r.position() == position && r.status() == PlayoffSeeding.Status.RESOLVED)
                .map(r -> r.teams().iterator().next()).findFirst().orElse("UNRESOLVED")).toList();
    }

    private void team(String abbr, String conference, String division) {
        teams.add(new PlayoffSeeding.Team(abbr, conference, division));
    }

    private void win(String winner, String loser) {
        games.add(new PlayoffSeeding.Game(games.size(), winner, loser, 20, 10));
    }

    private List<String> rank(Set<String> tied, boolean wildCard, int spots) {
        return PlayoffSeeding.rankMaddenTie(teams, games, tied, wildCard, spots).stream().map(r -> {
            assertEquals(PlayoffSeeding.Status.RESOLVED, r.status(), r.toString());
            return r.teams().iterator().next();
        }).toList();
    }
}
