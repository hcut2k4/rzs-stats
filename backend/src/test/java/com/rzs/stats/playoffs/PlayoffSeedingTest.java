package com.rzs.stats.playoffs;

import org.junit.jupiter.api.Test;

import java.util.*;

import static com.rzs.stats.playoffs.TiebreakerRules.Step.*;
import static com.rzs.stats.playoffs.TiebreakerRules.*;
import static org.junit.jupiter.api.Assertions.*;

class PlayoffSeedingTest {
    private final List<PlayoffSeeding.Team> teams = new ArrayList<>();
    private final List<PlayoffSeeding.Game> games = new ArrayList<>();

    private TiebreakerRules variant(HeadToHeadMode head, NoGamesPolicy noGames, InvertedScope scope,
                                   RankingMode ranking, boolean reduce) {
        var nfl = TiebreakerRules.nfl();
        return new TiebreakerRules(nfl.divisionTwo(), nfl.divisionMultiple(), nfl.wildCardTwo(), nfl.wildCardMultiple(),
                true, reduce, 4, head, noGames, scope, ranking);
    }

    private void team(String abbr, String conference, String division) {
        teams.add(new PlayoffSeeding.Team(abbr, conference, division));
    }

    private void win(String winner, String loser) {
        games.add(new PlayoffSeeding.Game(games.size(), winner, loser, 20, 10));
    }

    private void divisionFixture() {
        for (var abbr : List.of("A", "B", "C")) team(abbr, "AFC", "East");
        team("X", "NFC", "West");
        team("Y", "NFC", "North");
    }

    @Test
    void divisionSweepWinsAThreeClubTie() {
        divisionFixture();
        win("A", "B"); win("A", "C"); win("B", "C");
        win("X", "A"); win("Y", "A"); win("B", "X"); win("Y", "B");
        win("C", "X"); win("C", "Y");
        var result = PlayoffSeeding.seed(teams, games);
        assertEquals(1, result.divisionRanks().get("A").position());
        assertEquals(2, result.divisionRanks().get("B").position());
        assertEquals(3, result.divisionRanks().get("C").position());
        assertEquals(HEAD_TO_HEAD, result.trace().getFirst().step());
    }

    @Test
    void bestHeadToHeadPercentageWinsAThreeClubDivisionTieWithoutASweep() {
        divisionFixture();
        win("A", "B"); win("A", "B"); win("B", "C"); win("C", "A");
        win("X", "A"); win("B", "X"); win("C", "X"); win("Y", "C");
        var result = PlayoffSeeding.seed(teams, games);
        assertEquals(1, result.divisionRanks().get("A").position());
        assertEquals(HEAD_TO_HEAD, result.trace().getFirst().step());
        assertEquals(Set.of("A"), result.trace().getFirst().remaining());
    }

    @Test
    void eliminatingAThirdClubRestartsAtTheTwoClubHeadToHeadStep() {
        divisionFixture();
        win("A", "B"); win("A", "C"); win("C", "A"); win("B", "C"); win("B", "C");
        for (var abbr : List.of("A", "B")) {
            win(abbr, "X"); win("X", abbr); win("Y", abbr);
        }
        win("C", "X"); win("C", "Y");
        var result = PlayoffSeeding.seed(teams, games);
        assertEquals(Set.of("A", "B"), result.trace().get(0).remaining());
        assertEquals(HEAD_TO_HEAD, result.trace().get(1).step());
        assertEquals(Set.of("A"), result.trace().get(1).remaining());
        assertEquals(1, result.divisionRanks().get("A").position());
    }

    private void wildCardFixture() {
        team("W", "AFC", "East"); team("A", "AFC", "East"); team("B", "AFC", "East");
        team("V", "AFC", "West"); team("C", "AFC", "West");
        team("X", "NFC", "North"); team("Y", "NFC", "South");
        win("W", "A"); win("W", "B"); win("W", "X"); win("W", "Y");
        win("V", "C"); win("V", "X"); win("V", "Y");
    }

