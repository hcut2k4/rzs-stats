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
public class LeverageService {
    public record ConditionalOdds(OddsService.Odds homeWin, OddsService.Odds awayWin) {}
    public record GameMatrix(int gameId, EloService.Team home, EloService.Team away, double homeWinProb,
                             Map<String, ConditionalOdds> teams) {}
    public record LeverageMatrix(int season, Integer week, String rules, int simulations, Instant computedAt,
                                 List<GameMatrix> games) {}
    public record Participant(EloService.Team team, String side, OddsService.Odds current,
                              OddsService.Odds ifWin, OddsService.Odds ifLoss) {}
    public record Other(EloService.Team team, String goal, double swing) {}
    public record Game(int gameId, EloService.Team home, EloService.Team away, double homeWinProb,
                       List<Participant> teams, OddsService.Odds importance, List<Other> others) {}
    public record Response(int season, Integer week, String rules, int simulations, Instant computedAt, List<Game> games) {}

    private final SeasonStateLoader loader;
    private final EloQueryService elo;
    private final SimulationService simulator;
    private final int simulations;

    public LeverageService(SeasonStateLoader loader, EloQueryService elo, SimulationService simulator,
                           @Value("${playoffs.leverage-simulations:10000}") int simulations) {
        if (simulations <= 0) throw new IllegalArgumentException("playoffs.leverage-simulations must be positive");
        this.loader = loader;
        this.elo = elo;
        this.simulator = simulator;
        this.simulations = simulations;
    }

    @Cacheable(value = "leverage", sync = true)
    public LeverageMatrix matrix(Integer season, Integer week, String rules) {
        if (!"madden".equals(rules) && !"nfl".equals(rules))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rules must be madden or nfl");
        var state = loader.load(season);
        Integer selectedWeek = week == null ? state.nextWeek() : week;
        var games = state.remainingGames().stream().filter(g -> Objects.equals(g.week(), selectedWeek)).toList();
        var probs = games.isEmpty() ? Map.<Integer, Double>of() : elo.homeWinProbabilities(state.season());
        long seed = SimulationService.mix(((long) state.season() << 32) ^ Objects.hashCode(selectedWeek) ^ rules.hashCode());
        var selectedRules = rules.equals("madden") ? SimulationService.Rules.MADDEN : SimulationService.Rules.NFL;
        var result = new ArrayList<GameMatrix>();
        for (var game : games) {
            var home = simulator.simulate(state, probs, Map.of(game.gameId(), SimulationService.Outcome.HOME), simulations, seed, selectedRules);
            var away = simulator.simulate(state, probs, Map.of(game.gameId(), SimulationService.Outcome.AWAY), simulations, seed, selectedRules);
            var teams = new TreeMap<String, ConditionalOdds>();
            for (var team : state.teams()) teams.put(team.abbr(), new ConditionalOdds(
                    fractions(home.teams().get(team.abbr())), fractions(away.teams().get(team.abbr()))));
            result.add(new GameMatrix(game.gameId(), state.identities().get(game.home()), state.identities().get(game.away()),
                    probs.get(game.gameId()), Collections.unmodifiableMap(teams)));
        }
        return new LeverageMatrix(state.season(), selectedWeek, rules, simulations, Instant.now(), List.copyOf(result));
    }

    public Response response(LeverageMatrix matrix) {
        var identities = matrix.games().isEmpty() ? Map.<String, EloService.Team>of() : loader.load(matrix.season()).identities();
        var games = matrix.games().stream().map(game -> {
            double playoffs = 0, division = 0, oneSeed = 0;
            var others = new ArrayList<Other>();
            for (var entry : game.teams().entrySet()) {
                var pair = entry.getValue();
                double p = pair.homeWin().playoffs() - pair.awayWin().playoffs();
                double d = pair.homeWin().division() - pair.awayWin().division();
                double o = pair.homeWin().oneSeed() - pair.awayWin().oneSeed();
                playoffs += Math.abs(p) / 2; division += Math.abs(d) / 2; oneSeed += Math.abs(o) / 2;
                if (entry.getKey().equals(game.home().abbrName()) || entry.getKey().equals(game.away().abbrName())) continue;
                String goal = "playoffs";
                double swing = p;
                if (Math.abs(d) > Math.abs(swing)) { goal = "division"; swing = d; }
                if (Math.abs(o) > Math.abs(swing)) { goal = "oneSeed"; swing = o; }
                others.add(new Other(identities.get(entry.getKey()), goal, swing));
            }
            return new Game(game.gameId(), game.home(), game.away(), game.homeWinProb(),
                    List.of(participant(game, game.home(), true), participant(game, game.away(), false)),
                    new OddsService.Odds(playoffs, division, oneSeed), others.stream()
                    .sorted(Comparator.comparingDouble((Other other) -> Math.abs(other.swing())).reversed()
                            .thenComparing(other -> other.team().abbrName())).limit(5).toList());
        }).toList();
        return new Response(matrix.season(), matrix.week(), matrix.rules(), matrix.simulations(), matrix.computedAt(), games);
    }

    private OddsService.Odds fractions(SimulationService.Counts counts) {
        return new OddsService.Odds(counts.playoffs() / (double) simulations, counts.division() / (double) simulations,
                counts.oneSeed() / (double) simulations);
    }

    private static Participant participant(GameMatrix game, EloService.Team team, boolean home) {
        var pair = game.teams().get(team.abbrName());
        double p = game.homeWinProb();
        var current = new OddsService.Odds(p * pair.homeWin().playoffs() + (1 - p) * pair.awayWin().playoffs(),
                p * pair.homeWin().division() + (1 - p) * pair.awayWin().division(),
                p * pair.homeWin().oneSeed() + (1 - p) * pair.awayWin().oneSeed());
        return new Participant(team, home ? "home" : "away", current, home ? pair.homeWin() : pair.awayWin(),
                home ? pair.awayWin() : pair.homeWin());
    }
}
