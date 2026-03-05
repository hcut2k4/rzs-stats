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