    @Test
    void sameDivisionWildCardsKeepTheirDivisionOrder() {
        wildCardFixture();
        win("A", "B"); win("A", "X");
        win("Y", "A");
        win("B", "X"); win("B", "Y"); win("C", "X");
        var result = PlayoffSeeding.seed(teams, games);
        var order = result.conferences().get("AFC").stream().flatMap(r -> r.teams().stream()).toList();
        assertTrue(order.indexOf("A") < order.indexOf("B"));
        assertEquals(result.records().get("A").winPercentage(), result.records().get("B").winPercentage());
    }

    @Test
    void wildCardDivisionReductionLetsTheLowerClubReenterAfterItsDivisionPeerAdvances() {
        wildCardFixture();
        win("A", "B"); win("A", "C"); win("X", "A");
        win("B", "X"); win("B", "Y");
        win("C", "X"); win("C", "Y");
        var result = PlayoffSeeding.seed(teams, games);
        var ranks = result.conferences().get("AFC");
        assertEquals(Set.of("A"), ranks.get(2).teams());
        assertEquals(Set.of("B"), ranks.get(3).teams());
        assertEquals(Set.of("C"), ranks.get(4).teams());
        assertTrue(result.trace().stream().anyMatch(t -> t.context().contains("division reduction")
                && t.tied().equals(Set.of("A", "B", "C")) && t.remaining().equals(Set.of("A", "C"))));
    }

    @Test
    void commonGamesNeedFourGamesPerWildCardClubButNotFourDistinctOpponents() {
        team("W", "AFC", "East"); team("A", "AFC", "East");
        team("V", "AFC", "West"); team("B", "AFC", "West");
        team("X", "NFC", "North"); team("Y", "NFC", "South");
        team("Z", "NFC", "East"); team("Q", "NFC", "West");
        win("W", "A"); win("W", "X"); win("W", "Y"); win("V", "B"); win("V", "X"); win("V", "Y");
        win("A", "X"); win("Y", "A"); win("B", "Y"); win("X", "B");
        win("A", "X"); win("Y", "B");
        win("Z", "A"); win("B", "Q");
        var three = PlayoffSeeding.seed(teams, games);
        assertFalse(three.trace().stream().anyMatch(t -> t.context().equals("AFC wild cards") && t.step() == COMMON_GAMES));
        win("A", "X"); win("X", "B"); win("Z", "A"); win("B", "Q");
        var four = PlayoffSeeding.seed(teams, games);
        assertEquals(Set.of("A"), four.conferences().get("AFC").stream().filter(r -> r.position() == 3).findFirst().orElseThrow().teams());
        assertTrue(four.trace().stream().anyMatch(t -> t.context().equals("AFC wild cards") && t.step() == COMMON_GAMES));
    }

    @Test
    void tiedGamesCountAsHalfAWinInBothTeamAndOpponentRecords() {
        team("A", "AFC", "East"); team("B", "NFC", "West"); team("C", "NFC", "North");
        win("A", "B");
        games.add(new PlayoffSeeding.Game(1, "B", "C", 10, 10));
        var result = PlayoffSeeding.seed(teams, games);
        assertEquals(0.25, result.records().get("B").winPercentage());
        assertEquals(0.25, result.records().get("A").strengthOfVictory());
        assertEquals(0.25, result.records().get("A").strengthOfSchedule());
    }

    @Test
    void unavailableTouchdownTotalsLeaveTheClubsUnresolved() {
        team("A", "AFC", "East"); team("B", "AFC", "West");
        games.add(new PlayoffSeeding.Game(0, "A", "B", 10, 10));
        var rank = PlayoffSeeding.seed(teams, games).conferences().get("AFC").getFirst();
        assertEquals(PlayoffSeeding.Status.UNRESOLVED, rank.status());
        assertEquals(Set.of("A", "B"), rank.teams());
        assertEquals(NET_TOUCHDOWNS, rank.unresolvedAt());
    }

