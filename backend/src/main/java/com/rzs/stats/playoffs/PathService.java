package com.rzs.stats.playoffs;

import com.rzs.stats.service.EloQueryService;
import com.rzs.stats.service.EloService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;
import java.util.concurrent.Semaphore;

@Service
public class PathService {
    public record Markers(String playoffs, String division, String oneSeed) {}
    public record WinOut(double playoffs, double division, double oneSeed, boolean controlsDestiny) {}
    public record Ceiling(Integer bestSeed, List<Double> seedOdds) {}
    public record WinsNeeded(int finalWins, String record, double chance, double playoffs, double division, double oneSeed) {}
    public record RootGame(int gameId, Integer week, EloService.Team home, EloService.Team away, String rootFor, double swing) {}
    public record Response(int season, String rules, EloService.Team team, int wins, int losses, int ties,
                           int remainingGames, int simulations, OddsService.Odds current, Markers markers,
                           WinOut winOut, Ceiling ceiling, List<WinsNeeded> winsNeeded,
                           List<RootGame> winOutRisks, List<RootGame> rootThisWeek) {}

    private final SeasonStateLoader loader;
    private final OddsService odds;
    private final ClinchService clinch;
    private final LeverageService leverage;
    private final SimulationService simulator;
    private final EloQueryService elo;
    private final int simulations, riskSimulations;
    private final Semaphore capacity = new Semaphore(1);

    public PathService(SeasonStateLoader loader, OddsService odds, ClinchService clinch, LeverageService leverage,
                       SimulationService simulator, EloQueryService elo,
                       @Value("${playoffs.path-simulations:5000}") int simulations,
                       @Value("${playoffs.path-risk-simulations:2000}") int riskSimulations) {
        if (simulations <= 0 || riskSimulations <= 0) throw new IllegalArgumentException("Path simulations must be positive");
        this.loader = loader; this.odds = odds; this.clinch = clinch; this.leverage = leverage;
        this.simulator = simulator; this.elo = elo; this.simulations = simulations; this.riskSimulations = riskSimulations;
    }

