package com.rzs.stats.controller;

import com.rzs.stats.client.NeonSportzClient;
import com.rzs.stats.model.ns.NsLeague;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.service.CacheWarmingService;
import com.rzs.stats.service.SyncService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.concurrent.CompletableFuture;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private static final Logger log = LoggerFactory.getLogger(AdminController.class);

    private final SyncService syncService;
    private final NeonSportzClient client;
    private final GameRepository gameRepository;
    private final CacheWarmingService cacheWarmingService;

    public AdminController(SyncService syncService, NeonSportzClient client, GameRepository gameRepository, CacheWarmingService cacheWarmingService) {
        this.syncService = syncService;
        this.client = client;
        this.gameRepository = gameRepository;
        this.cacheWarmingService = cacheWarmingService;
    }

    @PostMapping("/sync")
    public Map<String, Object> triggerSync() {
        log.info("Manual sync triggered");
        CompletableFuture.runAsync(() -> syncService.sync())
                .exceptionally(ex -> {
                    log.error("Unexpected error during async sync", ex);
                    return null;
                });
        return Map.of("success", true, "message", "Sync started");
    }

    @PostMapping("/sync/force")
    public Map<String, Object> triggerForceSync() {
        log.info("Force sync triggered");
        CompletableFuture.runAsync(() -> syncService.syncForce())
                .exceptionally(ex -> {
                    log.error("Unexpected error during async force sync", ex);
                    return null;
                });
        return Map.of("success", true, "message", "Force sync started — all seasons will be re-synced");
    }

    @PostMapping("/cache/warm")
    public Map<String, Object> triggerCacheWarm() {
        log.info("Cache warming triggered");
        CompletableFuture.runAsync(() -> cacheWarmingService.warmCaches())
                .exceptionally(ex -> {
                    log.error("Cache warming failed", ex);
                    return null;
                });
        return Map.of("success", true, "message", "Cache warming started — all caches cleared and rebuilding");
    }

    @GetMapping("/sync/status")
    public SyncService.SyncStatus getSyncStatus() {
        return syncService.getStatus();
    }

    @PostMapping("/sync/verbose")
    public Map<String, Object> triggerVerboseSync() {
        SyncService.VerboseSyncResult result = syncService.syncVerbose();
        return Map.of("success", result.success(), "message", result.message(), "log", result.log());
    }

    @GetMapping("/debug/api")
    public Map<String, Object> debugApi(
            @RequestParam Integer seasonIndex,
            @RequestParam(required = false) Integer weekIndex) {

        List<com.rzs.stats.model.ns.NsGame> allGames = client.fetchAllGamesForSeason(seasonIndex);

        if (weekIndex != null) {
            // Mode B — per-game detail for a specific week
            List<Map<String, Object>> games = new ArrayList<>();
            for (com.rzs.stats.model.ns.NsGame g : allGames) {
                if (!weekIndex.equals(g.getWeekIndex())) continue;
                Map<String, Object> homeTeam = g.getHomeTeam() == null ? null : Map.of(
                    "id",     g.getHomeTeam().getId()     != null ? g.getHomeTeam().getId()     : "null",
                    "teamId", g.getHomeTeam().getTeamId() != null ? g.getHomeTeam().getTeamId() : "null"
                );
                Map<String, Object> awayTeam = g.getAwayTeam() == null ? null : Map.of(
                    "id",     g.getAwayTeam().getId()     != null ? g.getAwayTeam().getId()     : "null",
                    "teamId", g.getAwayTeam().getTeamId() != null ? g.getAwayTeam().getTeamId() : "null"
                );
                games.add(Map.of(
                    "gameId",      g.getGameId()      != null ? g.getGameId()      : "null",
                    "status",      g.getStatus()      != null ? g.getStatus()      : "null",
                    "seasonIndex", g.getSeasonIndex() != null ? g.getSeasonIndex() : "null",
                    "stageIndex",  g.getStageIndex()  != null ? g.getStageIndex()  : "null",
                    "weekIndex",   g.getWeekIndex()   != null ? g.getWeekIndex()   : "null",
                    "homeScore",   g.getHomeScore()   != null ? g.getHomeScore()   : "null",
                    "awayScore",   g.getAwayScore()   != null ? g.getAwayScore()   : "null",
                    "homeTeam",    homeTeam != null ? homeTeam : "null",
                    "awayTeam",   awayTeam != null ? awayTeam : "null"
                ));
            }
            return Map.of(
                "seasonIndex",      seasonIndex,
                "weekIndex",        weekIndex,
                "apiTotalReturned", games.size(),
                "games",            games
            );
        }

        // Mode A — season-level aggregation
        java.util.TreeMap<Integer, Integer> byStatus     = new java.util.TreeMap<>();
        java.util.TreeMap<Integer, Integer> byWeekIndex  = new java.util.TreeMap<>();
        java.util.TreeMap<String,  Integer> byStageIndex = new java.util.TreeMap<>();
        int nullHome = 0, nullAway = 0;

        for (com.rzs.stats.model.ns.NsGame g : allGames) {
            byStatus.merge(g.getStatus(), 1, Integer::sum);
            byWeekIndex.merge(g.getWeekIndex(), 1, Integer::sum);
            byStageIndex.merge(g.getStageIndex() != null ? String.valueOf(g.getStageIndex()) : "null", 1, Integer::sum);
            if (g.getHomeTeam() == null || g.getHomeTeam().getId() == null && g.getHomeTeam().getTeamId() == null) nullHome++;
            if (g.getAwayTeam() == null || g.getAwayTeam().getId() == null && g.getAwayTeam().getTeamId() == null) nullAway++;
        }

        return Map.of(
            "seasonIndex",        seasonIndex,
            "weekIndex",          "null",
            "apiTotalReturned",   allGames.size(),
            "byStatus",           byStatus,
            "byWeekIndex",        byWeekIndex,
            "byStageIndex",       byStageIndex,
            "nullHomeTeamCount",  nullHome,
            "nullAwayTeamCount",  nullAway
        );
    }

    @GetMapping("/debug")
    public Map<String, Object> debug() {
        NsLeague league = client.fetchLeagueInfo();

        List<Object[]> rows = gameRepository.countGamesBySeasonAndStage();
        List<Map<String, Object>> counts = new ArrayList<>();
        for (Object[] row : rows) {
            // stageIndex (row[1]) may be null; represent as string to avoid Map.of() NPE
            counts.add(Map.of(
                "seasonIndex", row[0],
                "stageIndex",  row[1] != null ? row[1] : "null",
                "count",       row[2]
            ));
        }

        // Total games per season (all stageIndex values) — useful for detecting
        // games stored with unexpected (e.g. null) stageIndex values
        List<Map<String, Object>> totals = new ArrayList<>();
        for (int s = 0; s <= league.getSeason(); s++) {
            long total = gameRepository.countBySeasonIndex(s);
            if (total > 0) totals.add(Map.of("seasonIndex", s, "totalGames", total));
        }

        return Map.of(
            "league", Map.of(
                "season",       league.getSeason(),
                "week",         league.getWeek(),
                "calendarYear", league.getCalendarYear()
            ),
            "gameCountsBySeasonAndStage", counts,
            "totalGamesBySeasonAllStages", totals
        );
    }
}