    @Test
    void anUnresolvedDivisionDoesNotPromoteBothClubsToDivisionWinners() {
        team("A", "AFC", "East"); team("B", "AFC", "East");
        games.add(new PlayoffSeeding.Game(0, "A", "B", 10, 10));
        var result = PlayoffSeeding.seed(teams, games);
        assertFalse(result.conferences().containsKey("AFC"));
        var unresolved = result.unresolvedConferences().get("AFC").getFirst();
        assertEquals(Set.of("A", "B"), unresolved.teams());
        assertEquals(NET_TOUCHDOWNS, unresolved.unresolvedAt());
    }

    @Test
    void coinTossLeavesTheClubsUnresolvedWhenItIsTheNextConfiguredStep() {
        team("A", "AFC", "East"); team("B", "AFC", "West");
        games.add(new PlayoffSeeding.Game(0, "A", "B", 10, 10));
        var nfl = TiebreakerRules.nfl();
        var rules = new TiebreakerRules(nfl.divisionTwo(), nfl.divisionMultiple(), List.of(COIN_TOSS),
                nfl.wildCardMultiple(), true, true, 4);
        var rank = PlayoffSeeding.seed(teams, games, rules).conferences().get("AFC").getFirst();
        assertEquals(PlayoffSeeding.Status.UNRESOLVED, rank.status());
        assertEquals(Set.of("A", "B"), rank.teams());
        assertEquals(COIN_TOSS, rank.unresolvedAt());
    }

    @Test
    void combinedRankingsGiveTiedTeamsTheSameRankAndSkipTheOccupiedPositions() {
        team("A", "AFC", "East"); team("B", "AFC", "West");
        team("X", "NFC", "North"); team("Y", "NFC", "South"); team("Z", "NFC", "East");
        games.add(new PlayoffSeeding.Game(0, "A", "X", 7, 14));
        games.add(new PlayoffSeeding.Game(0, "A", "Y", 21, 7));
        games.add(new PlayoffSeeding.Game(0, "B", "X", 7, 0));
        games.add(new PlayoffSeeding.Game(0, "B", "Y", 0, 7));
        games.add(new PlayoffSeeding.Game(0, "X", "Z", 7, 28));
        games.add(new PlayoffSeeding.Game(0, "Y", "Z", 7, 21));
        var nfl = TiebreakerRules.nfl();
        var rules = new TiebreakerRules(nfl.divisionTwo(), nfl.divisionMultiple(), List.of(COMBINED_RANKING_ALL, COIN_TOSS),
                nfl.wildCardMultiple(), true, true, 4);
        var result = PlayoffSeeding.seed(teams, games, rules);
        assertEquals(Set.of("A"), result.conferences().get("AFC").getFirst().teams());
        assertTrue(result.trace().stream().anyMatch(t -> t.step() == COMBINED_RANKING_ALL && t.remaining().equals(Set.of("A"))));
    }

    @Test
    void opponentStrengthCombinesRecordsAndCountsRepeatedOpponentsPerGame() {
        team("A", "AFC", "East"); team("B", "NFC", "West"); team("C", "NFC", "North");
        win("A", "B"); win("A", "B"); win("A", "C"); win("B", "C");
        var record = PlayoffSeeding.seed(teams, games).records().get("A");
        assertEquals(2.0 / 8, record.strengthOfVictory());
        assertEquals(2.0 / 8, record.strengthOfSchedule());
    }

    @Test
    void equallyNamedDivisionsInDifferentConferencesStaySeparate() {
        team("A", "AFC", "East"); team("B", "AFC", "West"); team("X", "NFC", "East");
        win("A", "X"); win("X", "B");
        var result = PlayoffSeeding.seed(teams, games);
        assertEquals(Set.of("A"), result.divisionRanks().get("A").teams());
        assertEquals(Set.of("X"), result.divisionRanks().get("X").teams());
        assertEquals(1, result.divisionRanks().get("X").position());
    }

