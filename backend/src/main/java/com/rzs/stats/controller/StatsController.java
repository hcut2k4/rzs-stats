package com.rzs.stats.controller;

import com.rzs.stats.model.dto.GameDto;
import com.rzs.stats.model.dto.SeasonWeekDto;
import com.rzs.stats.model.dto.StandingDto;
import com.rzs.stats.service.StatsService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api")
public class StatsController {

    private final StatsService statsService;

    public StatsController(StatsService statsService) {
        this.statsService = statsService;
    }

    @GetMapping("/standings")
    public List<StandingDto> getStandings(@RequestParam int season) {
        return statsService.computeStandings(season);
    }

    @GetMapping("/games")
    public List<GameDto> getGames(
            @RequestParam int season,
            @RequestParam(defaultValue = "1") int stage,
            @RequestParam int week) {
        return statsService.getGames(season, stage, week);
    }

    @GetMapping("/games/weeks")
    public List<Integer> getAvailableWeeks(
            @RequestParam int season,
            @RequestParam(defaultValue = "1") int stage) {
        return statsService.getAvailableWeeks(season, stage);
    }

    @GetMapping("/seasons")
    public List<Integer> getSeasons() {
        return statsService.getAvailableSeasons();
    }

    @GetMapping("/trends/season")
    public List<SeasonWeekDto> getSeasonTrends() {
        return statsService.getSeasonTrends();
    }

    @GetMapping("/trends/weekly")
    public List<SeasonWeekDto> getWeeklyTrends(@RequestParam int season) {
        return statsService.getWeeklyTrends(season);
    }
}
