package com.rzs.stats.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

@Service
public class CacheWarmingService {

    private static final Logger log = LoggerFactory.getLogger(CacheWarmingService.class);

    private final StatsService statsService;

    private volatile boolean inProgress = false;
    private volatile Instant startedAt;
    private volatile Instant completedAt;
    private volatile String message;
    private volatile Boolean success;

    public record WarmStatus(boolean inProgress, Instant startedAt, Instant completedAt, String message, Boolean success) {}

    public WarmStatus getStatus() {
        return new WarmStatus(inProgress, startedAt, completedAt, message, success);
    }

    public CacheWarmingService(StatsService statsService) {
        this.statsService = statsService;
    }

    @CacheEvict(cacheNames = {"standings", "games", "weeks", "seasons", "seasonTrends", "weeklyTrends", "seasonGames"}, allEntries = true, beforeInvocation = true)
    public void warmCaches() {
        inProgress = true;
        startedAt = Instant.now();
        message = "Warming in progress...";
        success = null;
        try {
            log.info("Cache warming started — all caches evicted");
            List<Integer> seasons = statsService.getAvailableSeasons();
            statsService.getSeasonTrends();
            int total = seasons.size();
            log.info("Cache warming: {} seasons to warm", total);
            for (int i = 0; i < seasons.size(); i++) {
                int season = seasons.get(i);
                message = "Season " + (i + 1) + " of " + total + "...";
                statsService.computeStandings(season);
                statsService.getWeeklyTrends(season);
                List<Integer> weeks = statsService.getAvailableWeeks(season, 1);
                for (int week : weeks) {
                    statsService.getGames(season, 1, week);
                }
                log.info("Cache warming: season {}/{} (index={}, {} weeks) done", i + 1, total, season, weeks.size());
            }
            long elapsed = Duration.between(startedAt, Instant.now()).getSeconds();
            message = total + " seasons cached in " + elapsed + "s";
            success = true;
            log.info("Cache warming complete — {}", message);
        } catch (Exception e) {
            message = "Cache warming failed: " + e.getMessage();
            success = false;
            log.error("Cache warming failed", e);
        } finally {
            completedAt = Instant.now();
            inProgress = false;
        }
    }
}
