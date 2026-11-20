package com.rzs.stats.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rzs.stats.model.dto.EloConfig;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.ForkJoinPool;
import java.util.function.Predicate;
import java.util.function.ToDoubleFunction;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfSystemProperty(named = "eloBacktest", matches = "true")
class EloBacktestReport {
    private static final double[][] AXES = {{10, 15, 20, 25, 30, 35, 40, 50, 60}, {300, 400, 500},
            {0, 7, 14, 21, 28, 35}, {0.67, 0.75, 0.78, 0.80, 0.82, 0.85, 0.88, 0.90, 0.95, 1}, {-25, -10, 0, 10, 25}};
    private static final double[] CUTS = {0.55, 0.60, 0.70, 0.80};
    private static final String[] TIERS = {"Toss-up", "Tilt", "Lean", "Likely", "Solid"};
    private static final EloConfig DEFAULTS = new EloConfig(1500, 25, 400, true, 21, 0, 0.90);
    private static final long SEED = 20261119L;
    private final EloService engine = new EloService();
    private Cycle archive;
    private Cycle current;

    record Cycle(String name, int offset, List<EloService.Game> games, List<Integer> seasons,
                 Map<Integer, Map<Integer, double[]>> totals) {}
    record Murphy(double reliability, double resolution, double uncertainty, double correction) {
        double exactReliability() { return reliability + correction; }
    }
    record Metrics(int n, double logLoss, double brier, double brierSkill, double accuracy, double ece,
                   double sharp, double auc, int marginN, double mae, double rmse, double eloPerPoint,
                   double rankChange, Murphy five, Murphy ten, int[] tierN, double[] predicted, double[] observed) {}
    record SeasonMetrics(double sd, double min, double max, double pointDiffCorrelation, double nextWinCorrelation) {}
    record Row(EloConfig config, Map<String, Metrics> windows, Map<Integer, SeasonMetrics> seasons,
               List<Metrics> folds, double[] weekLosses, int[] weekCounts, double[] foldRanks,
               double[] resolutionRanks) {}
    record Transition(String cycle, int from, int to, int carried) {}
    record Benchmark(String model, String window, Metrics metrics) {}
    record BoostRow(double boost, int weeks, Row row) {}

    @Test
    @EnabledIfSystemProperty(named = "eloBacktestPhase2", matches = "true")
    void writeBacktestReport() throws Exception {
        long started = System.nanoTime();
        Path output = Path.of("target/elo-backtest");
        Files.createDirectories(output);
        Path archivePath = Path.of("..").toAbsolutePath().normalize().resolve("archive/madden26/games.json");
        archive = Files.isRegularFile(archivePath) ? load(archivePath, true) : null;
        if (archive == null) System.out.println("Archive missing at " + archivePath + "; skipping archive folds and selection.");
        current = load(Path.of("src/test/resources/elo/games-snapshot.json"), false);
        List<EloConfig> configs = new ArrayList<>();
        for (double k : AXES[0]) for (double divisor : AXES[1]) for (double cap : AXES[2])
            for (double retention : AXES[3]) for (double hfa : AXES[4])
                configs.add(new EloConfig(1500, k, divisor, cap != 0, cap == 0 ? 21 : (int) cap, hfa, retention));
        List<Row> rows;
        try (var pool = new ForkJoinPool(4)) {
            rows = pool.submit(() -> configs.parallelStream().map(this::evaluate).toList()).get();
        }
        assertEquals(8100, rows.size());
        Row baseline = rows.stream().filter(r -> r.config().equals(DEFAULTS)).findFirst().orElseThrow();
        assertEquals(0.5761, baseline.windows().get("season104").logLoss(), 0.002);
        assertEquals(0.1982, baseline.windows().get("season104").brier(), 0.002);
        Row lowK = evaluate(new EloConfig(1500, 1, 400, true, 21, 0, 0.9));
        // The near-zero control deliberately bypasses EloConfig.valid()'s K>=1 constraint.
        Row zeroK = evaluate(new EloConfig(1500, 1e-9, 400, true, 21, 0, 0.9));
        assertEquals(Math.log(2), zeroK.windows().get("current_all").logLoss(), 1e-8);
        if (archive != null) assertEquals(Math.log(2), zeroK.windows().get("archive_oos").logLoss(), 1e-8);
        rank(rows);
        List<Row> eligible = archive == null ? List.of() : rows.stream().filter(this::eligible)
                .sorted(Comparator.comparingDouble(this::loss)).toList();
        List<Row> top = eligible.stream().limit(100).toList();
        boolean noise = top.size() == 100 && loss(top.getLast()) - loss(top.getFirst()) <= 0.003;
        Row candidate = top.isEmpty() ? null : noise ? top.stream().min(Comparator
                .comparingDouble((Row r) -> -r.windows().get("archive_oos").five().resolution())
                .thenComparingDouble(r -> r.windows().get("archive_oos").mae())
                .thenComparingDouble(this::rankSd).thenComparingDouble(this::roundness)).orElseThrow() : top.getFirst();
        List<Transition> transitions = new ArrayList<>();
        if (archive != null) transitions.addAll(transitions(archive, replay(archive, DEFAULTS)));
        transitions.addAll(transitions(current, replay(current, DEFAULTS)));
        assertEquals(archive == null ? 2 : 8, transitions.size());
        assertFalse(transitions.stream().anyMatch(t -> t.from() == 102 && t.to() == 103));
        List<Benchmark> benchmarks = benchmarks(baseline, "baseline");
        if (candidate != null) benchmarks.addAll(benchmarks(candidate, "candidate"));
        writeResults(output, rows);
        writeBenchmarks(output.resolve("benchmarks.csv"), benchmarks);
        String report = report(rows, eligible, baseline, candidate, lowK, zeroK, transitions, benchmarks, noise);
        assertEquals(transitions.size(), report.lines().filter(s -> s.startsWith("| Transition ")
                && s.length() > 13 && Character.isDigit(s.charAt(13))).count());
        assertFalse(report.contains("102→103") || report.contains("102->103"));
        double seconds = (System.nanoTime() - started) / 1e9;
        report += "\nRuntime: " + f(seconds) + " seconds; four-worker 8,100-config sweep.\n";
        Files.writeString(output.resolve("report.md"), report);
        Files.writeString(output.resolve("report.html"), html(report, candidate, rows));
        System.out.println("Elo backtest: 8100 configs, " + eligible.size() + " eligible; " + f(seconds)
                + " seconds; " + output.resolve("report.md").toAbsolutePath());
    }

    @Test
    void scoresTiesAndPreservesRawBrierAcrossFixedBands() {
        var home = new EloService.Team(1, "H", "H");
        var away = new EloService.Team(2, "A", "A");
        var timeline = engine.compute(List.of(
                new EloService.Game(1, null, 0, 1, 0, home, away, 0, 1),
                new EloService.Game(2, null, 0, 1, 1, home, away, 7, 7),
                new EloService.Game(3, null, 0, 1, 2, home, away, 1, 0)), List.of(), DEFAULTS);
        double[] forecasts = {0.2, 0.5, 0.8};
        var metrics = score(timeline, r -> true, r -> forecasts[r.game().week()], unavailableSlopes(1));
        assertEquals(0.08 / 3, metrics.brier(), 1e-12);
        assertEquals(2.5 / 3, metrics.accuracy(), 1e-12);
        assertEquals(17.0 / 18, metrics.auc(), 1e-12);
        double[] variable = {0.71, 0.5, 0.79};
        var binned = score(timeline, r -> true, r -> variable[r.game().week()], unavailableSlopes(1));
        assertEquals((0.71 * 0.71 + 0.21 * 0.21) / 3, binned.brier(), 1e-12);
        assertEquals(-0.0256, binned.five().correction(), 1e-12);
        assertEquals(0, binned.ten().correction(), 1e-12);
        assertEquals(13.0 / 18, binned.auc(), 1e-12);
        assertEquals(1, correlation(Map.of(1, 10.0, 2, 10.0, 3, 20.0), Map.of(1, 1.0, 2, 1.0, 3, 2.0)), 1e-12);
    }

    @Test
    void writeKBoostReport() throws Exception {
        long started = System.nanoTime();
        Path output = Path.of("target/elo-backtest");
        Files.createDirectories(output);
        Path archivePath = Path.of("..").toAbsolutePath().normalize().resolve("archive/madden26/games.json");
        archive = Files.isRegularFile(archivePath) ? load(archivePath, true) : null;
        if (archive == null) System.out.println("Archive missing: skipping Phase 3a archive folds, bootstrap and selection.");
        current = load(Path.of("src/test/resources/elo/games-snapshot.json"), false);
        EloConfig chosenConfig = new EloConfig(1500, 25, 400, true, 28, 0, 0.78);
        for (Cycle cycle : cycles()) for (EloConfig config : List.of(chosenConfig, DEFAULTS)) {
            var expected = engine.compute(cycle.games(), List.of(), config);
            for (int weeks : List.of(0, 3, 6, 9)) {
                var actual = replayBoost(cycle, config, 0, weeks);
                for (int i = 0; i < expected.games().size(); i++) {
                    assertEquals(expected.games().get(i).homeWinProbability(), actual.games().get(i).homeWinProbability(), 0);
                    assertEquals(expected.games().get(i).awayWinProbability(), actual.games().get(i).awayWinProbability(), 0);
                }
                assertEquals(expected.games(), actual.games());
                assertEquals(expected.history(), actual.history());
            }
        }
        Row defaults = evaluate(DEFAULTS, 0, 0, true);
        assertEquals(0.5761, defaults.windows().get("season104").logLoss(), 0.002);
        List<BoostRow> rows = new ArrayList<>();
        for (double k : new double[]{20, 25, 30}) for (double retention : new double[]{0.75, 0.78, 0.80, 0.85, 0.90})
            for (double boost : new double[]{0, 0.25, 0.5, 1, 1.5}) for (int weeks : boost == 0 ? new int[]{0} : new int[]{3, 6, 9}) {
                var config = new EloConfig(1500, k, 400, true, 28, 0, retention);
                rows.add(new BoostRow(boost, weeks, evaluate(config, boost, weeks, true)));
            }
        assertEquals(195, rows.size());
        assertEquals(39, rows.stream().filter(r -> r.row().config().offseasonRetention() == 0.90).count());
        assertEquals(195, rows.stream().map(r -> boostPrefix(r)).distinct().count());
        Row chosen = rows.stream().filter(r -> r.boost() == 0 && r.row().config().equals(chosenConfig)).findFirst().orElseThrow().row();
        if (archive != null) assertEquals(0.5846, loss(chosen), 0.001);
        assertEquals(0.5735, chosen.windows().get("season104").logLoss(), 0.001);
        assertEquals(0.6979, chosen.windows().get("season105_0_5").logLoss(), 0.001);
        Row zero = evaluate(new EloConfig(1500, 1e-9, 400, true, 28, 0, 0.78), 1.5, 9, true);
        if (archive != null) assertEquals(Math.log(2), loss(zero), 1e-8);
        assertEquals(Math.log(2), zero.windows().get("season104").logLoss(), 1e-8);
        assertEquals(Math.log(2), zero.windows().get("season105_0_5").logLoss(), 1e-8);
        rank(rows.stream().map(BoostRow::row).toList());
        BoostRow best = archive == null ? null : rows.stream().filter(r -> r.boost() > 0 && r.row().config().offseasonRetention() < 0.90)
                .min(Comparator.comparingDouble(r -> loss(r.row()))).orElseThrow();
        List<Transition> transitions = new ArrayList<>();
        for (Cycle cycle : cycles()) transitions.addAll(transitions(cycle, replayBoost(cycle, chosenConfig, 0, 0)));
        assertEquals(archive == null ? 2 : 8, transitions.size());
        assertFalse(transitions.stream().anyMatch(t -> t.from() == 102 && t.to() == 103));
        writeBoostCsv(output, rows);
        String report = boostReport(rows, defaults, chosen, best, zero, transitions);
        assertEquals(transitions.size(), report.lines().filter(line -> line.startsWith("| Transition ")
                && line.length() > 13 && Character.isDigit(line.charAt(13))).count());
        assertFalse(report.contains("102→103") || report.contains("102->103"));
        double seconds = (System.nanoTime() - started) / 1e9;
        report += "\nRuntime: " + f(seconds) + " seconds; sequential 195-config sweep.\n";
        Files.writeString(output.resolve("report-k-boost.md"), report);
        System.out.println("Phase 3a: 195 configurations; " + f(seconds) + " seconds; " + output.resolve("report-k-boost.md").toAbsolutePath());
    }

