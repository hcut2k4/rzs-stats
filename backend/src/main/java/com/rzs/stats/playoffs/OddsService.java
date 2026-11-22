package com.rzs.stats.playoffs;

import com.rzs.stats.service.EloQueryService;
import com.rzs.stats.service.EloService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.CacheManager;
import org.springframework.cache.interceptor.SimpleKey;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.*;

@Service
public class OddsService {
    public record Odds(double playoffs, double division, double oneSeed) {}
    public record Row(EloService.Team team, String division, int wins, int losses, int ties, Odds odds, List<Double> seedOdds) {}
    public record Conference(String name, List<Row> teams) {}
    public record Response(int season, String rules, Integer throughWeek, Integer nextWeek, int simulations,
                           Instant computedAt, List<Conference> conferences) {}
    private final SeasonStateLoader loader;
    private final EloQueryService elo;
    private final SimulationService simulator;
    private final int simulations;
    private final CacheManager caches;

    public OddsService(SeasonStateLoader loader, EloQueryService elo, SimulationService simulator,
                       @Value("${playoffs.simulations:20000}") int simulations, CacheManager caches) {
        if (simulations <= 0) throw new IllegalArgumentException("playoffs.simulations must be positive");
        this.loader = loader;
        this.elo = elo;
        this.simulator = simulator;
        this.simulations = simulations;
        this.caches = caches;
    }

    public Response available(Integer season, String rules) {
        var cache = caches.getCache("playoffOdds");
        if (cache == null) return null;
        var result = cache.get(new SimpleKey(season, rules), Response.class);
        if (result == null) result = cache.get(new SimpleKey(null, rules), Response.class);
        return result != null && Objects.equals(result.season(), season) ? result : null;
    }

    @Cacheable(value = "playoffOdds", sync = true)
    public Response odds(Integer season, String rules) {
        if (!rules.equals("madden") && !rules.equals("nfl")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rules must be madden or nfl");
        }
        var state = loader.load(season);
        var selected = rules.equals("madden") ? SimulationService.Rules.MADDEN : SimulationService.Rules.NFL;
        long seed = SimulationService.mix(((long) state.season() << 32) ^ Objects.hashCode(state.nextWeek()) ^ rules.hashCode());
        SimulationService.Simulation result;
        try {
            result = simulator.simulate(state, state.remainingGames().isEmpty() ? Map.of() : elo.homeWinProbabilities(state.season()),
                    Map.of(), simulations, seed, selected);
        } catch (IllegalStateException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Available game data cannot resolve the requested playoff order", e);
        }
        double denominator = Math.max(1, result.simulations());
        var records = MaddenSeeding.madden27().seed(state.teams(), state.completedGames()).records();
        var conferences = new TreeMap<String, List<Row>>();
        for (var team : state.teams()) {
            var count = result.teams().get(team.abbr());
            var record = records.get(team.abbr());
            var row = new Row(state.identities().get(team.abbr()), team.division(), record.wins(), record.losses(), record.ties(),
                    new Odds(count.playoffs() / denominator, count.division() / denominator, count.oneSeed() / denominator),
                    count.seedCounts().stream().map(n -> n / denominator).toList());
            conferences.computeIfAbsent(team.conference(), key -> new ArrayList<>()).add(row);
        }
        return new Response(state.season(), rules, state.throughWeek(), state.nextWeek(), result.simulations(), Instant.now(),
                conferences.entrySet().stream().map(e -> new Conference(e.getKey(), e.getValue().stream()
                        .sorted(Comparator.comparingDouble((Row r) -> r.odds().playoffs()).reversed()
                                .thenComparing(r -> r.team().abbrName())).toList())).toList());
    }
}
