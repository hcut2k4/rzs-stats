package com.rzs.stats.controller;

import com.rzs.stats.playoffs.WhatIfService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/playoffs")
public class PlayoffsWhatIfController {
    private final WhatIfService service;

    public PlayoffsWhatIfController(WhatIfService service) { this.service = service; }

    @GetMapping("/remaining")
    public WhatIfService.Remaining remaining(@RequestParam(required = false) Integer season) {
        return service.remaining(season);
    }

    @PostMapping("/simulate")
    public WhatIfService.Response simulate(@RequestBody WhatIfService.Request request) {
        return service.simulate(request);
    }
}
