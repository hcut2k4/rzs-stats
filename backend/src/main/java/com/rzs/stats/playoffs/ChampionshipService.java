package com.rzs.stats.playoffs;

import com.rzs.stats.service.EloService;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.*;

@Service
public class ChampionshipService {
    public record Row(EloService.Team team, String conference, double playoffs, double round2,
                      double conferenceFinal, @com.fasterxml.jackson.annotation.JsonProperty("final") double finalCount,
                      double champion) {}
    public record Response(int season, String rules, int simulations, Instant computedAt, List<Row> teams, boolean preplayoff) {}

    private final SeasonStateLoader loader;
    private final OddsService odds;

    public ChampionshipService(SeasonStateLoader loader, OddsService odds) {
        this.loader = loader;
        this.odds = odds;
    }

    public int canonicalSeason(Integer season, String rules) {
        if (!"madden".equals(rules) && !"nfl".equals(rules))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rules must be madden or nfl");
        return season == null ? loader.load(null).season() : season;
    }

    public Object cacheKey(Integer season, String rules) {
        return new org.springframework.cache.interceptor.SimpleKey(canonicalSeason(season, rules), rules);
    }


    @Cacheable(value = "playoffChampionship", key = "#root.target.cacheKey(#season, #rules)", sync = true)
    public Response championship(Integer season, String rules) {
        if (!rules.equals("madden") && !rules.equals("nfl")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rules must be madden or nfl");
        }
        var state = loader.load(season);
        var result = odds.baseline(state.season(), rules);
        if (result.teams().isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Championship requires two conferences with seven seeds");
        int simulations = result.baseline().simulations();
        var rows = new ArrayList<Row>();
        for (var team : state.teams()) {
            var count = result.teams().get(team.abbr());
            rows.add(new Row(state.identities().get(team.abbr()), team.conference(),
                    result.baseline().teams().get(team.abbr()).playoffs() / (double) simulations,
                    count.round2() / (double) simulations, count.conferenceFinal() / (double) simulations,
                    count.finalCount() / (double) simulations, count.champion() / (double) simulations));
        }
        rows.sort(Comparator.comparingDouble(Row::champion).reversed().thenComparing(r -> r.team().abbrName()));
        return new Response(state.season(), rules, simulations, Instant.now(), List.copyOf(rows), state.remainingGames().isEmpty());
    }
}
