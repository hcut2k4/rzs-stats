package com.rzs.stats.playoffs;

import com.rzs.stats.service.EloQueryService;
import com.rzs.stats.service.EloService;
import org.springframework.beans.factory.annotation.Value;
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
    public record Response(int season, String rules, int simulations, Instant computedAt, List<Row> teams) {}

    private final ComputeGate gate;
    private final SeasonStateLoader loader;
    private final EloQueryService elo;
    private final SimulationService simulator;
    private final int simulations;

    public ChampionshipService(SeasonStateLoader loader, EloQueryService elo, SimulationService simulator,
                               @Value("${playoffs.simulations:20000}") int simulations, ComputeGate gate) {
        if (simulations <= 0) throw new IllegalArgumentException("playoffs.simulations must be positive");
        this.gate = gate;
        this.loader = loader;
        this.elo = elo;
        this.simulator = simulator;
        this.simulations = simulations;
    }

    public int canonicalSeason(Integer season, String rules) {
        if (!"madden".equals(rules) && !"nfl".equals(rules))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rules must be madden or nfl");
        return season == null ? loader.load(null).season() : season;
    }

    @Cacheable(value = "playoffChampionship", key = "new org.springframework.cache.interceptor.SimpleKey(#root.target.canonicalSeason(#season, #rules), #rules)", sync = true)
    public Response championship(Integer season, String rules) {
        if (!rules.equals("madden") && !rules.equals("nfl")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rules must be madden or nfl");
        }
        var state = loader.load(season);
        return gate.compute(() -> {
            var ratings = elo.currentRatings(state.season());
            var probabilities = new HashMap<String, Map<String, Double>>();
            var neutral = new HashMap<String, Map<String, Double>>();
            state.identities().forEach((home, h) -> {
                var hosted = new HashMap<String, Double>();
                var awaySite = new HashMap<String, Double>();
                state.identities().forEach((away, a) -> {
                    hosted.put(away, elo.winProbability(ratings, h.teamId(), a.teamId(), false));
                    awaySite.put(away, elo.winProbability(ratings, h.teamId(), a.teamId(), true));
                });
                probabilities.put(home, hosted);
                neutral.put(home, awaySite);
            });
            SimulationService.Championship result;
            try {
                result = simulator.championship(state, state.remainingGames().isEmpty() ? Map.of() : elo.homeWinProbabilities(state.season()),
                        simulations, OddsService.seed(state, rules), rules.equals("madden") ? SimulationService.Rules.MADDEN : SimulationService.Rules.NFL,
                        (home, away, finalGame) -> (finalGame ? neutral : probabilities).get(home).get(away));
            } catch (IllegalStateException e) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Available game data cannot resolve the championship bracket", e);
            }
            var rows = new ArrayList<Row>();
            for (var team : state.teams()) {
                var count = result.teams().get(team.abbr());
                rows.add(new Row(state.identities().get(team.abbr()), team.conference(),
                        result.baseline().teams().get(team.abbr()).playoffs() / (double) simulations,
                        count.round2() / (double) simulations, count.conferenceFinal() / (double) simulations,
                        count.finalCount() / (double) simulations, count.champion() / (double) simulations));
            }
            rows.sort(Comparator.comparingDouble(Row::champion).reversed().thenComparing(r -> r.team().abbrName()));
            return new Response(state.season(), rules, simulations, Instant.now(), List.copyOf(rows));
        });
    }
}
