package com.rzs.stats.model.dto;

import java.util.List;

public class SeasonWeekDto {
    private final Integer seasonIndex;
    private final Integer weekIndex; // null for season-level trends
    private final List<StandingDto> standings;

    public SeasonWeekDto(Integer seasonIndex, Integer weekIndex, List<StandingDto> standings) {
        this.seasonIndex = seasonIndex;
        this.weekIndex = weekIndex;
        this.standings = standings;
    }

    public Integer getSeasonIndex() { return seasonIndex; }
    public Integer getWeekIndex() { return weekIndex; }
    public List<StandingDto> getStandings() { return standings; }
}
