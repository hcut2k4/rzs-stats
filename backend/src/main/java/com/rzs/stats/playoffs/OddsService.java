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
@org.springframework.context.annotation.Import(com.rzs.stats.service.SyncStatusService.class)
public class OddsService {
    public record Odds(double playoffs, double division, double oneSeed) {}
    public record Row(EloService.Team team, String division, int wins, int losses, int ties, Odds odds, List<Double> seedOdds) {}
    public record Conference(String name, List<Row> teams) {}
    public record Provenance(String eloConfigHash, String inputFingerprint, String modelVersion) {}
    public record Response(int season, String rules, Integer throughWeek, Integer nextWeek, int simulations,
                           Instant computedAt, List<Conference> conferences,
                           @com.fasterxml.jackson.annotation.JsonIgnore Provenance provenance) {
        public Response(int season, String rules, Integer throughWeek, Integer nextWeek, int simulations,
                        Instant computedAt, List<Conference> conferences) {
            this(season, rules, throughWeek, nextWeek, simulations, computedAt, conferences, null);
        }
    }
    private final com.rzs.stats.config.PlayoffCacheInvalidation invalidation;
    private final ComputeGate gate;
    private final SeasonStateLoader loader;
    private final EloQueryService elo;
    private final SimulationService simulator;
    private final int simulations;
    private final CacheManager caches;

    public OddsService(SeasonStateLoader loader, EloQueryService elo, SimulationService simulator,
                       @Value("${playoffs.simulations:20000}") int simulations, CacheManager caches, ComputeGate gate, com.rzs.stats.config.PlayoffCacheInvalidation invalidation) {
        this.invalidation = invalidation;
        if (simulations <= 0) throw new IllegalArgumentException("playoffs.simulations must be positive");
        this.gate = gate;
        this.loader = loader;
        this.elo = elo;
        this.simulator = simulator;
        this.simulations = simulations;
        this.caches = caches;
    }

    private com.rzs.stats.service.SyncStatusService inputs;
    private org.springframework.transaction.support.TransactionTemplate reads;

