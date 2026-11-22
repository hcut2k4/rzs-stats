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
            var madden = MaddenSeeding.madden27().seed(teams, games);
            var nfl = PlayoffSeeding.seed(teams, games);
            for (var conference : List.of("AFC", "NFC")) {
                var actual = seeds(madden, conference);
                var official = seeds(nfl, conference);
                var candidates = season.get("seeds").get(conference);
                boolean maddenMatch = matches(candidates, actual), nflMatch = matches(candidates, official);
                var label = season.get("id").asText() + " " + conference;
                System.out.println(label + " Madden27 " + actual + " " + (maddenMatch ? "MATCH" : "FAIL")
                        + " | NFL " + official + " " + (nflMatch ? "MATCH" : "DIFF"));
                if (maddenMatch) maddenMatches++;
                else failures.add(label + " expected " + candidates + ", got " + actual);
                if (nflMatch) nflMatches++;
                conferences++;
            }
        }
        System.out.println("Madden27 " + maddenMatches + "/" + conferences + "; NFL " + nflMatches + "/" + conferences);
        assertEquals(34, conferences);
        assertEquals(34, maddenMatches, failures.toString());
        assertEquals(19, nflMatches);
    }

    private final List<PlayoffSeeding.Team> clubs = new ArrayList<>();
    private final List<PlayoffSeeding.Game> schedule = new ArrayList<>();

    @Test
    void theLargestEqualWinSetAdvancesEvenWhenItsTeamsHaveNoWins() {
        clubs("A", "B", "C");
        win("A", "B"); win("A", "B");
        var result = balancedSeason();
        assertEquals(List.of("B", "C", "A"), order(result));
        var decision = result.trace().stream().filter(PlayoffSeeding.Trace::biggestSetFirst).findFirst().orElseThrow();
        assertEquals(HEAD_TO_HEAD, decision.step());
        assertEquals(Set.of("B", "C"), decision.remaining());
        assertEquals(Map.of("A", 2.0, "B", 0.0, "C", 0.0), decision.groupWins());
        assertEquals(decision.groupWins(), decision.values());
        assertTrue(decision.context().contains("seeding"));
    }

    @Test
    void differentWinCountsRankFromMostToFewest() {
        clubs("A", "B", "C");
        win("A", "B"); win("A", "C"); win("B", "C");
        var result = balancedSeason();
        assertEquals(List.of("A", "B", "C"), order(result));
        assertTrue(result.trace().stream().anyMatch(t -> t.step() == HEAD_TO_HEAD
                && t.tied().equals(Set.of("A", "B", "C")) && !t.biggestSetFirst()));
    }

    @Test
    void equallyLargeSetsRestartTogetherAfterTheOutsiderDropsBehindThem() {
        clubs("A", "B", "C", "D", "E");
        win("A", "B"); win("A", "C"); win("A", "D");
        win("B", "D"); win("B", "E"); win("C", "D"); win("C", "E");
        var result = balancedSeason();
        assertEquals("A", order(result).getLast());
        var decision = result.trace().stream().filter(t -> t.tied().equals(Set.of("A", "B", "C", "D", "E")))
                .findFirst().orElseThrow();
        assertEquals(Set.of("B", "C", "D", "E"), decision.remaining());
        assertEquals(Map.of("A", 3.0, "B", 2.0, "C", 2.0, "D", 0.0, "E", 0.0), decision.groupWins());
        assertTrue(result.trace().stream().anyMatch(t -> t.tied().equals(Set.of("B", "C", "D", "E"))
                && t.step() == COMMON_GAMES));
    }

    @Test
    void equallyLargeSetsRecountTheirWinsBeforeTryingTheNextCriterion() {
        clubs("A", "B", "C", "D", "E");
        win("A", "B"); win("A", "B"); win("A", "C");
        win("B", "A"); win("B", "D"); win("C", "D"); win("C", "E");
        var result = balancedSeason();
        assertEquals(List.of("D", "E", "C", "B", "A"), order(result));
        var decision = result.trace().stream().filter(t -> t.tied().equals(Set.of("B", "C", "D", "E")))
                .findFirst().orElseThrow();
        assertEquals(HEAD_TO_HEAD, decision.step());
        assertEquals(Set.of("D", "E"), decision.remaining());
        assertEquals(Map.of("B", 1.0, "C", 2.0, "D", 0.0, "E", 0.0), decision.groupWins());
    }

    @Test
    void tiedGamesCountAsHalfAWinWhenBuildingTheBiggestSet() {
        clubs("A", "B", "C");
        clubs.add(new PlayoffSeeding.Team("X", "NFC", "West"));
        win("A", "B"); win("X", "A"); win("B", "X");
        schedule.add(new PlayoffSeeding.Game(0, "B", "C", 10, 10));
        schedule.add(new PlayoffSeeding.Game(0, "B", "X", 10, 10));
        schedule.add(new PlayoffSeeding.Game(0, "C", "X", 10, 10));
        var result = MaddenSeeding.madden27().seed(clubs, schedule);
        assertEquals(List.of("B", "C", "A"), order(result));
        assertEquals(.5, result.records().get("B").winPercentage());
        var decision = result.trace().stream().filter(PlayoffSeeding.Trace::biggestSetFirst).findFirst().orElseThrow();
        assertEquals(Map.of("A", 1.0, "B", .5, "C", .5), decision.groupWins());
    }

    @Test
    void theDivisionWinnerUsesTheSameBiggestSetRule() {
        clubs("A", "B", "C");
        clubs.replaceAll(t -> new PlayoffSeeding.Team(t.abbr(), t.conference(), "East"));
        win("A", "B"); win("A", "B");
        var result = balancedSeason();
        assertEquals(1, result.divisionRanks().get("B").position());
        assertEquals(3, result.divisionRanks().get("A").position());
        assertTrue(result.trace().stream().anyMatch(t -> t.context().contains("division East") && t.biggestSetFirst()));
    }

    @Test
    void wildCardSeedsKeepTheGroupOrderAcrossThePlayoffCutoff() {
        for (var name : List.of("W", "A", "B", "C", "D", "H")) clubs.add(new PlayoffSeeding.Team(name, "AFC", "East"));
        for (var name : List.of("V", "U", "Z")) {
            clubs.add(new PlayoffSeeding.Team(name, "AFC", name));
            win(name, "X");
        }
        for (var name : List.of("A", "B", "C", "D", "H")) win("W", name);
        for (int i = 0; i < 5; i++) win("H", "X");
        win("A", "C"); win("A", "C"); win("A", "D");
        win("B", "A"); win("B", "D"); win("C", "D");
        for (var name : List.of("A", "B", "C", "D")) {
            long wins = schedule.stream().filter(g -> g.home().equals(name)).count();
            long losses = schedule.stream().filter(g -> g.away().equals(name)).count();
            for (long i = wins; i < 4; i++) win(name, "X");
            for (long i = losses; i < 4; i++) win("X", name);
        }
        clubs.add(new PlayoffSeeding.Team("X", "NFC", "West"));
        var result = MaddenSeeding.madden27().seed(clubs, schedule);
        assertEquals(List.of("H", "A", "B", "C", "D"), order(result).subList(4, 9));
        assertEquals(Set.of("A"), result.conferences().get("AFC").get(5).teams());
        assertEquals(Set.of("B"), result.conferences().get("AFC").get(6).teams());
    }

    @Test
    void exactTiesUseTheSameAlphabeticalFallbackAsPython() {
        clubs("B", "A", "C");
        schedule.add(new PlayoffSeeding.Game(0, "A", "B", 10, 10));
        schedule.add(new PlayoffSeeding.Game(0, "B", "C", 10, 10));
        schedule.add(new PlayoffSeeding.Game(0, "C", "A", 10, 10));
        var result = MaddenSeeding.madden27().seed(clubs, schedule);
        assertEquals(List.of("A", "B", "C"), order(result));
        assertTrue(result.trace().stream().anyMatch(t -> t.step() == ALPHABETICAL));
        assertTrue(result.unresolvedConferences().isEmpty());
    }

    @Test
    void conferencePointDifferentialDecisionsAreVisibleInTheTrace() {
        clubs("A", "B", "X");
        schedule.add(new PlayoffSeeding.Game(0, "A", "X", 30, 0));
        schedule.add(new PlayoffSeeding.Game(0, "X", "A", 10, 0));
        schedule.add(new PlayoffSeeding.Game(0, "B", "X", 20, 0));
        schedule.add(new PlayoffSeeding.Game(0, "X", "B", 10, 0));
        var result = MaddenSeeding.madden27().seed(clubs, schedule);
        assertTrue(order(result).indexOf("A") < order(result).indexOf("B"));
        var decision = result.trace().stream().filter(t -> t.tied().equals(Set.of("A", "B"))).findFirst().orElseThrow();
        assertEquals(NET_POINTS_CONFERENCE, decision.step());
        assertEquals(Map.of("A", 20.0, "B", 10.0), decision.values());
    }

    @Test
    void overallPointDifferentialDecisionsAreVisibleInTheTrace() {
        clubs("A", "B");
        clubs.add(new PlayoffSeeding.Team("X", "NFC", "West"));
        schedule.add(new PlayoffSeeding.Game(0, "A", "X", 30, 0));
        schedule.add(new PlayoffSeeding.Game(0, "X", "A", 10, 0));
        schedule.add(new PlayoffSeeding.Game(0, "B", "X", 20, 0));
        schedule.add(new PlayoffSeeding.Game(0, "X", "B", 10, 0));
        var result = MaddenSeeding.madden27().seed(clubs, schedule);
        assertEquals(List.of("A", "B"), order(result));
        assertTrue(result.trace().stream().anyMatch(t -> t.step() == NET_POINTS_ALL && t.remaining().equals(Set.of("A"))));
    }

    @Test
    void strengthAveragesOpponentPercentagesAndCountsRepeatMeetings() {
        clubs("A", "B", "C");
        win("A", "B"); win("A", "B"); win("A", "C"); win("B", "C");
        var record = MaddenSeeding.madden27().seed(clubs, schedule).records().get("A");
        assertEquals(2.0 / 9, record.strengthOfVictory(), 1e-12);
        assertEquals(2.0 / 9, record.strengthOfSchedule(), 1e-12);
    }

    @Test
    void postseasonGamesDoNotChangeTheRegularSeasonSeedsOrRecords() {
        clubs("A", "B");
        win("A", "B");
        var expected = MaddenSeeding.madden27().seed(clubs, schedule);
        schedule.add(new PlayoffSeeding.Game(18, "B", "A", 100, 0));
        assertEquals(expected, MaddenSeeding.madden27().seed(clubs, schedule));
    }

    @Test
    void invalidSchedulesAndDuplicateTeamsAreRejected() {
        clubs("A", "B");
        assertThrows(IllegalArgumentException.class, () -> MaddenSeeding.madden27().seed(clubs,
                List.of(new PlayoffSeeding.Game(0, "A", "X", 10, 0))));
        assertThrows(IllegalArgumentException.class, () -> MaddenSeeding.madden27().seed(clubs,
                List.of(new PlayoffSeeding.Game(0, "A", "A", 10, 0))));
        assertThrows(IllegalArgumentException.class, () -> MaddenSeeding.madden27().seed(clubs,
                List.of(new PlayoffSeeding.Game(0, "A", "B", -1, 0))));
        clubs.add(clubs.getFirst());
        assertThrows(IllegalArgumentException.class, () -> MaddenSeeding.madden27().seed(clubs, List.of()));
    }

    private void clubs(String... names) {
        for (var name : names) clubs.add(new PlayoffSeeding.Team(name, "AFC", name));
    }

    private void win(String winner, String loser) {
        schedule.add(new PlayoffSeeding.Game(0, winner, loser, 20, 10));
    }

    private PlayoffSeeding.Result balancedSeason() {
        for (var club : List.copyOf(clubs)) {
            long wins = schedule.stream().filter(g -> g.home().equals(club.abbr())).count();
            long losses = schedule.stream().filter(g -> g.away().equals(club.abbr())).count();
            for (long i = wins; i < 4; i++) win(club.abbr(), "X");
            for (long i = losses; i < 4; i++) win("X", club.abbr());
        }
        clubs.add(new PlayoffSeeding.Team("X", "NFC", "West"));
        return MaddenSeeding.madden27().seed(clubs, schedule);
    }

    private List<String> order(PlayoffSeeding.Result result) {
        return result.conferences().get("AFC").stream().map(r -> r.teams().iterator().next()).toList();
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

}
