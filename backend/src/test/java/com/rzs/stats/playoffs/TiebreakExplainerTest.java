package com.rzs.stats.playoffs;

import com.rzs.stats.service.EloService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static com.rzs.stats.playoffs.PlayoffSeeding.*;
import static com.rzs.stats.playoffs.TiebreakerRules.Step;

class TiebreakExplainerTest {
    private final Map<String, EloService.Team> teams = Map.of(
            "PHI", new EloService.Team(1, "PHI", "Philadelphia"),
            "DET", new EloService.Team(2, "DET", "Detroit"),
            "WAS", new EloService.Team(3, "WAS", "Washington"));

    @Test
    void threeTeamMaddenTieExplainsBiggestEqualCountGroupForEveryTeamWithoutDuplicates() {
        var trace = new Trace("NFC", teams.keySet(), Step.HEAD_TO_HEAD, Set.of("PHI", "DET"), Status.RESOLVED,
                Map.of("PHI", 0.0, "DET", 0.0, "WAS", 1.0), Map.of("PHI", 0.0, "DET", 0.0, "WAS", 1.0), true);
        var reasons = new TiebreakExplainer().explain(result(6, List.of(trace, trace)), teams);
        String sentence = "Detroit and Philadelphia finished ahead of Washington: among the 3 teams tied on winning percentage, "
                + "they share the same head-to-head win count, and Madden puts the biggest group of teams with the same count first.";
        for (String team : teams.keySet()) assertThat(reasons.get(team)).containsExactly(sentence);
    }

    @Test
    void biggestGroupUsesDecisionMetricRatherThanUnrelatedHeadToHeadCounts() {
        var trace = new Trace("NFC", teams.keySet(), Step.CONFERENCE_RECORD, Set.of("PHI", "DET"), Status.RESOLVED,
                Map.of("PHI", 0.0, "DET", 1.0, "WAS", 2.0), Map.of("PHI", .5, "DET", .5, "WAS", .8), true);
        var sentence = new TiebreakExplainer().explain(result(6, List.of(trace)), teams).get("WAS").getFirst();
        assertThat(sentence).contains("same conference winning percentage").doesNotContain("head-to-head");
    }

    @Test
    void tiesEntirelyOutsidePlayoffFieldDoNotProduceReasons() {
        var trace = new Trace("NFC", teams.keySet(), Step.HEAD_TO_HEAD, Set.of("PHI"), Status.RESOLVED);
        assertThat(new TiebreakExplainer().explain(result(8, List.of(trace)), teams)).isEmpty();
    }

    @ParameterizedTest
    @CsvSource({
            "HEAD_TO_HEAD,Won the head-to-head", "HEAD_TO_HEAD_SWEEP,Won the head-to-head",
            "DIVISION_RECORD,Better division record", "COMMON_GAMES,Better record against common opponents",
            "CONFERENCE_RECORD,Better conference record", "STRENGTH_OF_VICTORY,Stronger strength of victory",
            "STRENGTH_OF_SCHEDULE,Stronger strength of schedule", "NET_POINTS_COMMON,decided by point differential",
            "NET_POINTS_CONFERENCE,decided by point differential", "NET_POINTS_ALL,decided by point differential",
            "COMBINED_RANKING_CONFERENCE,combined conference ranking", "COMBINED_RANKING_ALL,combined league ranking",
            "ALPHABETICAL,alphabetical order"
    })
    void normalTiebreaksUsePlainEnglishWithTeamNames(String step, String phrase) {
        var trace = new Trace("NFC", Set.of("PHI", "WAS"), Step.valueOf(step), Set.of("PHI"), Status.RESOLVED);
        var sentence = new TiebreakExplainer().explain(result(6, List.of(trace)), teams).get("PHI").getFirst();
        assertThat(sentence).contains(phrase, "Philadelphia", "Washington").doesNotContain(step);
    }

    @Test
    void divisionReductionExplainsCandidateEligibilityWithoutOrderingOtherDivisions() {
        var trace = new Trace("NFC wild cards division reduction", teams.keySet(), null,
                Set.of("PHI", "DET"), Status.RESOLVED);
        var reasons = new TiebreakExplainer().explain(result(6, List.of(trace)), teams);
        for (var team : teams.keySet()) {
            assertThat(reasons.get(team)).containsExactly("Only Detroit and Philadelphia stayed as candidates in this "
                    + "wild-card tiebreaker after keeping the highest-ranked tied team from each division; "
                    + "Washington was deferred until the next wild-card selection.");
            assertThat(reasons.get(team).getFirst()).doesNotContain("ahead of", "Finished higher in the division");
        }
    }

    @Test
    void byeWeekTiesUseWinningPercentageWhenTeamsHaveDifferentRecords() {
        var trace = new Trace("NFC", teams.keySet(), Step.HEAD_TO_HEAD, Set.of("PHI", "DET"), Status.RESOLVED,
                Map.of("PHI", 0.0, "DET", 0.0, "WAS", 1.0), Map.of("PHI", 0.0, "DET", 0.0, "WAS", 1.0), true);
        var original = result(6, List.of(trace));
        var records = Map.of("PHI", new PlayoffSeeding.Record(1, 1, 0, 0, 0),
                "DET", new PlayoffSeeding.Record(2, 2, 0, 0, 0), "WAS", new PlayoffSeeding.Record(1, 1, 0, 0, 0));
        var result = new Result(original.conferences(), original.divisionRanks(), records, original.trace(), Map.of());
        var sentence = new TiebreakExplainer().explain(result, teams).get("PHI").getFirst();
        assertThat(sentence).contains("3 teams tied on winning percentage").doesNotContain("tied at", "1-1", "2-2");
    }

    @Test
    void multiTeamMaddenHeadToHeadExplainsWinCountsEvenWhenLeaderLostToAnotherTiedTeam() {
        var clubs = List.of(new Team("PHI", "NFC", "East"), new Team("DET", "NFC", "East"),
                new Team("WAS", "NFC", "East"), new Team("O", "AFC", "West"));
        var games = List.of(new Game(0, "PHI", "WAS", 20, 10), new Game(1, "PHI", "WAS", 20, 10),
                new Game(2, "DET", "PHI", 20, 10), new Game(3, "O", "PHI", 20, 10),
                new Game(4, "O", "DET", 20, 10), new Game(5, "WAS", "O", 20, 10),
                new Game(6, "WAS", "O", 20, 10));
        var identities = new HashMap<>(teams);
        identities.put("O", new EloService.Team(4, "O", "Opponent"));
        var sentences = new TiebreakExplainer().explain(MaddenSeeding.madden27().seed(clubs, games), identities).get("PHI");
        assertThat(sentences).anySatisfy(sentence -> assertThat(sentence)
                .contains("Philadelphia had the most wins against the other tied teams", "Detroit 1", "Philadelphia 2", "Washington 0")
                .doesNotContain("Won the head-to-head"));
    }

    private Result result(int position, List<Trace> trace) {
        var records = new HashMap<String, PlayoffSeeding.Record>();
        teams.keySet().forEach(t -> records.put(t, new PlayoffSeeding.Record(10, 7, 0, 0, 0)));
        return new Result(Map.of("NFC", List.of(new Rank(position, Set.of("PHI"), Status.RESOLVED, null))),
                Map.of(), records, trace, Map.of(), List.of());
    }
}