    @Test
    void invertedHeadToHeadUsesTheLowestPercentageWithoutRequiringASweep() {
        divisionFixture();
        win("A", "B"); win("A", "B"); win("B", "C"); win("C", "A");
        win("X", "A"); win("B", "X"); win("C", "X"); win("Y", "C");
        var rules = variant(HeadToHeadMode.INVERTED, NoGamesPolicy.NO_GAMES_ZERO, InvertedScope.ALL, RankingMode.NFL_RESTART, false);
        var result = PlayoffSeeding.seed(teams, games, rules);
        assertEquals(1, result.divisionRanks().get("B").position());
        assertEquals(HEAD_TO_HEAD, result.trace().getFirst().step());
        assertEquals(Set.of("B"), result.trace().getFirst().remaining());
    }

    @Test
    void onlyMultiKeepsNflHeadToHeadWhenTheRemainingTieHasTwoClubs() {
        divisionFixture();
        win("A", "B"); win("A", "B"); win("B", "C"); win("C", "A");
        win("X", "A"); win("B", "X"); win("C", "X"); win("Y", "C");
        var all = variant(HeadToHeadMode.INVERTED, NoGamesPolicy.NO_GAMES_ZERO, InvertedScope.ALL, RankingMode.NFL_RESTART, false);
        var multi = variant(HeadToHeadMode.INVERTED, NoGamesPolicy.NO_GAMES_ZERO, InvertedScope.ONLY_MULTI, RankingMode.NFL_RESTART, false);
        assertEquals(2, PlayoffSeeding.seed(teams, games, all).divisionRanks().get("A").position());
        assertEquals(2, PlayoffSeeding.seed(teams, games, multi).divisionRanks().get("C").position());
    }

    @Test
    void skipIgnoresBothHeadToHeadSteps() {
        team("A", "AFC", "East"); team("B", "AFC", "West"); team("X", "NFC", "North");
        win("A", "B"); win("X", "A");
        games.add(new PlayoffSeeding.Game(2, "B", "X", 100, 0));
        var nfl = TiebreakerRules.nfl();
        var steps = List.of(HEAD_TO_HEAD_SWEEP, HEAD_TO_HEAD, NET_POINTS_ALL, COIN_TOSS);
        var rules = new TiebreakerRules(nfl.divisionTwo(), nfl.divisionMultiple(), steps, steps,
                true, false, 4, HeadToHeadMode.SKIP, NoGamesPolicy.NOT_APPLICABLE, InvertedScope.ALL, RankingMode.NFL_RESTART);
        var result = PlayoffSeeding.seed(teams, games, rules);
        assertEquals(Set.of("B"), result.conferences().get("AFC").getFirst().teams());
        assertEquals(NET_POINTS_ALL, result.trace().getFirst().step());
    }

    private void noGamesFixture() {
        team("A", "AFC", "East"); team("B", "AFC", "West"); team("C", "AFC", "North");
        team("X", "NFC", "South");
        win("A", "B"); win("X", "A"); win("B", "X"); win("C", "X"); win("X", "C");
    }

    @Test
    void tieredRankingKeepsLowerTiersInPlaceAfterTheTopClubAdvances() {
        noGamesFixture();
        var restart = variant(HeadToHeadMode.INVERTED, NoGamesPolicy.NO_GAMES_HALF, InvertedScope.ALL, RankingMode.NFL_RESTART, false);
        var tiered = variant(HeadToHeadMode.INVERTED, NoGamesPolicy.NO_GAMES_HALF, InvertedScope.ALL, RankingMode.TIERED, false);
        assertEquals(List.of("B", "A", "C"), PlayoffSeeding.seed(teams, games, restart).conferences().get("AFC").stream()
                .map(r -> r.teams().iterator().next()).toList());
        assertEquals(List.of("B", "C", "A"), PlayoffSeeding.seed(teams, games, tiered).conferences().get("AFC").stream()
                .map(r -> r.teams().iterator().next()).toList());
    }

