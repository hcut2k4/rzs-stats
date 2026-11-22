package com.rzs.stats.controller;

import com.rzs.stats.playoffs.OddsHistoryService;
import org.springframework.web.bind.annotation.*;

@RestController
public class PlayoffsOddsHistoryController {
    private final OddsHistoryService history;

    public PlayoffsOddsHistoryController(OddsHistoryService history) {
        this.history = history;
    }

    @GetMapping("/api/playoffs/odds/history")
    public OddsHistoryService.History history(@RequestParam(required = false) Integer season,
                                             @RequestParam(required = false) String team) {
        return history.history(season, team);
    }

    @PostMapping("/api/admin/playoffs/odds/backfill")
    public OddsHistoryService.Backfill backfill(@RequestParam int season) {
        return history.backfill(season);
    }
}
