package com.rzs.stats.service;

import com.rzs.stats.config.CacheNames;
import com.rzs.stats.playoffs.OddsService;
import com.rzs.stats.playoffs.LeverageService;
import com.rzs.stats.playoffs.OddsSnapshotService;
import com.rzs.stats.service.QbStatsService.Basis;
import com.rzs.stats.service.QbStatsService.Scope;
import com.rzs.stats.service.QbStatsService.Stage;
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
    private final EloHistoryService eloHistoryService;
    private final QbStatsService qbStatsService;
    private final OddsService odds;
    private final LeverageService leverage;
    private final OddsSnapshotService snapshots;

    private volatile boolean inProgress = false;
    private volatile Instant startedAt;
    private volatile Instant completedAt;
    private volatile String message;
    private volatile Boolean success;

    public record WarmStatus(boolean inProgress, Instant startedAt, Instant completedAt, String message, Boolean success) {}

    public WarmStatus getStatus() {
        return new WarmStatus(inProgress, startedAt, completedAt, message, success);
    }

    public CacheWarmingService(StatsService statsService, EloHistoryService eloHistoryService, QbStatsService qbStatsService, OddsService odds, OddsSnapshotService snapshots, LeverageService leverage) {
        this.statsService = statsService;
        this.eloHistoryService = eloHistoryService;
        this.qbStatsService = qbStatsService;
        this.odds = odds;
        this.snapshots = snapshots;
        this.leverage = leverage;
    }

    @CacheEvict(cacheResolver = CacheNames.ALL, allEntries = true, beforeInvocation = true)
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
                message = "Season " + (i + 1) + " of " + total + " (standings, games, trends, QB stats)...";
                statsService.computeStandings(season);
                statsService.getWeeklyTrends(season);
                List<Integer> weeks = statsService.getAvailableWeeks(season, 1);
                for (int week : weeks) {
                    statsService.getGames(season, 1, week);
                }
                try {
                    qbStatsService.leaderboard(Scope.SEASON, season, null, Stage.REGULAR, null, false);
                } catch (Exception e) {
                    log.warn("Cache warming: QB season {} failed", season, e);
                }
                log.info("Cache warming: season {}/{} (index={}, {} weeks) done", i + 1, total, season, weeks.size());
            }
            message = "Warming all-time QB stats and latest-season movement...";
            for (Stage stage : List.of(Stage.REGULAR, Stage.PLAYOFFS)) {
                try {
                    qbStatsService.leaderboard(Scope.ALLTIME, null, null, stage, null, false);
                } catch (Exception e) {
                    log.warn("Cache warming: all-time QB {} failed", stage, e);
                }
            }
            if (!seasons.isEmpty()) {
                int latestSeason = seasons.stream().mapToInt(Integer::intValue).max().orElseThrow();
                try {
                    qbStatsService.movement(latestSeason, Stage.REGULAR, 1, Basis.SEASON);
                } catch (Exception e) {
                    log.warn("Cache warming: QB movement for season {} failed", latestSeason, e);
                }
            }
            eloHistoryService.getTimeline();
            if (!seasons.isEmpty()) {
                try {
                    snapshots.save(odds.odds(null, "madden"));
                } catch (Exception e) {
                    log.warn("Cache warming: playoff odds failed", e);
                }
                try {
                    leverage.matrix(null, null, "madden");
                } catch (Exception e) {
                    log.warn("Cache warming: playoff leverage failed", e);
                }
            }
            long elapsed = Duration.between(startedAt, Instant.now()).getSeconds();
            message = total + " seasons and QB stats cached in " + elapsed + "s";
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