    @Test
    void noGamesPoliciesUseZeroHalfOrSkipTheWholeHeadToHeadComparison() {
        noGamesFixture();
        var nfl = TiebreakerRules.nfl();
        for (var policy : NoGamesPolicy.values()) {
            var rules = new TiebreakerRules(nfl.divisionTwo(), nfl.divisionMultiple(), List.of(HEAD_TO_HEAD, COIN_TOSS),
                    List.of(HEAD_TO_HEAD_SWEEP, COIN_TOSS), true, false, 4,
                    HeadToHeadMode.INVERTED, policy, InvertedScope.ALL, RankingMode.TIERED);
            var ranks = PlayoffSeeding.seed(teams, games, rules).conferences().get("AFC");
            switch (policy) {
                case NO_GAMES_ZERO -> {
                    assertEquals(Set.of("B", "C"), ranks.getFirst().teams());
                    assertEquals(PlayoffSeeding.Status.UNRESOLVED, ranks.getFirst().status());
                    assertEquals(COIN_TOSS, ranks.getFirst().unresolvedAt());
                }
                case NO_GAMES_HALF -> assertEquals(List.of(Set.of("B"), Set.of("C"), Set.of("A")), ranks.stream().map(PlayoffSeeding.Rank::teams).toList());
                case NOT_APPLICABLE -> {
                    assertEquals(Set.of("A", "B", "C"), ranks.getFirst().teams());
                    assertEquals(PlayoffSeeding.Status.UNRESOLVED, ranks.getFirst().status());
                    assertEquals(COIN_TOSS, ranks.getFirst().unresolvedAt());
                }
            }
        }
    }

    @Test
    void invertedDivisionOrderDeterminesWhichWildCardClubSurvivesDivisionReduction() {
        wildCardFixture();
        win("A", "B"); win("A", "C"); win("X", "A");
        win("B", "X"); win("B", "Y"); win("C", "X"); win("C", "Y");
        var rules = variant(HeadToHeadMode.INVERTED, NoGamesPolicy.NO_GAMES_ZERO, InvertedScope.ALL, RankingMode.NFL_RESTART, true);
        var result = PlayoffSeeding.seed(teams, games, rules);
        assertTrue(result.divisionRanks().get("B").position() < result.divisionRanks().get("A").position());
        assertTrue(result.trace().stream().anyMatch(t -> t.context().contains("division reduction")
                && t.tied().equals(Set.of("A", "B", "C")) && t.remaining().equals(Set.of("B", "C"))));
    }

    @Test
    void changingTheOrderedStepsChangesTheDecidingRule() {
        team("A", "AFC", "East"); team("B", "AFC", "West"); team("X", "NFC", "North");
        team("Y", "NFC", "South");
        win("A", "B"); win("B", "X"); win("B", "X"); win("X", "A"); win("X", "A");
        win("A", "X"); win("X", "B"); win("X", "Y");
        var nfl = TiebreakerRules.nfl();
        var rules = new TiebreakerRules(nfl.divisionTwo(), nfl.divisionMultiple(), List.of(STRENGTH_OF_VICTORY, HEAD_TO_HEAD),
                nfl.wildCardMultiple(), nfl.restartAfterElimination(), nfl.reduceWildCardsByDivision(), nfl.wildCardCommonGamesMinimum());
        assertEquals(Set.of("A"), PlayoffSeeding.seed(teams, games).conferences().get("AFC").getFirst().teams());
        assertEquals(Set.of("B"), PlayoffSeeding.seed(teams, games, rules).conferences().get("AFC").getFirst().teams());
    }
}
