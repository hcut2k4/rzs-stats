package com.rzs.stats.service;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class CacheWarmingService {

    private final StatsService statsService;

    public CacheWarmingService(StatsService statsService) {
        this.statsService = statsService;
    }

    @CacheEvict(cacheNames = {"standings", "games", "weeks", "seasons", "seasonTrends", "weeklyTrends"}, allEntries = true, beforeInvocation = true)
    public void warmCaches() {
        List<Integer> seasons = statsService.getAvailableSeasons();
        statsService.getSeasonTrends();
        for (int season : seasons) {
            statsService.computeStandings(season);
            statsService.getWeeklyTrends(season);
            List<Integer> weeks = statsService.getAvailableWeeks(season, 1);
            for (int week : weeks) {
                statsService.getGames(season, 1, week);
            }
        }
    }
}
