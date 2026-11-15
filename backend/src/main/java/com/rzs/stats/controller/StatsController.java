package com.rzs.stats.controller;

import com.rzs.stats.model.dto.GameDto;
import com.rzs.stats.model.dto.SeasonWeekDto;
import com.rzs.stats.model.dto.StandingDto;
import com.rzs.stats.service.StatsService;
import com.rzs.stats.service.EloQueryService;
import com.rzs.stats.model.dto.EloDtos;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api")
public class StatsController {

    private final StatsService statsService;

    private final EloQueryService elo;

    public StatsController(StatsService statsService, EloQueryService elo) {
        this.statsService = statsService;
        this.elo = elo;
    }

    @GetMapping("/elo/ratings")
    public List<EloDtos.Rating> eloRatings(@RequestParam(required = false) Integer season,
                                          @RequestParam(required = false) Integer week) {
        return elo.ratings(season, week);
    }

    @GetMapping("/elo/history")
    public List<EloDtos.History> eloHistory(@RequestParam(required = false) Integer season) {
        return elo.history(season);
    }

    @GetMapping("/elo/games")
    public List<EloDtos.Game> eloGames(@RequestParam(required = false) Integer season,
                                      @RequestParam(required = false) Integer week,
                                      @RequestParam(required = false) Integer teamId) {
        return elo.games(season, week, teamId);
    }

    @GetMapping("/elo/matchup")
    public EloDtos.Matchup eloMatchup(@RequestParam int teamA, @RequestParam int teamB,
                                      @RequestParam(required = false) Integer homeTeam) {
        return elo.matchup(teamA, teamB, homeTeam);
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
