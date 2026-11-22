package com.rzs.stats.playoffs;

import com.rzs.stats.service.EloService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.util.List;
import java.util.Locale;

@Service
public class ClinchService {
    public record Row(EloService.Team team, String playoffs, String division, String oneSeed) {}
    public record Response(int season, String rules, boolean exhaustive, List<Row> teams) {}
    private final SeasonStateLoader loader;
    private final int cap;
    private final Duration budget;

    public ClinchService(SeasonStateLoader loader,
                         @Value("${rzs.playoffs.clinch.max-remaining-games:12}") int cap,
                         @Value("${rzs.playoffs.clinch.budget:20s}") Duration budget) {
        this.loader = loader; this.cap = cap; this.budget = budget;
    }

    @Cacheable("playoffClinch")
    public Response clinch(Integer season, String rules) {
        if (!"madden".equals(rules) && !"nfl".equals(rules))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rules must be madden or nfl");
        var state = loader.load(season);
        var schedule = new ClinchAnalyzer.Season(state.teams(), state.completedGames(), state.remainingGames().stream()
                .map(g -> new ClinchAnalyzer.Matchup(g.week(), g.home(), g.away())).toList());
        var analysis = ClinchAnalyzer.analyze(schedule, games -> MaddenSeeding.madden27().seed(state.teams(), games),
                rules.equals("nfl") ? Duration.ZERO : budget, cap);
        return new Response(state.season(), rules, analysis.exhaustive(), state.teams().stream().map(t -> {
            var markers = analysis.markers().get(t.abbr());
            return new Row(state.identities().get(t.abbr()), value(markers.get(ClinchAnalyzer.Goal.PLAYOFFS)),
                    value(markers.get(ClinchAnalyzer.Goal.DIVISION)), value(markers.get(ClinchAnalyzer.Goal.ONE_SEED)));
        }).toList());
    }

    public ClinchAnalyzer.Analysis constrained(SeasonStateLoader.State state, String rules,
                                               java.util.Map<ClinchAnalyzer.Matchup, SimulationService.Outcome> forced) {
        var schedule = new ClinchAnalyzer.Season(state.teams(), state.completedGames(), state.remainingGames().stream()
                .map(g -> new ClinchAnalyzer.Matchup(g.week(), g.home(), g.away())).toList());
        return ClinchAnalyzer.analyze(schedule, games -> MaddenSeeding.madden27().seed(state.teams(), games),
                rules.equals("nfl") ? Duration.ZERO : budget, cap, forced);
    }

    private static String value(ClinchAnalyzer.Marker marker) {
        return marker == ClinchAnalyzer.Marker.NONE ? null : marker.name().toLowerCase(Locale.ROOT);
    }
}
