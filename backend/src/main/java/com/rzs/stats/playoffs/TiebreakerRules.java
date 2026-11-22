package com.rzs.stats.playoffs;

import java.util.List;
import java.util.Objects;

public record TiebreakerRules(List<Step> divisionTwo, List<Step> divisionMultiple,
                             List<Step> wildCardTwo, List<Step> wildCardMultiple,
                             boolean restartAfterElimination, boolean reduceWildCardsByDivision,
                             int wildCardCommonGamesMinimum, HeadToHeadMode headToHeadMode,
                             NoGamesPolicy noGamesPolicy, InvertedScope invertedScope, RankingMode rankingMode) {
    public enum HeadToHeadMode { NFL, SKIP, INVERTED }
    public enum NoGamesPolicy { NO_GAMES_ZERO, NO_GAMES_HALF, NOT_APPLICABLE }
    public enum InvertedScope { ALL, ONLY_MULTI }
    public enum RankingMode { NFL_RESTART, TIERED }

    public enum Step {
        HEAD_TO_HEAD, HEAD_TO_HEAD_SWEEP, DIVISION_RECORD, COMMON_GAMES, CONFERENCE_RECORD,
        STRENGTH_OF_VICTORY, STRENGTH_OF_SCHEDULE, COMBINED_RANKING_CONFERENCE,
        COMBINED_RANKING_ALL, NET_POINTS_COMMON, NET_POINTS_CONFERENCE, NET_POINTS_ALL,
        NET_TOUCHDOWNS, COIN_TOSS, ALPHABETICAL
    }

    public TiebreakerRules {
        divisionTwo = List.copyOf(divisionTwo);
        divisionMultiple = List.copyOf(divisionMultiple);
        wildCardTwo = List.copyOf(wildCardTwo);
        wildCardMultiple = List.copyOf(wildCardMultiple);
        Objects.requireNonNull(headToHeadMode);
        Objects.requireNonNull(noGamesPolicy);
        Objects.requireNonNull(invertedScope);
        Objects.requireNonNull(rankingMode);
        if (wildCardCommonGamesMinimum < 0) throw new IllegalArgumentException("Negative common-games minimum");
    }

    public TiebreakerRules(List<Step> divisionTwo, List<Step> divisionMultiple,
                          List<Step> wildCardTwo, List<Step> wildCardMultiple,
                          boolean restartAfterElimination, boolean reduceWildCardsByDivision,
                          int wildCardCommonGamesMinimum) {
        this(divisionTwo, divisionMultiple, wildCardTwo, wildCardMultiple, restartAfterElimination,
                reduceWildCardsByDivision, wildCardCommonGamesMinimum, HeadToHeadMode.NFL,
                NoGamesPolicy.NOT_APPLICABLE, InvertedScope.ALL, RankingMode.NFL_RESTART);
    }

    public static TiebreakerRules nfl() {
        var division = List.of(Step.HEAD_TO_HEAD, Step.DIVISION_RECORD, Step.COMMON_GAMES,
                Step.CONFERENCE_RECORD, Step.STRENGTH_OF_VICTORY, Step.STRENGTH_OF_SCHEDULE,
                Step.COMBINED_RANKING_CONFERENCE, Step.COMBINED_RANKING_ALL, Step.NET_POINTS_COMMON,
                Step.NET_POINTS_ALL, Step.NET_TOUCHDOWNS, Step.COIN_TOSS);
        var wildCard = List.of(Step.HEAD_TO_HEAD, Step.CONFERENCE_RECORD, Step.COMMON_GAMES,
                Step.STRENGTH_OF_VICTORY, Step.STRENGTH_OF_SCHEDULE, Step.COMBINED_RANKING_CONFERENCE,
                Step.COMBINED_RANKING_ALL, Step.NET_POINTS_CONFERENCE, Step.NET_POINTS_ALL,
                Step.NET_TOUCHDOWNS, Step.COIN_TOSS);
        var multiple = new java.util.ArrayList<>(wildCard);
        multiple.set(0, Step.HEAD_TO_HEAD_SWEEP);
        return new TiebreakerRules(division, division, wildCard, multiple, true, true, 4);
    }
}
