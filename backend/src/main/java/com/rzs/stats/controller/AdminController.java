package com.rzs.stats.controller;

import com.rzs.stats.client.NeonSportzClient;
import com.rzs.stats.model.ns.NsLeague;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.service.SyncService;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final SyncService syncService;
    private final NeonSportzClient client;
    private final GameRepository gameRepository;

    public AdminController(SyncService syncService, NeonSportzClient client, GameRepository gameRepository) {
        this.syncService = syncService;
        this.client = client;
        this.gameRepository = gameRepository;
    }

    @PostMapping("/sync")
    public Map<String, Object> triggerSync() {
        SyncService.SyncResult result = syncService.sync();
        return Map.of("success", result.success(), "message", result.message());
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
                    "gameId",     g.getGameId()    != null ? g.getGameId()    : "null",
                    "status",     g.getStatus()    != null ? g.getStatus()    : "null",
                    "homeScore",  g.getHomeScore() != null ? g.getHomeScore() : "null",
                    "awayScore",  g.getAwayScore() != null ? g.getAwayScore() : "null",
                    "homeTeam",   homeTeam != null ? homeTeam : "null",
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
        java.util.TreeMap<Integer, Integer> byStatus    = new java.util.TreeMap<>();
        java.util.TreeMap<Integer, Integer> byWeekIndex = new java.util.TreeMap<>();
        int nullHome = 0, nullAway = 0;

        for (com.rzs.stats.model.ns.NsGame g : allGames) {
            byStatus.merge(g.getStatus(), 1, Integer::sum);
            byWeekIndex.merge(g.getWeekIndex(), 1, Integer::sum);
            if (g.getHomeTeam() == null || g.getHomeTeam().getId() == null && g.getHomeTeam().getTeamId() == null) nullHome++;
            if (g.getAwayTeam() == null || g.getAwayTeam().getId() == null && g.getAwayTeam().getTeamId() == null) nullAway++;
        }

        return Map.of(
            "seasonIndex",        seasonIndex,
            "weekIndex",          "null",
            "apiTotalReturned",   allGames.size(),
            "byStatus",           byStatus,
            "byWeekIndex",        byWeekIndex,
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
            counts.add(Map.of(
                "seasonIndex", row[0],
                "stageIndex",  row[1],
                "count",       row[2]
            ));
        }

        return Map.of(
            "league", Map.of(
                "season",       league.getSeason(),
                "week",         league.getWeek(),
                "calendarYear", league.getCalendarYear()
            ),
            "gameCountsBySeasonAndStage", counts
        );
    }
}
