package com.rzs.stats.controller;

import com.rzs.stats.playoffs.LeverageService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/playoffs")
public class PlayoffsLeverageController {
    private final LeverageService leverage;

    public PlayoffsLeverageController(LeverageService leverage) { this.leverage = leverage; }

    @GetMapping("/leverage")
    public LeverageService.Response leverage(@RequestParam(required = false) Integer season,
                                             @RequestParam(required = false) Integer week,
                                             @RequestParam(defaultValue = "madden") String rules) {
        return leverage.response(leverage.matrix(season, week, rules));
    }
}
