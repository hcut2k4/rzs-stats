package com.rzs.stats.controller;

import com.rzs.stats.model.dto.QbDtos;
import com.rzs.stats.model.dto.QbStatDto;
import com.rzs.stats.service.QbStatsService;
import com.rzs.stats.service.QbStatsService.Scope;
import com.rzs.stats.service.QbStatsService.Stage;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.Locale;

@RestController
@RequestMapping("/api/qb")
public class QbController {
    private final QbStatsService service;
    public QbController(QbStatsService service) { this.service = service; }

    @GetMapping("/leaderboard")
    public List<QbStatDto> leaderboard(@RequestParam(defaultValue = "SEASON") String scope,
            @RequestParam(required = false) Integer season, @RequestParam(required = false) Integer week,
            @RequestParam(defaultValue = "REGULAR") String stage, @RequestParam(required = false) Integer minAtt,
            @RequestParam(defaultValue = "false") boolean includeUnqualified) {
        validate(season, week);
        return service.leaderboard(parse(Scope.class, scope), season, week, parse(Stage.class, stage), minAtt, includeUnqualified);
    }

    @GetMapping("/movement")
    public QbDtos.Movement movement(@RequestParam(required = false) Integer season,
            @RequestParam(defaultValue = "REGULAR") String stage, @RequestParam(defaultValue = "1") int window,
            @RequestParam(defaultValue = "SEASON") String basis) {
        validate(season, null);
        return service.movement(season, parse(Stage.class, stage), window, parse(QbStatsService.Basis.class, basis));
    }

    @GetMapping("/profile/{rosterId}")
    public QbDtos.Profile profile(@PathVariable String rosterId, @RequestParam(defaultValue = "REGULAR") String stage) {
        return service.profile(rosterId, parse(Stage.class, stage));
    }

    private void validate(Integer season, Integer week) {
        if (season != null && season < 0 || week != null && (week < 0 || week > 22))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid season or week");
    }

    private <T extends Enum<T>> T parse(Class<T> type, String value) {
        try { return Enum.valueOf(type, value.toUpperCase(Locale.ROOT)); }
        catch (IllegalArgumentException e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid " + type.getSimpleName()); }
    }
}