    private EloService.Timeline replayBoost(Cycle cycle, EloConfig config, double boost, int weeks) {
        var games = cycle.games().stream().sorted(Comparator.comparingInt(EloService.Game::season)
                .thenComparingInt(EloService.Game::stage).thenComparingInt(EloService.Game::week)
                .thenComparing(EloService.Game::id, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(EloService.Game::gameId, Comparator.nullsLast(Comparator.naturalOrder()))).toList();
        Map<Integer, EloService.Team> teams = new TreeMap<>();
        games.forEach(g -> { teams.put(g.home().teamId(), g.home()); teams.put(g.away().teamId(), g.away()); });
        Map<Integer, Double> ratings = new HashMap<>();
        teams.keySet().forEach(id -> ratings.put(id, config.initialRating()));
        Map<Integer, Integer> counts = new HashMap<>(), previousRanks = boostRanks(ratings);
        List<EloService.Snapshot> history = new ArrayList<>();
        List<EloService.Result> results = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        Integer previousSeason = null;
        int index = 0;
        while (index < games.size()) {
            var first = games.get(index);
            Map<Integer, Double> previousElos = new HashMap<>(ratings);
            boolean seasonStart = !Objects.equals(previousSeason, first.season());
            if (previousSeason != null && seasonStart) ratings.replaceAll((id, rating) -> engine.regress(rating, config));
            Map<Integer, Double> starts = new HashMap<>(ratings);
            double k = boost == 0 ? config.k() : config.k() * (1 + boost * Math.max(0, 1 - (double) first.week() / weeks));
            var weekly = new EloConfig(config.initialRating(), k, config.divisor(), config.movEnabled(), config.marginCap(),
                    config.homeFieldAdvantage(), config.offseasonRetention());
            while (index < games.size() && games.get(index).season() == first.season() && games.get(index).week() == first.week()) {
                var game = games.get(index++);
                String key = game.season() + ":" + (game.gameId() != null ? game.gameId() : game.id());
                if (!seen.add(key)) continue;
                int h = game.home().teamId(), a = game.away().teamId();
                var result = engine.play(game, ratings.get(h), ratings.get(a), weekly);
                assertEquals(engine.probability(ratings.get(h) + config.homeFieldAdvantage(), ratings.get(a), weekly), result.homeWinProbability(), 0);
                results.add(result);
                ratings.put(h, result.homePostgameElo()); ratings.put(a, result.awayPostgameElo());
                counts.merge(h, 1, Integer::sum); counts.merge(a, 1, Integer::sum);
            }
            Map<Integer, Integer> ranks = boostRanks(ratings);
            for (var team : teams.values()) {
                int id = team.teamId();
                history.add(new EloService.Snapshot(team, first.season(), first.week(), seasonStart, starts.get(id), ratings.get(id),
                        ratings.get(id) - starts.get(id), previousElos.get(id), ranks.get(id), previousRanks.get(id), counts.getOrDefault(id, 0)));
            }
            previousRanks = ranks;
            previousSeason = first.season();
        }
        var timeline = new EloService.Timeline(config, history, results);
        verifyReplay(cycle, timeline);
        return timeline;
    }

    private Map<Integer, Integer> boostRanks(Map<Integer, Double> ratings) {
        var ids = ratings.keySet().stream().sorted(Comparator.<Integer>comparingDouble(ratings::get).reversed().thenComparingInt(i -> i)).toList();
        Map<Integer, Integer> ranks = new HashMap<>();
        for (int i = 0; i < ids.size(); i++) ranks.put(ids.get(i), i + 1);
        return ranks;
    }

    private String boostPrefix(BoostRow r) {
        var c = r.row().config();
        return c.k() + "," + c.divisor() + "," + c.movEnabled() + "," + c.marginCap() + "," + c.offseasonRetention() + "," + c.homeFieldAdvantage() + "," + r.boost() + "," + r.weeks();
    }

    private void writeBoostCsv(Path output, List<BoostRow> rows) throws Exception {
        try (var results = Files.newBufferedWriter(output.resolve("results-k-boost.csv"));
             var folds = Files.newBufferedWriter(output.resolve("folds-k-boost.csv"))) {
            String prefix = "k,divisor,movEnabled,marginCap,retention,hfa,boost,N";
            List<String> header = new ArrayList<>(List.of(prefix, "reference_only", "mean_fold_log_loss", "fold_rank_mean", "fold_rank_sd", "fold_rank_worst", "resolution_rank5", "resolution_rank10", "bin_sensitive"));
            Row first = rows.getFirst().row();
            for (var w : first.windows().entrySet()) for (String metric : numbers(w.getValue()).keySet()) header.add(w.getKey() + "_" + metric);
            for (int season : first.seasons().keySet()) for (String metric : List.of("regular_sd", "regular_min", "regular_max", "regular_range", "spearman_pd", "spearman_next_win_pct")) header.add("season" + season + "_" + metric);
            results.write(String.join(",", header) + "\n");
            folds.write(prefix + ",train_start,train_end,test_season,config_rank," + String.join(",", numbers(first.windows().get("season104")).keySet()) + "\n");
            for (BoostRow r : rows) {
                Row row = r.row();
                List<String> cells = new ArrayList<>(List.of(boostPrefix(r), Boolean.toString(row.config().offseasonRetention() == 0.90), f(loss(row)),
                        f(Arrays.stream(row.foldRanks()).average().orElse(Double.NaN)), f(rankSd(row)), f(Arrays.stream(row.foldRanks()).max().orElse(Double.NaN)),
                        archive == null ? "NaN" : f(row.resolutionRanks()[0]), archive == null ? "NaN" : f(row.resolutionRanks()[1]), Boolean.toString(row.resolutionRanks()[0] != row.resolutionRanks()[1])));
                for (var m : row.windows().values()) for (double v : numbers(m).values()) cells.add(f(v));
                for (var m : row.seasons().values()) for (double v : new double[]{m.sd(), m.min(), m.max(), m.max() - m.min(), m.pointDiffCorrelation(), m.nextWinCorrelation()}) cells.add(f(v));
                results.write(String.join(",", cells) + "\n");
                for (int i = 0; i < row.folds().size(); i++) folds.write(boostPrefix(r) + ",96," + (96 + i) + "," + (97 + i) + "," + f(row.foldRanks()[i]) + ","
                        + numbers(row.folds().get(i)).values().stream().map(this::f).collect(Collectors.joining(",")) + "\n");
            }
        }
    }

    private int foldWins(Row candidate, Row baseline) {
        int wins = 0;
        for (int i = 0; i < candidate.folds().size(); i++) if (candidate.folds().get(i).logLoss() < baseline.folds().get(i).logLoss()) wins++;
        return wins;
    }

    private String boostName(BoostRow r) { return config(r.row()) + ", boost=" + r.boost() + ", N=" + (r.boost() == 0 ? "ignored" : r.weeks()); }

    private String boostReport(List<BoostRow> rows, Row defaults, Row chosen, BoostRow best, Row zero, List<Transition> transitions) {
        StringBuilder out = new StringBuilder("# Phase 3a — early-season K boost\n\n");
        out.append("195 deduplicated configurations: 3 base K × 5 retentions × (1 no-boost control + 4 boosts × 3 durations). 156 selectable rows; 39 retention-0.90 reference-only rows. Divisor 400, MOV on cap 28, HFA 0. No production changes. Phase 2 outputs are preserved; rerun their generator explicitly with -DeloBacktestPhase2=true in addition to -DeloBacktest=true.\n\n")
                .append("## Methods and choices\n\n")
                .append("- K(w) = K × (1 + boost × max(0, 1 − w/N)), applied at every season start, including both burn-in seasons. Boost-0 rows canonicalize N to 0 (ignored), avoiding duplicate controls. The harness copies production ordering, weekly grouping, dedupe, counts, snapshots, tied-rank ordering and offseason regression, while delegating all game arithmetic to EloService.play/probability/regress.\n")
                .append("- Cycles replay independently from 1500, using normalized archive identities and unchanged current-cycle IDs. Archive seasons 96 and current season 103 are burn-in/training only: neither is scored or included in reported seasonal spread. Scored games are archive folds 97–102 (1,632 games), season 104 all games (285), and season 105 weeks 0–5 (94). Current-cycle week buckets use only these confirmation games.\n")
                .append("- Best boost = minimum mean archive-fold log loss among nonzero boosts with retention 0.75/0.78/0.80/0.85. No guardrail prefilter, current-cycle selection, Phase 2 noise tie-break or re-selection is applied. References are reported but never selectable. Exact ties retain grid order.\n")
                .append("- Guardrail ambiguity is resolved before selection: majority spread means at least four of the six scored archive seasons (97–102); favorite ≥70% share and mean weekly rank movement also use archive OOS games only. Current spread is separately reported. The 'about 0.3 places' movement limit is evaluated as ≤0.300000 against the chosen no-boost setting.\n")
                .append("- Reuses Phase 2 scoring: tie y=0.5, p clamp [1e-9,1−1e-9], five TIERS and ten equal-width favorite bands, Brier/AUC/calibration, population rating SD, and mean |rank−prevRank| over scored team-week snapshots. Margin = fitted beta × pregame Elo gap, with beta fit through the origin on expanding prior seasons only; burn-in trains the first fold. Elo/point outside 10–60 is flagged, never a failure.\n")
                .append("- Fixed-band Murphy terms require a within-bin correction for raw Brier. CSV includes grouped reliability/resolution/uncertainty, the independently calculated forecast-variance/covariance correction, and exact_reliability = grouped reliability + correction. Both corrected identities are asserted against raw Brier within 1e-9.\n")
                .append("- Both paired bootstraps use 2,000 archive season/week block resamples with replacement, seed 20261119; summed game loss divided by summed game count, percentile 95% endpoints at sorted indices 49/1949. Negative difference favors the first named config. CIs do not correct for selection or dependence across weeks.\n\n")
                .append("## Controls and regression assertions\n\nBoost 0 reproduces production compute pregame probabilities exactly for every game in both cycles, for the chosen setting and current defaults, at N=0/3/6/9. Full Result and Snapshot lists also match exactly. Every grid config starts every season-103 week-0 team at exactly 1500. All replay and control assertions passed.\n\n")
                .append("| Setting | Archive mean LL | Season 104 LL | Season 105 weeks 0–5 LL |\n|---|---:|---:|---:|\n");
        boostSummary(out, "Current defaults (cap21, retention0.90)", defaults);
        boostSummary(out, "Chosen no boost (cap28, retention0.78)", chosen);
        boostSummary(out, "Near-zero K with boost1.5, N9", zero);
        out.append("\nDefaults season104 LL expected 0.5761 ±0.002. Chosen archive/104/105 expected 0.5846 / 0.5735 / 0.6979, each ±0.001. Near-zero K directly bypasses K≥1 validation and must approach log(2)=0.693147181 within 1e-8.\n\n");
        if (archive == null) out.append("Archive missing: folds, archive assertions, selection, bootstrap and the four-condition decision are unavailable. No boost can be recommended from this partial run.\n\n");
        else {
            out.append("## Chosen no-boost setting versus current defaults\n\n");
            bootstrapSummary(out, "Chosen no boost − defaults", chosen, defaults);
            out.append("\n## Best boost, selected on archive only\n\n").append(boostName(best)).append(".\n\n");
            out.append("| Setting | Archive mean LL | Season 104 LL | Season 105 weeks 0–5 LL |\n|---|---:|---:|---:|\n");
            boostSummary(out, "Best selectable boost", best.row());
            var bestReference = rows.stream().filter(r -> r.row().config().offseasonRetention() == 0.90 && r.boost() > 0)
                    .min(Comparator.comparingDouble(r -> loss(r.row()))).orElseThrow();
            out.append("\nBest boosted reference (never selectable): ").append(boostName(bestReference)).append("; archive mean LL ").append(f(loss(bestReference.row()))).append(".\n\n");
            double[] ci = bootstrap(best.row(), chosen);
            bootstrapSummary(out, "Best boost − chosen no boost", best.row(), chosen);
            Metrics boosted = best.row().windows().get("archive_oos"), control = chosen.windows().get("archive_oos");
            double earlyDelta = best.row().windows().get("archive_weeks0_5").logLoss() - chosen.windows().get("archive_weeks0_5").logLoss();
            double delta104 = best.row().windows().get("season104").logLoss() - chosen.windows().get("season104").logLoss();
            double delta105 = best.row().windows().get("season105_0_5").logLoss() - chosen.windows().get("season105_0_5").logLoss();
            long spreadSeasons = best.row().seasons().entrySet().stream().filter(e -> e.getKey() >= 97 && e.getKey() <= 102 && e.getValue().sd() >= 120).count();
            double movementDelta = boosted.rankChange() - control.rankChange();
            boolean c1 = loss(best.row()) < loss(chosen) && (ci[1] < 0 || foldWins(best.row(), chosen) >= 5);
            boolean c2 = earlyDelta <= -0.01;
            boolean c3 = delta104 <= 0 && delta105 <= 0;
            boolean c4 = spreadSeasons >= 4 && boosted.sharp() >= 0.30 && movementDelta <= 0.30;
            out.append("\n## Decision rule — all four conditions required\n\n| Condition | Result | Evidence |\n|---|---|---|\n")
                    .append("| 1. Archive mean LL beats chosen no boost, with paired CI excluding 0 or gains in ≥5/6 folds | ").append(c1 ? "PASS" : "FAIL")
                    .append(" | LL delta ").append(f(loss(best.row()) - loss(chosen))).append("; 95% CI [").append(f(ci[0])).append(", ").append(f(ci[1]))
                    .append("]; fold wins ").append(foldWins(best.row(), chosen)).append("/6 |\n")
                    .append("| 2. Archive weeks 0–5 LL improves by ≥0.01 | ").append(c2 ? "PASS" : "FAIL").append(" | Delta ").append(f(earlyDelta)).append(" |\n")
                    .append("| 3. Season 104 AND season 105 weeks 0–5 no worse than chosen no boost | ").append(c3 ? "PASS" : "FAIL")
                    .append(" | 104 delta ").append(f(delta104)).append("; 105 delta ").append(f(delta105)).append(" |\n")
                    .append("| 4. SD≥120 in majority, ≥70% share≥0.30, weekly rank movement rise≤0.3 | ").append(c4 ? "PASS" : "FAIL")
                    .append(" | SD guard ").append(spreadSeasons).append("/6 seasons; share ").append(f(boosted.sharp())).append("; movement ")
                    .append(f(control.rankChange())).append(" → ").append(f(boosted.rankChange())).append(" (delta ").append(f(movementDelta)).append(") |\n\n")
                    .append(c1 && c2 && c3 && c4 ? "BOOST PASSES all four conditions: qualifies for review before separately scoped Phase 3b adoption."
                            : "BOOST DROPPED: at least one required condition fails. Per the plan, keep the chosen no-boost setting for Phase 3b adoption after review.")
                    .append(" No production changes were made.\n\n## Top 20 selectable boosts by archive LL\n\n| Config | Archive mean LL | Archive early LL | Season104 LL | Season105 early LL |\n|---|---:|---:|---:|---:|\n");
            for (BoostRow r : rows.stream().filter(r -> r.boost() > 0 && r.row().config().offseasonRetention() < 0.90)
                    .sorted(Comparator.comparingDouble(r -> loss(r.row()))).limit(20).toList()) out.append("| ").append(boostName(r)).append(" | ").append(f(loss(r.row()))).append(" | ")
                    .append(f(r.row().windows().get("archive_weeks0_5").logLoss())).append(" | ").append(f(r.row().windows().get("season104").logLoss()))
                    .append(" | ").append(f(r.row().windows().get("season105_0_5").logLoss())).append(" |\n");
        }
        List<Row> finalists = best == null ? List.of(defaults, chosen) : List.of(defaults, chosen, best.row());
        List<String> labels = best == null ? List.of("Defaults", "Chosen no boost") : List.of("Defaults", "Chosen no boost", "Best boost");
        out.append("\n## Per-fold comparison\n\n| Test season | Defaults LL | Chosen LL | Best boost LL | Chosen − defaults | Boost − chosen |\n|---:|---:|---:|---:|---:|---:|\n");
        for (int i = 0; i < chosen.folds().size(); i++) {
            double d = defaults.folds().get(i).logLoss(), c = chosen.folds().get(i).logLoss(), b = best.row().folds().get(i).logLoss();
            out.append("| ").append(97 + i).append(" | ").append(f(d)).append(" | ").append(f(c)).append(" | ").append(f(b))
                    .append(" | ").append(f(c - d)).append(" | ").append(f(b - c)).append(" |\n");
        }
        out.append("\n## Week buckets and current-cycle confirmation\n\n| Setting | Window | n | LL | Brier | Margin MAE | Margin RMSE | Elo/point | ECE | ≥70% share | Weekly rank movement |\n|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n");
        for (int i = 0; i < finalists.size(); i++) for (var entry : finalists.get(i).windows().entrySet()) {
            if (entry.getKey().startsWith("archive_early")) continue;
            var m = entry.getValue();
            out.append("| ").append(labels.get(i)).append(" | ").append(entry.getKey()).append(" | ").append(m.n()).append(" | ").append(f(m.logLoss()))
                    .append(" | ").append(f(m.brier())).append(" | ").append(f(m.mae())).append(" | ").append(f(m.rmse())).append(" | ").append(f(m.eloPerPoint()))
                    .append(" | ").append(f(m.ece())).append(" | ").append(f(m.sharp())).append(" | ").append(f(m.rankChange())).append(" |\n");
        }
        out.append("\n## Murphy decomposition\n\n| Setting | Window | Bins | Raw Brier | Grouped reliability | Resolution | Uncertainty | Correction | Exact reliability |\n|---|---|---:|---:|---:|---:|---:|---:|---:|\n");
        for (int i = 0; i < finalists.size(); i++) for (String w : archive == null ? List.of("season104", "season105_0_5") : List.of("archive_oos", "season104", "season105_0_5")) {
            var m = finalists.get(i).windows().get(w);
            for (int bins : List.of(5, 10)) {
                var d = bins == 5 ? m.five() : m.ten();
                out.append("| ").append(labels.get(i)).append(" | ").append(w).append(" | ").append(bins).append(" | ").append(f(m.brier()))
                        .append(" | ").append(f(d.reliability())).append(" | ").append(f(d.resolution())).append(" | ").append(f(d.uncertainty()))
                        .append(" | ").append(f(d.correction())).append(" | ").append(f(d.exactReliability())).append(" |\n");
            }
        }
        out.append("\n## End-of-regular-season spread\n\nPartial season 105 uses the latest available regular-season snapshot. Burn-in seasons are omitted.\n\n| Setting | Season | SD | Min | Max | Range |\n|---|---:|---:|---:|---:|---:|\n");
        for (int i = 0; i < finalists.size(); i++) for (var entry : finalists.get(i).seasons().entrySet()) {
            var m = entry.getValue();
            out.append("| ").append(labels.get(i)).append(" | ").append(entry.getKey()).append(" | ").append(f(m.sd())).append(" | ").append(f(m.min()))
                    .append(" | ").append(f(m.max())).append(" | ").append(f(m.max() - m.min())).append(" |\n");
        }
        out.append("\nMargin slope flags (outside 10–60 Elo/point, non-failing): ").append(rows.stream().flatMap(r -> r.row().folds().stream())
                .filter(m -> !Double.isFinite(m.eloPerPoint()) || m.eloPerPoint() < 10 || m.eloPerPoint() > 60).count()).append(" archive config-folds.\n\n")
                .append("## Retention transitions\n\nExactly ").append(transitions.size()).append(" within-cycle boundaries; chosen no-boost continuity shown.\n\n| Transition | Cycle | Non-1500 teams carried |\n|---|---|---:|\n");
        for (var t : transitions) out.append("| Transition ").append(t.from()).append("→").append(t.to()).append(" | ").append(t.cycle()).append(" | ").append(t.carried()).append(" |\n");
        return out.append("\nAll 195 configs and instruments: results-k-boost.csv. All config/fold metrics and ranks: folds-k-boost.csv. Controls outside the grid are reported here only.\n").toString();
    }

    private void boostSummary(StringBuilder out, String label, Row row) {
        out.append("| ").append(label).append(" | ").append(f(loss(row))).append(" | ").append(f(row.windows().get("season104").logLoss()))
                .append(" | ").append(f(row.windows().get("season105_0_5").logLoss())).append(" |\n");
    }

    private void bootstrapSummary(StringBuilder out, String label, Row candidate, Row baseline) {
        double[] ci = bootstrap(candidate, baseline);
        out.append(label).append(": mean archive LL difference ").append(f(loss(candidate) - loss(baseline))).append("; paired week-block 95% CI [")
                .append(f(ci[0])).append(", ").append(f(ci[1])).append("]; per-fold wins ").append(foldWins(candidate, baseline)).append("/6.\n");
    }

    private Cycle load(Path path, boolean historical) throws Exception {
        JsonNode data = new ObjectMapper().readTree(path.toFile());
        assertTrue(data.isArray(), "Fixture must be an array: " + path);
        Map<String, EloService.Team> teams = new TreeMap<>();
        if (historical) {
            SortedSet<String> abbreviations = new TreeSet<>();
            for (JsonNode g : data) for (String side : List.of("homeTeam", "awayTeam"))
                abbreviations.add(normalize(g.path(side).path("abbrName").asText()));
            for (String abbr : abbreviations) teams.put(abbr, new EloService.Team(teams.size() + 1, abbr, abbr));
            assertEquals(32, teams.size());
        }
        List<EloService.Game> games = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (JsonNode g : data) {
            if (historical && integer(g, "status") < 2) continue;
            int season = integer(g, historical ? "seasonIndex" : "season"), week = integer(g, historical ? "weekIndex" : "week");
            int id = integer(g, "gameId"), homeScore = integer(g, "homeScore"), awayScore = integer(g, "awayScore");
            EloService.Team home, away;
            if (historical) {
                assertEquals(1, integer(g, "stageIndex"));
                assertTrue(week < 18, "Archive must contain regular season only");
                home = teams.get(normalize(g.path("homeTeam").path("abbrName").asText()));
                away = teams.get(normalize(g.path("awayTeam").path("abbrName").asText()));
            } else {
                home = new EloService.Team(integer(g, "homeTeamId"), g.path("homeAbbr").asText(), g.path("homeAbbr").asText());
                away = new EloService.Team(integer(g, "awayTeamId"), g.path("awayAbbr").asText(), g.path("awayAbbr").asText());
            }
            assertNotNull(home);
            assertNotNull(away);
            assertFalse(home.abbrName().isBlank() || away.abbrName().isBlank());
            assertNotEquals(home.teamId(), away.teamId());
            assertTrue(season >= 0 && week >= 0 && homeScore >= 0 && awayScore >= 0);
            assertTrue(seen.add(season + ":" + id), "Duplicate fixture game");
            games.add(new EloService.Game(id, null, season, 1, week, home, away, homeScore, awayScore));
        }
        games.sort(Comparator.comparingInt(EloService.Game::season).thenComparingInt(EloService.Game::week).thenComparingInt(EloService.Game::gameId));
        List<Integer> seasons = games.stream().map(EloService.Game::season).distinct().toList();
        assertEquals(historical ? List.of(0, 1, 2, 3, 4, 5, 6) : List.of(0, 1, 2), seasons);
        Map<Integer, Map<Integer, double[]>> totals = new TreeMap<>();
        for (var g : games) {
            var season = totals.computeIfAbsent(g.season(), s -> new TreeMap<>());
            double[] h = season.computeIfAbsent(g.home().teamId(), t -> new double[4]);
            double[] a = season.computeIfAbsent(g.away().teamId(), t -> new double[4]);
            h[0] += g.homeScore(); h[1] += g.awayScore(); h[2]++; h[3] += actual(g);
            a[0] += g.awayScore(); a[1] += g.homeScore(); a[2]++; a[3] += 1 - actual(g);
        }
        if (historical) {
            assertEquals(1904, games.size());
            assertEquals(1, games.stream().filter(g -> actual(g) == 0.5).count());
            for (int season : seasons) {
                assertEquals(32, totals.get(season).size());
                assertEquals(272, games.stream().filter(g -> g.season() == season).count());
            }
        }
        return new Cycle(historical ? "archive" : "current", historical ? 96 : 103, games, seasons, totals);
    }

    private int integer(JsonNode node, String field) {
        assertTrue(node.path(field).isIntegralNumber() && node.path(field).canConvertToInt(), "Invalid integer " + field);
        return node.path(field).intValue();
    }

    private String normalize(String abbr) { return abbr.equals("ARI") ? "AZ" : abbr; }

    private EloService.Timeline replay(Cycle cycle, EloConfig config) {
        var timeline = engine.compute(cycle.games(), List.of(), config);
        verifyReplay(cycle, timeline);
        return timeline;
    }

    private void verifyReplay(Cycle cycle, EloService.Timeline timeline) {
        assertEquals(cycle.games().size(), timeline.games().size());
        var starts = timeline.history().stream().filter(s -> s.season() == 0 && s.week() == 0).toList();
        assertEquals(32, starts.size());
        starts.forEach(s -> assertEquals(1500, s.startElo(), 0));
        var firstGames = timeline.games().stream().filter(r -> r.game().season() == 0 && r.game().week() == 0).toList();
        assertEquals(32, firstGames.stream().flatMap(r -> java.util.stream.Stream.of(r.game().home().teamId(), r.game().away().teamId())).distinct().count());
        for (var r : firstGames) {
            assertEquals(1500, r.homePregameElo(), 0);
            assertEquals(1500, r.awayPregameElo(), 0);
        }
        if (cycle == archive) transitions(cycle, timeline);
    }

    private List<Transition> transitions(Cycle cycle, EloService.Timeline timeline) {
        List<Transition> transitions = new ArrayList<>();
        for (int season : cycle.seasons()) {
            if (season == 0) continue;
            var previous = endpoint(timeline, season - 1, false);
            var starts = timeline.history().stream().filter(s -> s.season() == season && s.seasonStart()).toList();
            assertEquals(32, starts.size());
            int carried = 0;
            for (var s : starts) {
                assertEquals(previous.get(s.team().teamId()), s.prevElo(), 1e-9);
                assertEquals(engine.regress(s.prevElo(), timeline.config()), s.startElo(), 1e-9);
                if (s.startElo() != 1500 && s.prevElo() != 1500) carried++;
            }
            if (cycle == archive) assertEquals(32, carried, "Archive identities must carry all teams across seasons");
            transitions.add(new Transition(cycle.name(), season - 1 + cycle.offset(), season + cycle.offset(), carried));
        }
        return transitions;
    }

    private Row evaluate(EloConfig config) {
        return evaluate(config, 0, 0, false);
    }

    private Row evaluate(EloConfig config, double boost, int boostWeeks, boolean phase3) {
        Map<String, Metrics> windows = new LinkedHashMap<>();
        Map<Integer, SeasonMetrics> seasons = new TreeMap<>();
        List<Metrics> folds = new ArrayList<>();
        double[] weekLosses = new double[0];
        int[] weekCounts = new int[0];
        if (archive != null) {
            var timeline = phase3 ? replayBoost(archive, config, boost, boostWeeks) : replay(archive, config);
            double[] slopes = slopes(timeline);
            for (int season = 1; season <= 6; season++) {
                int testSeason = season;
                folds.add(score(timeline, r -> r.game().season() == testSeason, EloService.Result::homeWinProbability, slopes));
                windows.put("archive_early" + (season + 96), score(timeline, r -> r.game().season() == testSeason && r.game().week() <= 5, EloService.Result::homeWinProbability, slopes));
            }
            windows.put("archive_oos", score(timeline, r -> r.game().season() >= 1, EloService.Result::homeWinProbability, slopes));
            if (!phase3) windows.put("archive_all", score(timeline, r -> true, EloService.Result::homeWinProbability, slopes));
            weekBuckets(windows, timeline, "archive", r -> r.game().season() >= 1, slopes);
            seasonal(seasons, archive, timeline);
            Map<String, List<EloService.Result>> weeks = timeline.games().stream().filter(r -> r.game().season() >= 1)
                    .collect(Collectors.groupingBy(r -> r.game().season() + ":" + r.game().week(), LinkedHashMap::new, Collectors.toList()));
            weekLosses = weeks.values().stream().mapToDouble(v -> v.stream().mapToDouble(r -> logLoss(r.homeWinProbability(), actual(r.game()))).sum()).toArray();
            weekCounts = weeks.values().stream().mapToInt(List::size).toArray();
        }
        var timeline = phase3 ? replayBoost(current, config, boost, boostWeeks) : replay(current, config);
        double[] slopes = slopes(timeline);
        if (!phase3) windows.put("current_all", score(timeline, r -> true, EloService.Result::homeWinProbability, slopes));
        if (!phase3) windows.put("tune", score(timeline, r -> r.game().season() == 0 && r.game().week() >= 4 || r.game().season() == 1, EloService.Result::homeWinProbability, slopes));
        windows.put("season104", score(timeline, r -> r.game().season() == 1, EloService.Result::homeWinProbability, slopes));
        windows.put("season105_0_5", score(timeline, r -> r.game().season() == 2 && r.game().week() <= 5, EloService.Result::homeWinProbability, slopes));
        windows.put("early104", score(timeline, r -> r.game().season() == 1 && r.game().week() <= 5, EloService.Result::homeWinProbability, slopes));
        windows.put("early105", windows.get("season105_0_5"));
        if (!phase3) windows.put("season105_all", score(timeline, r -> r.game().season() == 2, EloService.Result::homeWinProbability, slopes));
        weekBuckets(windows, timeline, "current", r -> r.game().season() >= 1 && (!phase3 || r.game().season() == 1 || r.game().week() <= 5), slopes);
        seasonal(seasons, current, timeline);
        if (phase3) { seasons.remove(96); seasons.remove(103); }
        return new Row(config, windows, seasons, folds, weekLosses, weekCounts, new double[folds.size()], new double[2]);
    }

    private void weekBuckets(Map<String, Metrics> windows, EloService.Timeline timeline, String prefix,
                             Predicate<EloService.Result> filter, double[] slopes) {
        for (int bucket = 0; bucket < 3; bucket++) {
            int b = bucket;
            windows.put(prefix + "_weeks" + List.of("0_5", "6_11", "12plus").get(b), score(timeline,
                    r -> filter.test(r) && Math.min(2, r.game().week() / 6) == b, EloService.Result::homeWinProbability, slopes));
        }
    }

    private double[] slopes(EloService.Timeline timeline) {
        int last = timeline.games().stream().mapToInt(r -> r.game().season()).max().orElseThrow();
        double[] slopes = new double[last + 1];
        Arrays.fill(slopes, Double.NaN);
        double xx = 0, xy = 0;
        for (int season = 0; season < last; season++) {
            for (var r : timeline.games()) if (r.game().season() == season) {
                double x = r.homePregameElo() - r.awayPregameElo() + timeline.config().homeFieldAdvantage();
                xx += x * x;
                xy += x * (r.game().homeScore() - r.game().awayScore());
            }
            slopes[season + 1] = xx == 0 ? Double.NaN : xy / xx;
        }
        return slopes;
    }

    private double actual(EloService.Game g) { return g.homeScore() > g.awayScore() ? 1 : g.homeScore() == g.awayScore() ? 0.5 : 0; }
    private double logistic(double x) { return 1 / (1 + Math.exp(-x)); }
    private double logLoss(double p, double y) {
        p = Math.clamp(p, 1e-9, 1 - 1e-9);
        return -y * Math.log(p) - (1 - y) * Math.log1p(-p);
    }

    private Metrics score(EloService.Timeline timeline, Predicate<EloService.Result> filter,
                          ToDoubleFunction<EloService.Result> probability, double[] slopes) {
        var selected = timeline.games().stream().filter(filter).toList();
        assertFalse(selected.isEmpty());
        int n = selected.size(), marginN = 0;
        double loss = 0, brier = 0, coin = 0, picks = 0, sharp = 0, mae = 0, mse = 0, slopeSum = 0;
        double[][] five = new double[5][6], ten = new double[10][6];
        double[] probabilities = new double[n], outcomes = new double[n];
        for (int index = 0; index < n; index++) {
            var r = selected.get(index);
            double p = probability.applyAsDouble(r), y = actual(r.game());
            assertTrue(Double.isFinite(p) && p >= 0 && p <= 1);
            probabilities[index] = p;
            outcomes[index] = y;
            double favorite = Math.max(p, 1 - p), won = p >= 0.5 ? y : 1 - y;
            int tier = 0;
            while (tier < CUTS.length && favorite >= CUTS[tier]) tier++;
            addBin(five[tier], favorite, won);
            addBin(ten[Math.min(9, (int) ((favorite - 0.5) * 20))], favorite, won);
            loss += logLoss(p, y);
            brier += (p - y) * (p - y);
            coin += (0.5 - y) * (0.5 - y);
            picks += p == 0.5 || y == 0.5 ? 0.5 : (p > 0.5) == (y > 0.5) ? 1 : 0;
            if (favorite >= 0.70) sharp++;
            double slope = slopes[r.game().season()];
            if (Double.isFinite(slope)) {
                double prediction = slope * (r.homePregameElo() - r.awayPregameElo() + timeline.config().homeFieldAdvantage());
                double error = prediction - (r.game().homeScore() - r.game().awayScore());
                mae += Math.abs(error); mse += error * error; slopeSum += slope; marginN++;
            }
        }
        Murphy m5 = murphy(five, n), m10 = murphy(ten, n);
        // Fixed-width bins need the within-bin forecast/covariance correction for the raw-score identity.
        assertEquals(brier / n, m5.exactReliability() - m5.resolution() + m5.uncertainty(), 1e-9);
        assertEquals(brier / n, m10.exactReliability() - m10.resolution() + m10.uncertainty(), 1e-9);
        int[] counts = new int[5];
        double[] predicted = new double[5], observed = new double[5];
        double ece = 0;
        for (int i = 0; i < 5; i++) {
            counts[i] = (int) five[i][0];
            predicted[i] = counts[i] == 0 ? Double.NaN : five[i][1] / counts[i];
            observed[i] = counts[i] == 0 ? Double.NaN : five[i][2] / counts[i];
            ece += Math.abs(five[i][1] - five[i][2]) / n;
        }
        Set<String> weeks = selected.stream().map(r -> r.game().season() + ":" + r.game().week()).collect(Collectors.toSet());
        double rankChange = timeline.history().stream().filter(s -> weeks.contains(s.season() + ":" + s.week()))
                .mapToInt(s -> Math.abs(s.rank() - s.prevRank())).average().orElse(Double.NaN);
        return new Metrics(n, loss / n, brier / n, coin == 0 ? Double.NaN : 1 - brier / coin, picks / n, ece, sharp / n,
                auc(probabilities, outcomes), marginN, marginN == 0 ? Double.NaN : mae / marginN,
                marginN == 0 ? Double.NaN : Math.sqrt(mse / marginN), slopeSum == 0 ? Double.NaN : marginN / slopeSum,
                rankChange, m5, m10, counts, predicted, observed);
    }

    private void addBin(double[] bin, double p, double y) {
        bin[0]++; bin[1] += p; bin[2] += y; bin[3] += y * y; bin[4] += p * p; bin[5] += p * y;
    }

    private Murphy murphy(double[][] bins, int n) {
        double mean = Arrays.stream(bins).mapToDouble(b -> b[2]).sum() / n;
        double reliability = 0, resolution = 0, uncertainty = 0, correction = 0;
        for (var bin : bins) if (bin[0] > 0) {
            double p = bin[1] / bin[0], y = bin[2] / bin[0], weight = bin[0] / n;
            reliability += weight * (p - y) * (p - y);
            resolution += weight * (y - mean) * (y - mean);
            uncertainty += (bin[3] - 2 * mean * bin[2] + bin[0] * mean * mean) / n;
            correction += (bin[4] - bin[1] * bin[1] / bin[0]
                    - 2 * (bin[5] - bin[1] * bin[2] / bin[0])) / n;
        }
        return new Murphy(reliability, resolution, uncertainty, correction);
    }

    private double auc(double[] p, double[] y) {
        Integer[] order = new Integer[p.length];
        for (int i = 0; i < p.length; i++) order[i] = i;
        Arrays.sort(order, Comparator.comparingDouble(i -> p[i]));
        double numerator = 0, positives = 0, negatives = 0;
        for (int i = 0; i < order.length;) {
            int end = i;
            double groupPositive = 0, groupNegative = 0;
            while (end < order.length && Double.compare(p[order[i]], p[order[end]]) == 0) {
                groupPositive += y[order[end]];
                groupNegative += 1 - y[order[end++]];
            }
            numerator += groupPositive * (negatives + groupNegative / 2);
            positives += groupPositive; negatives += groupNegative; i = end;
        }
        return positives == 0 || negatives == 0 ? Double.NaN : numerator / (positives * negatives);
    }

    private void seasonal(Map<Integer, SeasonMetrics> out, Cycle cycle, EloService.Timeline timeline) {
        for (int season : cycle.seasons()) {
            var regular = endpoint(timeline, season, true);
            double mean = regular.values().stream().mapToDouble(Double::doubleValue).average().orElseThrow();
            double sd = Math.sqrt(regular.values().stream().mapToDouble(v -> (v - mean) * (v - mean)).average().orElseThrow());
            Map<Integer, double[]> totals = new HashMap<>();
            for (var g : cycle.games()) if (g.season() == season && g.week() < 18) {
                double[] h = totals.computeIfAbsent(g.home().teamId(), id -> new double[2]);
                double[] a = totals.computeIfAbsent(g.away().teamId(), id -> new double[2]);
                h[0] += g.homeScore() - g.awayScore(); a[0] += g.awayScore() - g.homeScore(); h[1]++; a[1]++;
            }
            var pd = totals.entrySet().stream().collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue()[0] / e.getValue()[1]));
            var next = cycle.totals().getOrDefault(season + 1, Map.of()).entrySet().stream()
                    .collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue()[3] / e.getValue()[2]));
            out.put(season + cycle.offset(), new SeasonMetrics(sd, Collections.min(regular.values()), Collections.max(regular.values()),
                    correlation(regular, pd), correlation(endpoint(timeline, season, false), next)));
        }
    }

    private Map<Integer, Double> endpoint(EloService.Timeline timeline, int season, boolean regular) {
        int week = timeline.history().stream().filter(s -> s.season() == season && (!regular || s.week() < 18))
                .mapToInt(EloService.Snapshot::week).max().orElseThrow();
        return timeline.history().stream().filter(s -> s.season() == season && s.week() == week)
                .collect(Collectors.toMap(s -> s.team().teamId(), EloService.Snapshot::endElo));
    }

    private double correlation(Map<Integer, Double> a, Map<Integer, Double> b) {
        var ids = a.keySet().stream().filter(b::containsKey).sorted().toList();
        if (ids.size() < 2) return Double.NaN;
        double[] x = midranks(ids.stream().mapToDouble(a::get).toArray()), y = midranks(ids.stream().mapToDouble(b::get).toArray());
        double mean = (ids.size() + 1) / 2.0, xy = 0, xx = 0, yy = 0;
        for (int i = 0; i < x.length; i++) {
            xy += (x[i] - mean) * (y[i] - mean); xx += (x[i] - mean) * (x[i] - mean); yy += (y[i] - mean) * (y[i] - mean);
        }
        return xx == 0 || yy == 0 ? Double.NaN : xy / Math.sqrt(xx * yy);
    }

    private double[] midranks(double[] values) {
        Integer[] order = new Integer[values.length];
        for (int i = 0; i < values.length; i++) order[i] = i;
        Arrays.sort(order, Comparator.comparingDouble(i -> values[i]));
        double[] ranks = new double[values.length];
        for (int i = 0; i < order.length;) {
            int end = i + 1;
            while (end < order.length && Double.compare(values[order[i]], values[order[end]]) == 0) end++;
            for (int j = i; j < end; j++) ranks[order[j]] = (i + 1 + end) / 2.0;
            i = end;
        }
        return ranks;
    }

    private void rank(List<Row> rows) {
        if (archive == null) return;
        for (int fold = 0; fold < 6; fold++) {
            int f = fold;
            double[] ranks = midranks(rows.stream().mapToDouble(r -> r.folds().get(f).logLoss()).toArray());
            for (int i = 0; i < rows.size(); i++) rows.get(i).foldRanks()[fold] = ranks[i];
        }
        double[] five = midranks(rows.stream().mapToDouble(r -> -r.windows().get("archive_oos").five().resolution()).toArray());
        double[] ten = midranks(rows.stream().mapToDouble(r -> -r.windows().get("archive_oos").ten().resolution()).toArray());
        for (int i = 0; i < rows.size(); i++) { rows.get(i).resolutionRanks()[0] = five[i]; rows.get(i).resolutionRanks()[1] = ten[i]; }
    }

    private double loss(Row r) { return r.folds().stream().mapToDouble(Metrics::logLoss).average().orElse(Double.NaN); }
    private boolean presentation(Row r) {
        return r.windows().get("archive_oos").sharp() >= 0.30
                && r.seasons().entrySet().stream().filter(e -> e.getKey() < 103 && e.getValue().sd() >= 120).count() > 7 / 2;
    }
    private boolean eligible(Row r) { return r.config().offseasonRetention() >= 0.75 && r.config().offseasonRetention() <= 0.90 && presentation(r); }
    private double rankSd(Row r) {
        double mean = Arrays.stream(r.foldRanks()).average().orElse(Double.NaN);
        return Math.sqrt(Arrays.stream(r.foldRanks()).map(v -> (v - mean) * (v - mean)).average().orElse(Double.NaN));
    }
    private double roundness(Row r) {
        var c = r.config();
        return Math.abs(c.k() % 10) + Math.abs(c.offseasonRetention() * 100 % 5) + Math.abs(c.homeFieldAdvantage() % 25);
    }

    private List<Benchmark> benchmarks(Row row, String label) {
        List<Benchmark> output = new ArrayList<>();
        for (Cycle cycle : cycles()) {
            var timeline = replay(cycle, row.config());
            for (int season : cycle.seasons()) {
                if (season == 0) continue;
                int s = season;
                var priorElo = endpoint(timeline, season - 1, false);
                var totals = cycle.totals().get(season - 1);
                Map<String, ToDoubleFunction<EloService.Result>> models = new LinkedHashMap<>();
                models.put(label + "_updating", EloService.Result::homeWinProbability);
                models.put(label + "_frozen_elo", r -> engine.probability(engine.regress(priorElo.get(r.game().home().teamId()), row.config())
                        + row.config().homeFieldAdvantage(), engine.regress(priorElo.get(r.game().away().teamId()), row.config()), row.config()));
                if (label.equals("baseline")) {
                    models.put("coin_flip", r -> 0.5);
                    models.put("prior_pd_regressed", r -> {
                        double[] h = totals.get(r.game().home().teamId()), a = totals.get(r.game().away().teamId());
                        return logistic(Math.log(10) / 400 * 25 * 0.9 * ((h[0] - h[1]) / h[2] - (a[0] - a[1]) / a[2]));
                    });
                    models.put("prior_pypat", r -> {
                        double h = pypat(totals.get(r.game().home().teamId())), a = pypat(totals.get(r.game().away().teamId()));
                        return h * (1 - a) / (h * (1 - a) + a * (1 - h));
                    });
                }
                for (var model : models.entrySet()) for (boolean early : List.of(false, true)) {
                    String window = cycle.name() + "_" + (season + cycle.offset()) + (early ? "_early" : "_all");
                    var metrics = score(timeline, r -> r.game().season() == s && (!early || r.game().week() <= 5),
                            model.getValue(), unavailableSlopes(cycle.seasons().size()));
                    if (model.getKey().equals("coin_flip")) assertEquals(Math.log(2), metrics.logLoss(), 1e-12);
                    output.add(new Benchmark(model.getKey(), window, metrics));
                }
            }
        }
        return output;
    }

    private double[] unavailableSlopes(int n) {
        double[] slopes = new double[n];
        Arrays.fill(slopes, Double.NaN);
        return slopes;
    }

    private double pypat(double[] t) {
        if (t[0] + t[1] == 0) return 0.5;
        double exponent = Math.pow((t[0] + t[1]) / t[2], 0.251);
        double pf = Math.pow(t[0], exponent), pa = Math.pow(t[1], exponent);
        return Math.clamp(pf / (pf + pa), 1e-9, 1 - 1e-9);
    }

    private List<Cycle> cycles() { return archive == null ? List.of(current) : List.of(archive, current); }

    private double[] bootstrap(Row candidate, Row baseline) {
        assertArrayEquals(candidate.weekCounts(), baseline.weekCounts());
        Random random = new Random(SEED);
        double[] means = new double[2000];
        for (int i = 0; i < means.length; i++) {
            int n = 0;
            for (int j = 0; j < candidate.weekLosses().length; j++) {
                int w = random.nextInt(candidate.weekLosses().length);
                means[i] += candidate.weekLosses()[w] - baseline.weekLosses()[w]; n += candidate.weekCounts()[w];
            }
            means[i] /= n;
        }
        Arrays.sort(means);
        return new double[]{means[49], means[1949]};
    }

    private String config(Row r) {
        var c = r.config();
        return "K=" + c.k() + ", D=" + c.divisor() + ", MOV=" + (c.movEnabled() ? c.marginCap() : "off") + ", ret=" + c.offseasonRetention() + ", HFA=" + c.homeFieldAdvantage();
    }
    private String f(double value) { return String.format(Locale.ROOT, "%.9f", value); }

    private Map<String, Double> numbers(Metrics m) {
        Map<String, Double> values = new LinkedHashMap<>();
        values.put("n", (double) m.n()); values.put("log_loss", m.logLoss()); values.put("brier", m.brier()); values.put("brier_skill", m.brierSkill());
        values.put("accuracy", m.accuracy()); values.put("ece", m.ece()); values.put("favorite_ge70_share", m.sharp()); values.put("auc", m.auc());
        values.put("margin_n", (double) m.marginN()); values.put("margin_mae", m.mae()); values.put("margin_rmse", m.rmse());
        values.put("elo_per_point", m.eloPerPoint()); values.put("weekly_rank_change", m.rankChange());
        for (int bins : List.of(5, 10)) {
            Murphy d = bins == 5 ? m.five() : m.ten();
            values.put("murphy" + bins + "_reliability", d.reliability()); values.put("murphy" + bins + "_resolution", d.resolution());
            values.put("murphy" + bins + "_uncertainty", d.uncertainty()); values.put("murphy" + bins + "_within_bin_correction", d.correction());
            values.put("murphy" + bins + "_exact_reliability", d.exactReliability());
        }
        for (int i = 0; i < 5; i++) {
            values.put(TIERS[i] + "_n", (double) m.tierN()[i]); values.put(TIERS[i] + "_predicted", m.predicted()[i]); values.put(TIERS[i] + "_observed", m.observed()[i]);
        }
        return values;
    }

    private void writeResults(Path output, List<Row> rows) throws Exception {
        try (var results = Files.newBufferedWriter(output.resolve("results.csv")); var folds = Files.newBufferedWriter(output.resolve("folds.csv"))) {
            List<String> header = new ArrayList<>(List.of("k", "divisor", "movEnabled", "marginCap", "retention", "hfa", "reference_only", "eligible", "mean_fold_log_loss", "fold_rank_mean", "fold_rank_sd", "fold_rank_worst", "resolution_rank5", "resolution_rank10", "bin_sensitive"));
            Row first = rows.getFirst();
            for (String window : first.windows().keySet()) for (String metric : numbers(first.windows().get(window)).keySet()) header.add(window + "_" + metric);
            for (int season : first.seasons().keySet()) for (String metric : List.of("regular_sd", "regular_min", "regular_max", "regular_range", "spearman_pd", "spearman_next_win_pct")) header.add("season" + season + "_" + metric);
            results.write(String.join(",", header) + "\n");
            folds.write("k,divisor,movEnabled,marginCap,retention,hfa,train_start,train_end,test_season,config_rank," + String.join(",", numbers(first.windows().get("current_all")).keySet()) + "\n");
            for (Row r : rows) {
                var c = r.config();
                String prefix = c.k() + "," + c.divisor() + "," + c.movEnabled() + "," + c.marginCap() + "," + c.offseasonRetention() + "," + c.homeFieldAdvantage();
                List<String> cells = new ArrayList<>(List.of(prefix, Boolean.toString(c.offseasonRetention() < 0.75 || c.offseasonRetention() > 0.90), Boolean.toString(archive != null && eligible(r)), f(loss(r)),
                        f(Arrays.stream(r.foldRanks()).average().orElse(Double.NaN)), f(rankSd(r)), f(Arrays.stream(r.foldRanks()).max().orElse(Double.NaN)),
                        archive == null ? "NaN" : f(r.resolutionRanks()[0]), archive == null ? "NaN" : f(r.resolutionRanks()[1]), Boolean.toString(r.resolutionRanks()[0] != r.resolutionRanks()[1])));
                for (var m : r.windows().values()) for (double value : numbers(m).values()) cells.add(f(value));
                for (var m : r.seasons().values()) for (double value : new double[]{m.sd(), m.min(), m.max(), m.max() - m.min(), m.pointDiffCorrelation(), m.nextWinCorrelation()}) cells.add(f(value));
                results.write(String.join(",", cells) + "\n");
                for (int i = 0; i < r.folds().size(); i++) folds.write(prefix + ",96," + (96 + i) + "," + (97 + i) + "," + f(r.foldRanks()[i]) + ","
                        + numbers(r.folds().get(i)).values().stream().map(this::f).collect(Collectors.joining(",")) + "\n");
            }
        }
    }

    private void writeBenchmarks(Path path, List<Benchmark> benchmarks) throws Exception {
        try (var writer = Files.newBufferedWriter(path)) {
            writer.write("model,window," + String.join(",", numbers(benchmarks.getFirst().metrics()).keySet()) + "\n");
            for (var b : benchmarks) writer.write(b.model() + "," + b.window() + "," + numbers(b.metrics()).values().stream().map(this::f).collect(Collectors.joining(",")) + "\n");
        }
    }

    private String report(List<Row> rows, List<Row> eligible, Row baseline, Row candidate, Row lowK, Row zeroK,
                          List<Transition> transitions, List<Benchmark> benchmarks, boolean noise) {
        StringBuilder out = new StringBuilder("# Elo backtest — phase 2\n\n");
        out.append("8,100 grid configurations; ").append(eligible.size()).append(" eligible. Archive: ")
                .append(archive == null ? "MISSING: archive folds, archive continuity assertions, bootstrap and selection skipped" : archive.games().size() + " games, seasons 96–102, regular season only")
                .append(". Current cycle: ").append(current.games().size()).append(" games, seasons 103–105, including playoffs.\n\n")
                .append("Two independent production EloService.compute calls per configuration, each starting at 1500. Archive IDs are synthetic, keyed on normalized abbreviations (ARI=AZ); current IDs are unchanged. All fixture database IDs are null and stage is 1. Games sort by season/week/gameId. No cycle shares ratings or teams. Every config starts every season-103 week-0 team at exactly 1500; reset assertions passed. Archive continuity assertions run only when the archive is present, checking 32 non-1500 carried ratings at each of its six boundaries.\n\n")
                .append("## Methods and explicit choices\n\n")
                .append("- Selection uses archive OOS games only, with mean of six equally weighted fold log losses. Each expanding training period starts in 96 and ends the season before its test. No current-cycle result influences eligibility, ranking, noise tie-breaking or retention choice.\n")
                .append("- Presentation guards: archive OOS favorite ≥70% share ≥0.30 and population rating SD ≥120 in at least four of seven archive regular seasons. Eligible retention is 0.75–0.90; 0.67/0.95/1.00 are reference only. No ECE eligibility gate in phase 2. Season 105 spread is partial.\n")
                .append("- Least squares fits margin = beta × (pregame home Elo − away Elo + HFA), through the origin for home/away symmetry, on preceding seasons only. Reported Elo/point is 1/beta. No training exists in a cycle's first season, so those margin errors are omitted, with margin_n recorded. Each fold refits beta.\n")
                .append("- Brier and log loss use y=1/0/0.5; log probabilities clamp to [1e-9,1−1e-9]. Ties or p=0.5 picks receive 0.5 accuracy. Calibration is favorite-oriented (home chosen at p=0.5), including tie outcomes as 0.5. ECE is game-weighted absolute tier error. AUC uses fractional positive/negative weights for ties and average credit for tied probabilities. Brier skill uses the actual window's coin-flip Brier denominator, accounting for ties.\n")
                .append("- TIERS are lower-inclusive at 0.55/0.60/0.70/0.80. Ten bins are equal-width favorite-probability bands over [0.5,1]. Murphy reliability/resolution are the standard grouped terms; uncertainty is empirical outcome variance, accounting for ties. With varying forecasts within fixed bands, standard reliability − resolution + uncertainty equals the BINNED forecast score, not raw Brier. We separately export the exact within-bin correction = within-bin forecast variance − 2 covariance(forecast,outcome), and exact_reliability = grouped reliability + correction. The asserted identity exact_reliability − resolution + uncertainty matches RAW Brier within 1e-9 in both binnings. Exact reliability can be negative; it is not the standard nonnegative calibration term. Resolution remains the standard between-bin discrimination measure.\n")
                .append("- Fold ranks and both resolution ranks use midranks among all 8,100 configs. bin_sensitive flags any resolution-rank difference; large shifts deserve more weight than one-place differences. Stability reports mean/SD/worst fold rank. Weekly movement is mean |rank−prevRank| over team-week snapshots, including season starts. Spearman uses tied midranks; point differential/game excludes playoffs, next-season win% includes all available games and uses previous postseason-final Elo. Unavailable correlations are NaN.\n")
                .append("- Frozen Elo uses the named config's prior-season final ratings, regressed once using its retention, with no in-season updates. PD/game benchmark regresses prior PD/game 90% toward zero, uses a fixed 25 Elo/point and divisor 400 with HFA 0. PyPAT uses the documented dynamic exponent and combines opposing strengths using log5 odds, without current-season data. These benchmark conventions are fixed before evaluating any fold. Benchmark margin columns are unavailable: only Elo has the specified training-derived mapping.\n")
                .append("- Top-100 spread ≤0.003 is treated as ranking noise; tie-break among those 100 by higher five-band resolution, lower margin MAE, lower fold-rank SD, then round knobs. Otherwise choose minimum mean test LL. Candidate is locked before current-cycle confirmation.\n\n")
                .append("## Baseline, controls and confirmation\n\n");
        summary(out, "Defaults", baseline);
        summary(out, "K=1 control", lowK);
        summary(out, "Near-zero K control", zeroK);
        out.append("\nNear-zero K bypasses validation intentionally; log loss must equal log(2)=0.693147181 within 1e-8. The two controls are report-only, outside the 8,100-row grid.\n\n")
                .append("| Defaults window | Games | Log loss | Brier | Reference LL / Brier |\n|---|---:|---:|---:|---|\n");
        for (String w : List.of("season104", "season105_0_5", "season105_all")) {
            var m = baseline.windows().get(w);
            out.append("| ").append(w).append(" | ").append(m.n()).append(" | ").append(f(m.logLoss())).append(" | ").append(f(m.brier()))
                    .append(" | ").append(w.equals("season104") ? "0.5761 / 0.1982" : "~0.707 / ~0.250 (98-game reference)").append(" |\n");
        }
        out.append("\nSeason 104 regression assertions use tolerance 0.002. The season-105 94-game confirmation and original 98-game reference cover different weeks; the full 98-game window is included to expose that discrepancy.\n\n## Home-field maximum likelihood\n\n")
                .append("HFA is expressed in Elo points at divisor 400. Intercept-only logistic MLE uses home results, with ties as half a win; Wald 95% CI uses observed Fisher information. Conditional MLE additionally uses defaults' pregame Elo gaps as fixed offsets (HFA=0 replay); it is diagnostic, not a refit of the dynamic Elo model. Pooling here combines independent per-game likelihoods, never ratings. Neither fit enters selection.\n\n")
                .append("| Corpus | Fit | HFA | 95% CI |\n|---|---|---:|---|\n");
        List<EloService.Result> pooled = new ArrayList<>();
        for (Cycle cycle : cycles()) {
            var results = replay(cycle, DEFAULTS).games();
            pooled.addAll(results);
            hfaTable(out, cycle.name(), results);
        }
        hfaTable(out, "pooled", pooled);
        out.append("\nThe fixtures do not record who hosted or scheduling policy. Whether designated home has real meaning is unknown; if either player can host regardless of the label, treat HFA as scheduling noise and consider retiring the knob.\n\n");
        if (archive != null) {
            out.append("## Archive selection\n\n");
            if (eligible.isEmpty()) out.append("No grid configuration meets eligibility; no candidate selected.\n\n");
            else {
                int count = Math.min(100, eligible.size());
                double spread = loss(eligible.get(count - 1)) - loss(eligible.getFirst());
                out.append("Top ").append(count).append(" eligible spread: ").append(f(spread)).append(" log loss. ")
                        .append(noise ? "Ranking among these top 100 is noise at the ~0.003 threshold; prescribed secondary metrics break the tie." : "Spread exceeds ~0.003; minimum mean test log loss selects the candidate.").append("\n\n");
                out.append("| Config | Mean archive LL | Resolution 5 / 10 | Margin MAE | Mean / SD / worst fold rank | ≥70% share |\n|---|---:|---|---:|---|---:|\n");
                for (Row r : eligible.stream().limit(20).toList()) {
                    var m = r.windows().get("archive_oos");
                    out.append("| ").append(config(r)).append(" | ").append(f(loss(r))).append(" | ").append(f(m.five().resolution())).append(" / ").append(f(m.ten().resolution()))
                            .append(" | ").append(f(m.mae())).append(" | ").append(f(Arrays.stream(r.foldRanks()).average().orElseThrow())).append(" / ")
                            .append(f(rankSd(r))).append(" / ").append(f(Arrays.stream(r.foldRanks()).max().orElseThrow())).append(" | ").append(f(m.sharp())).append(" |\n");
                }
                out.append("\nLocked candidate: ").append(config(candidate)).append(".\n\n");
                summary(out, "Candidate", candidate);
                double[] ci = bootstrap(candidate, baseline);
                out.append("\nWeek-block paired bootstrap: 2,000 resamples, seed ").append(SEED)
                        .append("; a block is one archive season/week, resampled jointly for both configs. All OOS blocks are sampled with replacement, using summed game loss / summed game count; percentile endpoints are sorted indices 49/1949. Candidate − defaults mean LL = ")
                        .append(f(loss(candidate) - loss(baseline))).append("; 95% CI [").append(f(ci[0])).append(", ").append(f(ci[1])).append("]. ")
                        .append(ci[1] < 0 ? "Archive evidence excludes zero in favor of candidate." : "Archive evidence does not establish an improvement.")
                        .append(" This does not correct selection uncertainty or dependence across weeks.\n\n");
                boolean confirm = true;
                for (String w : List.of("season104", "season105_0_5")) {
                    double delta = candidate.windows().get(w).logLoss() - baseline.windows().get(w).logLoss();
                    confirm &= delta <= 0;
                    out.append("Confirmation ").append(w).append(" candidate − defaults LL: ").append(f(delta)).append(delta <= 0 ? " (passes)" : " (FAILS)").append(".\n\n");
                }
                out.append(confirm && ci[1] < 0 ? "Candidate qualifies for user review; no production settings changed." : "No production change justified by this procedure; no re-selection after confirmation.").append("\n\n");
            }
            Row unconstrained = rows.stream().min(Comparator.comparingDouble(this::loss)).orElseThrow();
            Row aboveFloor = rows.stream().filter(r -> r.config().offseasonRetention() >= 0.75).min(Comparator.comparingDouble(this::loss)).orElseThrow();
            Row inRange = rows.stream().filter(r -> r.config().offseasonRetention() >= 0.75 && r.config().offseasonRetention() <= 0.90).min(Comparator.comparingDouble(this::loss)).orElseThrow();
            Row visible = rows.stream().filter(this::presentation).min(Comparator.comparingDouble(this::loss)).orElseThrow();
            out.append("### Cost of the retention constraint\n\nUnconstrained optimum over the supplied grid: ").append(config(unconstrained)).append("; LL ").append(f(loss(unconstrained)))
                    .append(". Best with only retention≥0.75 (no ceiling or presentation guards): ").append(config(aboveFloor)).append("; floor cost ")
                    .append(f(loss(aboveFloor) - loss(unconstrained))).append(". Best in eligible retention range alone: ").append(config(inRange)).append("; range cost ")
                    .append(f(loss(inRange) - loss(unconstrained))).append(". Best with presentation guards but no retention restriction: ").append(config(visible)).append("; LL ").append(f(loss(visible)))
                    .append(". These are grid optima; 0.67 is the lowest measured retention, so a true unrestricted continuous optimum is unknown.\n\n");
            out.append("Resolution-rank changes between 5/10 bins: ").append(rows.stream().filter(r -> r.resolutionRanks()[0] != r.resolutionRanks()[1]).count())
                    .append(" / 8100; shifts ≥810 ranks: ").append(rows.stream().filter(r -> Math.abs(r.resolutionRanks()[0] - r.resolutionRanks()[1]) >= 810).count())
                    .append(". Both ranks and bin_sensitive are in results.csv.\n\n");
        }
        out.append("## Retention transitions\n\nExactly ").append(transitions.size()).append(" within-cycle transitions are listed. Implied retention below varies only retention on the locked candidate's other knobs (defaults if archive unavailable), using early weeks 0–5 of the destination season; each grid replay remains chronological. This is a descriptive diagnostic and never changes the selected config. It also changes earlier boundaries, so it is not an isolated causal estimate for that single offseason.\n\n")
                .append("| Transition | Cycle | Teams carrying non-1500 Elo (defaults) | Implied retention | Early LL |\n|---|---|---:|---:|---:|\n");
        Row anchor = candidate == null ? baseline : candidate;
        for (var t : transitions) {
            Row best = rows.stream().filter(r -> sameExceptRetention(r.config(), anchor.config()))
                    .min(Comparator.comparingDouble(r -> boundaryLoss(r, t))).orElseThrow();
            out.append("| Transition ").append(t.from()).append("→").append(t.to()).append(" | ").append(t.cycle()).append(" | ").append(t.carried()).append(" | ")
                    .append(best.config().offseasonRetention()).append(" | ").append(f(boundaryLoss(best, t))).append(" |\n");
        }
        out.append("\n## Walk-forward fold detail\n\n| Config | Train | Test | n | LL | Brier | MAE | RMSE | Elo/point | Config rank |\n|---|---|---:|---:|---:|---:|---:|---:|---:|---:|\n");
        for (Row r : candidate == null ? List.of(baseline) : List.of(baseline, candidate)) for (int i = 0; i < r.folds().size(); i++) {
            var m = r.folds().get(i);
            out.append("| ").append(r == baseline ? "Defaults" : "Candidate").append(" | 96–").append(96 + i).append(" | ").append(97 + i)
                    .append(" | ").append(m.n()).append(" | ").append(f(m.logLoss())).append(" | ").append(f(m.brier())).append(" | ").append(f(m.mae()))
                    .append(" | ").append(f(m.rmse())).append(" | ").append(f(m.eloPerPoint())).append(" | ").append(f(r.foldRanks()[i])).append(" |\n");
        }
        out.append("\nMargin slope flags outside 10–60 Elo/point (non-failing): ")
                .append(rows.stream().flatMap(r -> r.folds().stream()).filter(m -> !Double.isFinite(m.eloPerPoint()) || m.eloPerPoint() < 10 || m.eloPerPoint() > 60).count())
                .append(" / ").append(rows.size() * (archive == null ? 0 : 6)).append(" archive config-folds. Current-cycle slope flags outside the same band: ")
                .append(rows.stream().flatMap(r -> java.util.stream.Stream.of(r.windows().get("season104"), r.windows().get("season105_0_5")))
                        .filter(m -> !Double.isFinite(m.eloPerPoint()) || m.eloPerPoint() < 10 || m.eloPerPoint() > 60).count())
                .append(" / 16200 config-season windows. Exact slopes are in folds.csv and results.csv.\n\n")
                .append("## Benchmarks on identical folds and early slices\n\n| Model | Window | n | LL | Brier | Accuracy |\n|---|---|---:|---:|---:|---:|\n");
        for (var b : benchmarks) out.append("| ").append(b.model()).append(" | ").append(b.window()).append(" | ").append(b.metrics().n()).append(" | ")
                .append(f(b.metrics().logLoss())).append(" | ").append(f(b.metrics().brier())).append(" | ").append(f(b.metrics().accuracy())).append(" |\n");
        out.append("\n### Early-season updating versus frozen Elo\n\n");
        for (String label : candidate == null ? List.of("baseline") : List.of("baseline", "candidate")) {
            var early = benchmarks.stream().filter(b -> b.window().startsWith("archive_") && b.window().endsWith("_early")).toList();
            int n = early.stream().filter(b -> b.model().equals(label + "_updating")).mapToInt(b -> b.metrics().n()).sum();
            if (n > 0) {
                double updating = early.stream().filter(b -> b.model().equals(label + "_updating")).mapToDouble(b -> b.metrics().n() * b.metrics().logLoss()).sum() / n;
                double frozen = early.stream().filter(b -> b.model().equals(label + "_frozen_elo")).mapToDouble(b -> b.metrics().n() * b.metrics().logLoss()).sum() / n;
                out.append(label).append(": updating LL ").append(f(updating)).append(", frozen LL ").append(f(frozen)).append(". ")
                        .append(updating < frozen ? "In-season updating improves early prediction." : "Updating does not beat frozen Elo early; this limits the value of tuning K.").append("\n\n");
            }
        }
        out.append("## Error by week bucket and calibration\n\n| Config | Window | n | LL | Brier | MAE | RMSE | ECE | ≥70% |\n|---|---|---:|---:|---:|---:|---:|---:|---:|\n");
        for (Row r : candidate == null ? List.of(baseline) : List.of(baseline, candidate)) for (var entry : r.windows().entrySet()) {
            if (!entry.getKey().contains("_weeks") && !entry.getKey().startsWith("early")) continue;
            var m = entry.getValue();
            out.append("| ").append(r == baseline ? "Defaults" : "Candidate").append(" | ").append(entry.getKey()).append(" | ").append(m.n()).append(" | ")
                    .append(f(m.logLoss())).append(" | ").append(f(m.brier())).append(" | ").append(f(m.mae())).append(" | ").append(f(m.rmse())).append(" | ")
                    .append(f(m.ece())).append(" | ").append(f(m.sharp())).append(" |\n");
        }
        out.append("\n| Config | Window | Tier | n | Predicted | Observed |\n|---|---|---|---:|---:|---:|\n");
        for (Row r : candidate == null ? List.of(baseline) : List.of(baseline, candidate)) for (String w : archive == null ? List.of("season104", "season105_0_5") : List.of("archive_oos", "season104", "season105_0_5")) {
            var m = r.windows().get(w);
            for (int i = 0; i < 5; i++) out.append("| ").append(r == baseline ? "Defaults" : "Candidate").append(" | ").append(w).append(" | ").append(TIERS[i]).append(" | ")
                    .append(m.tierN()[i]).append(" | ").append(f(m.predicted()[i])).append(" | ").append(f(m.observed()[i])).append(" |\n");
        }
        if (candidate != null) {
            out.append("\n## Sensitivity at locked candidate settings\n\n| Knob | Value | Mean archive LL |\n|---|---:|---:|\n");
            for (int axis : List.of(0, 2, 3)) for (Row r : rows) {
                var x = coordinates(r.config()); var y = coordinates(candidate.config());
                boolean match = true;
                for (int i = 0; i < x.length; i++) if (i != axis && x[i] != y[i]) match = false;
                if (match) out.append("| ").append(List.of("K", "divisor", "MOV cap (0=off)", "retention", "HFA").get(axis)).append(" | ").append(x[axis]).append(" | ").append(f(loss(r))).append(" |\n");
            }
            var m = candidate.windows().get("archive_oos");
            out.append("\nCandidate ≥70% favorites' observed win rate: ").append(f((m.observed()[3] * m.tierN()[3] + m.observed()[4] * m.tierN()[4]) / (m.tierN()[3] + m.tierN()[4])))
                    .append("; upset rate is its complement (ties count half). Divisor/K spread remains a display choice; proportional scaling is only approximate because MOV uses raw Elo differences.\n\n");
        }
        out.append("\n## Murphy decomposition\n\n| Config | Window | Bins | Raw Brier | Grouped reliability | Resolution | Uncertainty | Within-bin correction | Exact reliability |\n|---|---|---:|---:|---:|---:|---:|---:|---:|\n");
        for (Row r : candidate == null ? List.of(baseline) : List.of(baseline, candidate)) for (String w : archive == null ? List.of("season104", "season105_0_5") : List.of("archive_oos", "season104", "season105_0_5")) {
            var m = r.windows().get(w);
            for (int bins : List.of(5, 10)) {
                var d = bins == 5 ? m.five() : m.ten();
                out.append("| ").append(r == baseline ? "Defaults" : "Candidate").append(" | ").append(w).append(" | ").append(bins).append(" | ")
                        .append(f(m.brier())).append(" | ").append(f(d.reliability())).append(" | ").append(f(d.resolution())).append(" | ")
                        .append(f(d.uncertainty())).append(" | ").append(f(d.correction())).append(" | ").append(f(d.exactReliability())).append(" |\n");
            }
        }
        rankings(out, baseline, candidate);
        return out.append("\nFull phase-1 and phase-2 metrics: results.csv; every config/fold and rank: folds.csv; benchmark metrics: benchmarks.csv. No production changes or commits.\n").toString();
    }

    private void summary(StringBuilder out, String label, Row r) {
        out.append("\n").append(label).append(": ").append(config(r)).append("; archive mean LL ").append(f(loss(r))).append("; season104 LL ")
                .append(f(r.windows().get("season104").logLoss())).append("; season105 weeks0–5 LL ").append(f(r.windows().get("season105_0_5").logLoss())).append(".\n");
    }

    private double[] coordinates(EloConfig c) {
        return new double[]{c.k(), c.divisor(), c.movEnabled() ? c.marginCap() : 0, c.offseasonRetention(), c.homeFieldAdvantage()};
    }
    private boolean sameExceptRetention(EloConfig a, EloConfig b) {
        return a.k() == b.k() && a.divisor() == b.divisor() && a.movEnabled() == b.movEnabled()
                && a.marginCap() == b.marginCap() && a.homeFieldAdvantage() == b.homeFieldAdvantage();
    }
    private double boundaryLoss(Row r, Transition t) {
        if (t.cycle().equals("current")) return r.windows().get(t.to() == 104 ? "early104" : "early105").logLoss();
        return r.windows().get("archive_early" + t.to()).logLoss();
    }

    private void hfaTable(StringBuilder out, String corpus, List<EloService.Result> games) {
        for (boolean conditional : List.of(false, true)) {
            double hfa = 0, info = 0, scale = Math.log(10) / 400;
            for (int iteration = 0; iteration < 100; iteration++) {
                double gradient = 0;
                info = 0;
                for (var r : games) {
                    double offset = conditional ? r.homePregameElo() - r.awayPregameElo() : 0;
                    double p = logistic(scale * (offset + hfa));
                    gradient += actual(r.game()) - p; info += p * (1 - p);
                }
                double step = gradient / (scale * info);
                hfa += step;
                if (Math.abs(step) < 1e-10) break;
            }
            double half = 1.96 / (scale * Math.sqrt(info));
            out.append("| ").append(corpus).append(" | ").append(conditional ? "conditional" : "intercept-only").append(" | ").append(f(hfa))
                    .append(" | [").append(f(hfa - half)).append(", ").append(f(hfa + half)).append("] |\n");
        }
    }

    private void rankings(StringBuilder out, Row baseline, Row candidate) {
        out.append("\n## Final rankings in both independent cycles\n\nArchive endpoint is season 102 regular-season final; current endpoint is season 105 latest available. Rankings include all completed games. Top and bottom eight shown, independently sorted.\n\n");
        for (Row row : candidate == null ? List.of(baseline) : List.of(baseline, candidate)) {
            out.append("\n### ").append(row == baseline ? "Defaults" : "Candidate").append("\n\n| Cycle | Season | Rank | Team | Elo |\n|---|---:|---:|---|---:|\n");
            for (Cycle cycle : cycles()) {
                var timeline = replay(cycle, row.config());
                int season = cycle.seasons().getLast();
                var ratings = endpoint(timeline, season, false);
                Map<Integer, String> abbr = cycle.games().stream().flatMap(g -> java.util.stream.Stream.of(g.home(), g.away()))
                        .collect(Collectors.toMap(EloService.Team::teamId, EloService.Team::abbrName, (a, b) -> a));
                var sorted = ratings.keySet().stream().sorted(Comparator.<Integer>comparingDouble(ratings::get).reversed().thenComparingInt(i -> i)).toList();
                for (int i = 0; i < sorted.size(); i++) if (i < 8 || i >= sorted.size() - 8) out.append("| ").append(cycle.name()).append(" | ")
                        .append(season + cycle.offset()).append(" | ").append(i + 1).append(" | ").append(abbr.get(sorted.get(i))).append(" | ").append(f(ratings.get(sorted.get(i)))).append(" |\n");
            }
        }
    }

    private String html(String markdown, Row candidate, List<Row> rows) {
        StringBuilder out = new StringBuilder("<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Elo backtest phase 2</title><style>body{font:15px system-ui;max-width:1500px;margin:32px auto;padding:0 20px;color:#17202a}table{border-collapse:collapse;font-size:13px;margin:20px 0;display:block;overflow:auto}td,th{border:1px solid #ccd;padding:7px;text-align:left}th{background:#eef}svg{max-width:100%;height:auto}pre{white-space:pre-wrap}</style><body>");
        boolean table = false;
        for (String line : markdown.split("\n")) {
            if (line.startsWith("|")) {
                if (line.matches("[| :—-]+")) continue;
                if (!table) { out.append("<table>"); table = true; }
                out.append("<tr>");
                for (String cell : line.substring(1, line.lastIndexOf('|')).split("\\|", -1)) out.append("<td>").append(escape(cell.trim())).append("</td>");
                out.append("</tr>");
            } else {
                if (table) { out.append("</table>"); table = false; }
                int level = 0;
                while (level < line.length() && line.charAt(level) == '#') level++;
                if (level > 0) out.append("<h").append(level).append(">").append(escape(line.substring(level).trim())).append("</h").append(level).append(">");
                else if (!line.isBlank()) out.append("<p>").append(escape(line)).append("</p>");
            }
        }
        if (table) out.append("</table>");
        if (candidate != null) {
            out.append("<h2>Sensitivity curves at locked candidate settings</h2>");
            for (int axis : List.of(0, 2, 3)) {
                int knob = axis;
                var points = rows.stream().filter(r -> {
                    double[] x = coordinates(r.config()), y = coordinates(candidate.config());
                    for (int j = 0; j < x.length; j++) if (j != knob && x[j] != y[j]) return false;
                    return true;
                }).sorted(Comparator.comparingDouble(r -> coordinates(r.config())[knob])).toList();
                double min = points.stream().mapToDouble(this::loss).min().orElseThrow();
                double max = points.stream().mapToDouble(this::loss).max().orElseThrow();
                out.append("<h3>").append(List.of("K", "Divisor", "MOV cap (0=off)", "Retention").get(axis)).append("</h3>")
                        .append("<svg role=\"img\" aria-label=\"Archive mean log loss sensitivity\" viewBox=\"0 0 720 260\"><path d=\"M80 20V210H690\" fill=\"none\" stroke=\"#789\"/><text x=\"4\" y=\"30\">")
                        .append(f(max)).append("</text><text x=\"4\" y=\"210\">").append(f(min)).append("</text><polyline fill=\"none\" stroke=\"#2463a0\" stroke-width=\"3\" points=\"");
                for (int i = 0; i < points.size(); i++) out.append(90 + i * 590.0 / (points.size() - 1)).append(',')
                        .append(200 - (loss(points.get(i)) - min) / Math.max(1e-9, max - min) * 170).append(' ');
                out.append("\"/>");
                for (int i = 0; i < points.size(); i++) out.append("<text text-anchor=\"middle\" x=\"").append(90 + i * 590.0 / (points.size() - 1))
                        .append("\" y=\"235\">").append(coordinates(points.get(i).config())[axis]).append("</text>");
                out.append("</svg>");
            }
        }
        return out.append("</body></html>").toString();
    }
    private String escape(String text) { return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;"); }
}
