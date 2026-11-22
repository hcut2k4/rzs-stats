package com.rzs.stats.controller;

import com.rzs.stats.playoffs.PlayoffPictureService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/playoffs")
public class PlayoffsController {
    private final PlayoffPictureService pictures;

    public PlayoffsController(PlayoffPictureService pictures) { this.pictures = pictures; }

    @GetMapping("/picture")
    public PlayoffPictureService.Picture picture(@RequestParam(required = false) Integer season,
                                                 @RequestParam(defaultValue = "madden") String rules) {
        return pictures.picture(season, rules);
    }
}
