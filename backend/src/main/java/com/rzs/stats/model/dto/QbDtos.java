package com.rzs.stats.model.dto;

import java.util.List;

public class QbDtos {
    public record Movement(List<QbStatDto> risers, List<QbStatDto> fallers, List<Series> series) {}
    public record Series(String rosterId, String playerName, String teamAbbr, List<Rank> ranks) {}
    public record Rank(int week, int rank, Double tanya) {}
    public record Profile(String rosterId, String playerName, String teamAbbr, String teamName,
                          List<QbStatDto> seasons, List<Game> games, Components components) {}
    public record Game(int seasonIndex, int weekIndex, int stageIndex, String opponentAbbr, Double tanya,
                       int passAtt, int passYds, int passTd, int passInt, int rushAtt, int rushYds, int rushTd,
                       Double sackYardsLost, Double fumblesLost) {}
    public record Components(int passYds, Double sackYds, int rushYds, int tdBonus, Double turnoverPenalty) {}
}