    @Cacheable(value = "playoffPath", sync = true)
    public Response path(Integer season, String abbr, String rules) {
        if (!"madden".equals(rules) && !"nfl".equals(rules))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rules must be madden or nfl");
        var state = loader.load(season);
        var team = state.teams().stream().filter(t -> t.abbr().equals(abbr)).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown team"));
        if (!capacity.tryAcquire()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Path analysis is busy");
        try {
            var baseline = odds.odds(state.season(), rules);
            var row = baseline.conferences().stream().flatMap(c -> c.teams().stream())
                    .filter(r -> r.team().abbrName().equals(abbr)).findFirst().orElseThrow();
            var marker = clinch.clinch(state.season(), rules).teams().stream()
                    .filter(r -> r.team().abbrName().equals(abbr)).findFirst().orElseThrow();
            var markers = new Markers(marker.playoffs(), marker.division(), marker.oneSeed());
            var probs = state.remainingGames().isEmpty() ? Map.<Integer, Double>of() : elo.homeWinProbabilities(state.season());
            long seed = SimulationService.mix(((long) state.season() << 32) ^ Objects.hashCode(state.nextWeek()) ^ rules.hashCode());
            var selected = rules.equals("madden") ? SimulationService.Rules.MADDEN : SimulationService.Rules.NFL;
            var forced = new HashMap<Integer, SimulationService.Outcome>();
            var constraints = new HashMap<ClinchAnalyzer.Matchup, SimulationService.Outcome>();
            for (var g : state.remainingGames()) if (involves(g, abbr)) {
                var outcome = g.home().equals(abbr) ? SimulationService.Outcome.HOME : SimulationService.Outcome.AWAY;
                forced.put(g.gameId(), outcome);
                constraints.put(new ClinchAnalyzer.Matchup(g.week(), g.home(), g.away()), outcome);
            }
            var winning = simulator.simulate(state, probs, forced, simulations, seed, selected, true);
            var winOdds = fractions(winning, abbr);
            boolean destiny = clinch.constrained(state, rules, constraints).markers().get(abbr)
                    .get(ClinchAnalyzer.Goal.PLAYOFFS) == ClinchAnalyzer.Marker.CLINCHED;
            var tracked = simulator.simulate(state, probs, Map.of(), Math.max(1, baseline.simulations()), seed, selected, false, abbr);
            int finalGames = row.wins() + row.losses() + row.ties() + forced.size();
            var needed = tracked.wins().entrySet().stream().filter(e -> e.getValue().simulations() / (double) Math.max(1, tracked.simulations()) >= .005)
                    .map(e -> {
                        var b = e.getValue(); double n = b.simulations(); int w = e.getKey();
                        String record = w + "-" + (finalGames - w - row.ties()) + (row.ties() == 0 ? "" : "-" + row.ties());
                        return new WinsNeeded(w, record, n / Math.max(1, tracked.simulations()), b.playoffs() / n, b.division() / n, b.oneSeed() / n);
                    }).toList();
            int divisionCount = (int) state.teams().stream().filter(t -> t.conference().equals(team.conference()))
                    .map(PlayoffSeeding.Team::division).distinct().count();
            Integer best = null;
            if (!"eliminated".equals(markers.playoffs())) for (int i = 0; i < 7; i++) {
                int position = i + 1;
                if ("eliminated".equals(markers.oneSeed()) && position == 1
                        || "eliminated".equals(markers.division()) && position <= divisionCount
                        || "clinched".equals(markers.division()) && position > divisionCount
                        || "clinched".equals(markers.oneSeed()) && position != 1) continue;
                if (row.seedOdds().get(i) > 0 || winning.teams().get(abbr).seedCounts().get(i) > 0) { best = position; break; }
            }
            var roots = new ArrayList<RootGame>();
            for (var g : leverage.matrix(state.season(), state.nextWeek(), rules).games()) {
                if (g.home().abbrName().equals(abbr) || g.away().abbrName().equals(abbr)) continue;
                var pair = g.teams().get(abbr);
                roots.add(root(g.gameId(), state.nextWeek(), g.home(), g.away(), pair.homeWin().playoffs() - pair.awayWin().playoffs()));
            }
            var conference = new HashSet<String>();
            state.teams().stream().filter(t -> t.conference().equals(team.conference())).forEach(t -> conference.add(t.abbr()));
            var risks = new ArrayList<RootGame>();
            var candidates = state.remainingGames().stream().filter(g -> !involves(g, abbr)
                            && (conference.contains(g.home()) || conference.contains(g.away())))
                    .sorted(Comparator.comparingInt(SeasonStateLoader.RemainingGame::week).thenComparingInt(SeasonStateLoader.RemainingGame::gameId))
                    .limit(40).toList();
            for (var g : candidates) {
                var picks = new HashMap<>(forced);
                picks.put(g.gameId(), SimulationService.Outcome.HOME);
                var home = simulator.simulate(state, probs, picks, riskSimulations, seed, selected, true);
                picks.put(g.gameId(), SimulationService.Outcome.AWAY);
                var away = simulator.simulate(state, probs, picks, riskSimulations, seed, selected, true);
                risks.add(root(g.gameId(), g.week(), state.identities().get(g.home()), state.identities().get(g.away()),
                        fractions(home, abbr).playoffs() - fractions(away, abbr).playoffs()));
            }
            return new Response(state.season(), rules, row.team(), row.wins(), row.losses(), row.ties(), forced.size(),
                    baseline.simulations(), row.odds(), markers, new WinOut(winOdds.playoffs(), winOdds.division(), winOdds.oneSeed(), destiny),
                    new Ceiling(best, row.seedOdds()), needed, top(risks), top(roots));
        } finally { capacity.release(); }
    }

    private static boolean involves(SeasonStateLoader.RemainingGame g, String abbr) { return g.home().equals(abbr) || g.away().equals(abbr); }
    private static OddsService.Odds fractions(SimulationService.Simulation result, String abbr) {
        var c = result.teams().get(abbr); double n = Math.max(1, result.simulations());
        return new OddsService.Odds(c.playoffs() / n, c.division() / n, c.oneSeed() / n);
    }
    private static RootGame root(int id, Integer week, EloService.Team home, EloService.Team away, double swing) {
        return new RootGame(id, week, home, away, swing >= 0 ? "home" : "away", swing);
    }
    private static List<RootGame> top(List<RootGame> games) {
        return games.stream().filter(g -> Math.abs(g.swing()) >= .02)
                .sorted(Comparator.comparingDouble((RootGame g) -> Math.abs(g.swing())).reversed().thenComparingInt(RootGame::gameId))
                .limit(5).toList();
    }
}
