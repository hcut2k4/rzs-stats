package com.rzs.stats.controller;

import com.rzs.stats.playoffs.PlayoffPictureService;
import com.rzs.stats.playoffs.ClinchService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/playoffs")
public class PlayoffsController {
    private final PlayoffPictureService pictures;

    private final ClinchService clinches;

    public PlayoffsController(PlayoffPictureService pictures, ClinchService clinches) {
        this.pictures = pictures; this.clinches = clinches;
    }

    @GetMapping("/clinch")
    public ClinchService.Response clinch(@RequestParam(required = false) Integer season,
                                        @RequestParam(defaultValue = "madden") String rules) {
        return clinches.clinch(season, rules);
    }

    @GetMapping("/picture")
    public PlayoffPictureService.Picture picture(@RequestParam(required = false) Integer season,
                                                 @RequestParam(defaultValue = "madden") String rules) {
        return pictures.picture(season, rules);
    }
}
