package com.rzs.stats.model.dto;

public record TeamEfficiencyDto(Integer teamId, String displayName, String abbrName, String cityName, String conference,
                                String division, String primaryColor, Integer logoId, int games,
                                Side offense, Side defense, Double netPointsPerDrive) {
    public record Side(int drives, int plays, Double pointsPerDrive, Double pointsPerPlay, Double yardsPerPlay,
                       Double seriesRate, Double thirdDownRate, Double redZoneTdRate, Double giveawayRate, Double sackRate) {}
}
