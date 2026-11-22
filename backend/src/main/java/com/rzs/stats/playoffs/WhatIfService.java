package com.rzs.stats.playoffs;

import com.fasterxml.jackson.annotation.JsonUnwrapped;
import com.rzs.stats.service.EloQueryService;
import com.rzs.stats.service.EloService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

@Service
public class WhatIfService {
    public record Pick(Integer gameId, String result) {}
    public record Request(Integer season, String rules, List<Pick> picks, Integer simulations) {}
    public record RemainingGame(int gameId, int week, EloService.Team home, EloService.Team away, double homeWinProb) {}
    public record Remaining(int season, Integer nextWeek, List<RemainingGame> games) {}
    public record Row(EloService.Team team, String division, OddsService.Odds odds, OddsService.Odds baseline,
                      List<Double> seedOdds) {}
    public record Seed(@JsonUnwrapped PlayoffPictureService.Row row, OddsService.Odds odds, boolean dependsOnScores) {}
    public record Conference(String name, List<Row> teams, List<Seed> seeds) {}
    public record Response(int season, String rules, int picked, int remaining, int simulations, boolean exact,
                           List<Conference> conferences) {}

    private final SeasonStateLoader loader;
    private final EloQueryService elo;
    private final SimulationService simulator;
    private final OddsService baseline;

    public WhatIfService(SeasonStateLoader loader, EloQueryService elo, SimulationService simulator, OddsService baseline) {
        this.loader = loader;
        this.elo = elo;
        this.simulator = simulator;
        this.baseline = baseline;
    }

    public Remaining remaining(Integer season) {
        var state = loader.load(season);
        var probabilities = state.remainingGames().isEmpty() ? Map.<Integer, Double>of() : elo.homeWinProbabilities(state.season());
        return new Remaining(state.season(), state.nextWeek(), state.remainingGames().stream()
                .map(g -> new RemainingGame(g.gameId(), g.week(), state.identities().get(g.home()),
                        state.identities().get(g.away()), probabilities.get(g.gameId()))).toList());
    }

    public Response simulate(Request request) {
        if (request == null) throw bad("Request is required");
        String rules = request.rules() == null ? "madden" : request.rules();
        if (!rules.equals("madden") && !rules.equals("nfl")) throw bad("Rules must be madden or nfl");
        int simulations = request.simulations() == null ? 5000 : request.simulations();
        if (simulations < 1 || simulations > 20000) throw bad("Simulations must be between 1 and 20000");
        var state = loader.load(request.season());
        var picks = request.picks() == null ? List.<Pick>of() : request.picks();
        if (picks.size() > state.remainingGames().size()) throw bad("Too many picks for the remaining schedule");
        var ids = new HashSet<Integer>();
        state.remainingGames().forEach(g -> ids.add(g.gameId()));
        var forced = new HashMap<Integer, SimulationService.Outcome>();
        for (var pick : picks) {
            if (pick == null || pick.gameId() == null || !ids.contains(pick.gameId())) throw bad("Pick must name a remaining regular-season game");
            if (pick.result() == null) throw bad("Result must be home, away or tie");
            var outcome = switch (pick.result()) {
                case "home" -> SimulationService.Outcome.HOME;
                case "away" -> SimulationService.Outcome.AWAY;
                case "tie" -> SimulationService.Outcome.TIE;
                default -> throw bad("Result must be home, away or tie");
            };
            if (forced.putIfAbsent(pick.gameId(), outcome) != null) throw bad("Duplicate gameId");
        }
        var selected = rules.equals("madden") ? SimulationService.Rules.MADDEN : SimulationService.Rules.NFL;
        long seed = SimulationService.mix(((long) state.season() << 32) ^ Objects.hashCode(state.nextWeek()) ^ rules.hashCode());
        var probabilities = state.remainingGames().isEmpty() ? Map.<Integer, Double>of() : elo.homeWinProbabilities(state.season());
        var result = simulator.simulate(state, probabilities, forced, simulations, seed, selected, true);
        var base = new HashMap<String, OddsService.Odds>();
        baseline.odds(state.season(), rules).conferences().forEach(c -> c.teams().forEach(r -> base.put(r.team().abbrName(), r.odds())));
        boolean exact = forced.size() == state.remainingGames().size();
        var exactResult = exact ? SimulationService.seed(state.teams(), syntheticGames(state, forced), selected) : null;
        var uncertain = exact ? dependsOnScores(exactResult) : Set.<String>of();
        var ranks = new HashMap<String, Integer>();
        if (exact) exactResult.conferences().values().forEach(rs -> rs.forEach(r -> r.teams().forEach(t -> ranks.put(t, r.position()))));
        var odds = new HashMap<String, OddsService.Odds>();
        var seedOdds = new HashMap<String, List<Double>>();
        double denominator = Math.max(1, result.simulations());
        for (var team : state.teams()) {
            String abbr = team.abbr();
            var count = result.teams().get(abbr);
            if (exact && !uncertain.contains(abbr)) {
                int rank = ranks.get(abbr);
                odds.put(abbr, new OddsService.Odds(rank <= 7 ? 1 : 0,
                        exactResult.divisionRanks().get(abbr).position() == 1 ? 1 : 0, rank == 1 ? 1 : 0));
                var fractions = new ArrayList<Double>();
                for (int i = 1; i <= 7; i++) fractions.add(rank == i ? 1.0 : 0.0);
                seedOdds.put(abbr, List.copyOf(fractions));
            } else {
                odds.put(abbr, new OddsService.Odds(count.playoffs() / denominator, count.division() / denominator, count.oneSeed() / denominator));
                seedOdds.put(abbr, count.seedCounts().stream().map(n -> n / denominator).toList());
            }
        }
        var exactRows = exact ? exactRows(state, rules, forced, exactResult, uncertain, odds) : Map.<String, List<Seed>>of();
        var conferences = new TreeMap<String, List<Row>>();
        for (var team : state.teams()) conferences.computeIfAbsent(team.conference(), k -> new ArrayList<>())
                .add(new Row(state.identities().get(team.abbr()), team.division(), odds.get(team.abbr()), base.get(team.abbr()), seedOdds.get(team.abbr())));
        return new Response(state.season(), rules, picks.size(), state.remainingGames().size(), result.simulations(), exact,
                conferences.entrySet().stream().map(e -> new Conference(e.getKey(), e.getValue().stream()
                        .sorted(Comparator.comparingDouble((Row r) -> r.odds().playoffs()).reversed().thenComparing(r -> r.team().abbrName()))
                        .toList(), exactRows.get(e.getKey()))).toList());
    }

