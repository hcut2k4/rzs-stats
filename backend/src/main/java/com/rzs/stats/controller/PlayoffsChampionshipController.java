package com.rzs.stats.controller;

import com.rzs.stats.playoffs.ChampionshipService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/playoffs/championship")
public class PlayoffsChampionshipController {
    private final ChampionshipService championship;

    public PlayoffsChampionshipController(ChampionshipService championship) {
        this.championship = championship;
    }

    @GetMapping
    public ChampionshipService.Response championship(@RequestParam(required = false) Integer season,
                                                     @RequestParam(defaultValue = "madden") String rules) {
        return championship.championship(season, rules);
    }
}
