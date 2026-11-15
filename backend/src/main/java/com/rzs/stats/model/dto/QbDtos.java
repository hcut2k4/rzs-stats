package com.rzs.stats.model.dto;

import java.util.List;

public class QbDtos {
    public record Movement(List<QbStatDto> risers, List<QbStatDto> fallers, List<Series> series) {}
    public record Series(String rosterId, String playerName, String teamAbbr, List<Rank> ranks) {}
    public record Rank(int season, int week, int rank, Double tanya) {}
}