    static List<PlayoffSeeding.Game> syntheticGames(SeasonStateLoader.State state, Map<Integer, SimulationService.Outcome> forced) {
        var games = new ArrayList<>(state.completedGames());
        for (var g : state.remainingGames()) {
            var outcome = forced.get(g.gameId());
            games.add(new PlayoffSeeding.Game(g.week(), g.home(), g.away(),
                    outcome == SimulationService.Outcome.TIE ? 20 : outcome == SimulationService.Outcome.HOME ? 24 : 17,
                    outcome == SimulationService.Outcome.TIE ? 20 : outcome == SimulationService.Outcome.AWAY ? 24 : 17));
        }
        return games;
    }

    static Set<String> dependsOnScores(PlayoffSeeding.Result result) {
        var relevant = new HashSet<String>();
        result.conferences().values().forEach(rs -> rs.stream().filter(r -> r.position() <= 7).forEach(r -> relevant.addAll(r.teams())));
        result.divisionRanks().forEach((team, rank) -> { if (rank.position() == 1) relevant.add(team); });
        var uncertain = new HashSet<String>();
        for (var trace : result.trace()) {
            if (trace.tied().size() < 2 || Collections.disjoint(relevant, trace.tied())) continue;
            boolean scores = trace.step() != null && switch (trace.step()) {
                case COMBINED_RANKING_CONFERENCE, COMBINED_RANKING_ALL, NET_POINTS_COMMON, NET_POINTS_CONFERENCE,
                        NET_POINTS_ALL, NET_TOUCHDOWNS, COIN_TOSS, ALPHABETICAL -> true;
                default -> false;
            };
            if ((scores && !trace.remaining().equals(trace.tied())) || trace.status() == PlayoffSeeding.Status.UNRESOLVED)
                uncertain.addAll(trace.tied());
        }
        return Set.copyOf(uncertain);
    }

    private Map<String, List<Seed>> exactRows(SeasonStateLoader.State state, String rules,
                                             Map<Integer, SimulationService.Outcome> forced, PlayoffSeeding.Result result,
                                             Set<String> uncertain, Map<String, OddsService.Odds> odds) {
        var other = SimulationService.seed(state.teams(), syntheticGames(state, forced),
                rules.equals("madden") ? SimulationService.Rules.NFL : SimulationService.Rules.MADDEN);
        var otherSeeds = new HashMap<String, Integer>();
        other.conferences().values().stream().flatMap(Collection::stream)
                .filter(r -> r.position() <= 7 && r.teams().size() == 1)
                .forEach(r -> otherSeeds.put(r.teams().iterator().next(), r.position()));
        var reasons = new TiebreakExplainer().explain(result, state.identities());
        var divisions = new HashMap<String, String>();
        state.teams().forEach(t -> divisions.put(t.abbr(), t.division()));
        var conferences = new TreeMap<String, List<Seed>>();
        result.conferences().forEach((name, ranks) -> {
            var rows = new ArrayList<Seed>();
            for (var rank : ranks) {
                if (rank.position() > 7) continue;
                String abbr = rank.teams().iterator().next();
                var record = result.records().get(abbr);
                var row = new PlayoffPictureService.Row(rank.position(), null, state.identities().get(abbr), divisions.get(abbr),
                        result.divisionRanks().get(abbr).position() == 1, record.wins(), record.losses(), record.ties(),
                        otherSeeds.get(abbr), reasons.getOrDefault(abbr, List.of()), null);
                rows.add(new Seed(row, odds.get(abbr), uncertain.contains(abbr)));
            }
            conferences.put(name, List.copyOf(rows));
        });
        return conferences;
    }

    private static ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
}