    @org.springframework.beans.factory.annotation.Autowired
    void configureInputs(com.rzs.stats.service.SyncStatusService inputs, org.springframework.transaction.PlatformTransactionManager manager) {
        this.inputs = inputs;
        reads = new org.springframework.transaction.support.TransactionTemplate(manager);
        reads.setReadOnly(true);
        reads.setIsolationLevel(org.springframework.transaction.TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }

    private record Prepared(SeasonStateLoader.State state, Map<Integer, Double> probabilities,
                            EloQueryService.Ratings ratings, Provenance provenance) {}
    private record Forecast(SeasonStateLoader.State state, SimulationService.Championship result, Provenance provenance) {}

    private Prepared prepare(Integer season, Integer week) {
        return prepare(season, week, null, null);
    }

    private Prepared prepare(Integer season, Integer week, SeasonStateLoader.State suppliedState, Map<Integer, Double> suppliedProbabilities) {
        java.util.function.Supplier<Prepared> load = () -> {
            var state = suppliedState != null ? suppliedState : week == null ? loader.load(season) : loader.loadAtStart(season, week);
            var ratings = week != null ? elo.ratingsAtStart(state.season(), week)
                    : state.remainingGames().isEmpty() ? elo.ratingsAtStart(state.season(), 18) : elo.currentRatings(state.season());
            var probabilities = new HashMap<Integer, Double>();
            if (suppliedProbabilities != null) probabilities.putAll(suppliedProbabilities);
            else for (var game : state.remainingGames()) probabilities.put(game.gameId(),
                    elo.winProbability(ratings, game.homeTeamId(), game.awayTeamId(), false));
            var provenance = inputs == null ? null : new Provenance(
                    com.rzs.stats.service.SyncStatusService.hash(ratings.config().toString()),
                    inputs.fingerprint(ratings.config()), com.rzs.stats.model.entity.OddsSnapshotEntity.MODEL_VERSION);
            return new Prepared(state, Map.copyOf(probabilities), ratings, provenance);
        };
        return reads == null ? load.get() : reads.execute(status -> load.get());
    }

    public Response available(Integer season, String rules) {
        var cache = caches.getCache("playoffOdds");
        if (cache == null) return null;
        var result = cache.get(new SimpleKey(season, rules, invalidation.generation()), Response.class);
        return result != null && Objects.equals(result.season(), season) ? result : null;
    }

    public long generation() { return invalidation.generation(); }

    public void publish(long generation, Response response) {
        invalidation.publish(generation, "playoffOdds", new SimpleKey(response.season(), response.rules(), generation), response);
    }

    public int canonicalSeason(Integer season, String rules) {
        if (!"madden".equals(rules) && !"nfl".equals(rules))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rules must be madden or nfl");
        return season == null ? loader.load(null).season() : season;
    }

    public Object cacheKey(Integer season, String rules) {
        return new org.springframework.cache.interceptor.SimpleKey(canonicalSeason(season, rules), rules, invalidation.generation());
    }


    @Cacheable(value = "playoffOdds", key = "#root.target.cacheKey(#season, #rules)", sync = true)
    public Response odds(Integer season, String rules) {
        if (!rules.equals("madden") && !rules.equals("nfl")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rules must be madden or nfl");
        }
        var forecast = forecast(canonicalSeason(season, rules), rules);
        return response(forecast.state(), rules, forecast.result().baseline(), forecast.provenance());
    }

    int simulationCount() { return simulations; }

    Response compute(SeasonStateLoader.State state, String rules, Map<Integer, Double> probabilities, long generation) {
        var forecast = forecast(state.season(), rules, generation, () -> prepare(state.season(), null, state, probabilities));
        return response(forecast.state(), rules, forecast.result().baseline(), forecast.provenance());
    }

    public SimulationService.Championship baseline(int season, String rules) {
        return forecast(season, rules).result();
    }

    private Forecast forecast(int season, String rules) {
        return forecast(season, rules, invalidation.generation(), () -> prepare(season, null));
    }

    private Forecast forecast(int season, String rules, long generation, java.util.function.Supplier<Prepared> load) {
        var cache = caches.getCache("playoffBaseline");
        try {
            return cache.get(new SimpleKey(season, rules, generation), () -> {
                var prepared = load.get();
                var state = prepared.state();
                var probabilities = prepared.probabilities();
                boolean bracket = state.teams().stream().map(PlayoffSeeding.Team::conference).distinct().count() == 2
                        && state.teams().stream().collect(java.util.stream.Collectors.groupingBy(PlayoffSeeding.Team::conference,
                        java.util.stream.Collectors.counting())).values().stream().allMatch(n -> n >= 7);
                var selected = rules.equals("madden") ? SimulationService.Rules.MADDEN : SimulationService.Rules.NFL;
                SimulationService.Championship result;
                if (!bracket) result = gate.execute(() -> new SimulationService.Championship(
                        simulator.baseline(state, probabilities, simulations, seed(state, rules), selected), Map.of()));
                else {
                    var hosted = new HashMap<String, Double>();
                    var neutral = new HashMap<String, Double>();
                    state.identities().forEach((home, h) -> state.identities().forEach((away, a) -> {
                        hosted.put(home + ":" + away, elo.winProbability(prepared.ratings(), h.teamId(), a.teamId(), false));
                        neutral.put(home + ":" + away, elo.winProbability(prepared.ratings(), h.teamId(), a.teamId(), true));
                    }));
                    result = gate.execute(() -> simulator.championship(state, probabilities, simulations, seed(state, rules), selected,
                            (home, away, finalGame) -> (finalGame ? neutral : hosted).get(home + ":" + away)));
                }
                return new Forecast(state, result, prepared.provenance());
            });
        } catch (org.springframework.cache.Cache.ValueRetrievalException e) {
            if (e.getCause() instanceof RuntimeException cause) throw cause;
            throw e;
        }
    }

    static long seed(SeasonStateLoader.State state, String rules) {
        return SimulationService.mix(((long) state.season() << 32) ^ Objects.hashCode(state.nextWeek()) ^ rules.hashCode());
    }

    public Response historical(SeasonStateLoader.State state) {
        var prepared = prepare(state.season(), state.nextWeek());
        return gate.execute(() -> response(prepared.state(), "madden", simulator.simulate(prepared.state(), prepared.probabilities(), Map.of(), simulations,
                seed(prepared.state(), "madden"), SimulationService.Rules.MADDEN), prepared.provenance()));
    }

    private Response response(SeasonStateLoader.State state, String rules, SimulationService.Simulation result, Provenance provenance) {
        if (state.remainingGames().isEmpty() && result.simulations() > 0) {
            int n = result.simulations();
            var counts = new TreeMap<String, SimulationService.Counts>();
            result.teams().forEach((team, c) -> counts.put(team, new SimulationService.Counts(c.playoffs() / n,
                    c.division() / n, c.oneSeed() / n, c.seedCounts().stream().map(v -> v / n).toList())));
            result = new SimulationService.Simulation(0, counts, Map.of(), result.allWins());
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
        return new Response(state.season(), rules, state.throughWeek(), state.nextWeek(), state.remainingGames().isEmpty() ? 0 : result.simulations(), Instant.now(),
                conferences.entrySet().stream().map(e -> new Conference(e.getKey(), e.getValue().stream()
                        .sorted(Comparator.comparingDouble((Row r) -> r.odds().playoffs()).reversed()
                                .thenComparing(r -> r.team().abbrName())).toList())).toList(), provenance);
    }
}
