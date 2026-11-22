package com.rzs.stats.controller;

import com.rzs.stats.playoffs.PathService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/playoffs")
public class PlayoffsPathController {
    private final PathService paths;

    public PlayoffsPathController(PathService paths) { this.paths = paths; }

    @GetMapping("/path/{abbr}")
    public PathService.Response path(@PathVariable String abbr, @RequestParam(required = false) Integer season,
                                     @RequestParam(defaultValue = "madden") String rules) {
        return paths.path(season, abbr, rules);
    }
}
