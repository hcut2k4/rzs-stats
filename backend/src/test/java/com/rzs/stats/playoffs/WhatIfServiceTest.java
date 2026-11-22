package com.rzs.stats.playoffs;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rzs.stats.config.CacheNames;
import com.rzs.stats.controller.PlayoffsWhatIfController;
import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.repository.TeamRepository;
import com.rzs.stats.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.cache.CacheType;
import org.springframework.boot.test.autoconfigure.core.AutoConfigureCache;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DataJpaTest(showSql = false, properties = "playoffs.simulations=50")
@AutoConfigureCache(cacheProvider = CacheType.CAFFEINE)
@EnableCaching
@Import({com.rzs.stats.config.CacheNames.class, com.rzs.stats.playoffs.ComputeGate.class, SeasonStateLoader.class, WhatIfService.class, PlayoffsWhatIfController.class, OddsService.class,
        SimulationService.class, PlayoffPictureService.class, CacheNames.class, EloQueryService.class,
        EloHistoryService.class, EloService.class, EloConfigService.class, OwnerChangeService.class})
class WhatIfServiceTest {
    record Fixture(List<PlayoffSeeding.Team> teams, List<PlayoffSeeding.Game> games, Map<String, List<String>> maddenSeeds) {}
    @Autowired GameRepository games;
    @Autowired TeamRepository teams;
    @Autowired SeasonStateLoader loader;
    @Autowired WhatIfService service;
    @Autowired PlayoffsWhatIfController controller;
    @Autowired PlayoffPictureService picture;
    @Autowired OddsService odds;
    @Autowired EloQueryService elo;
    @Autowired EloConfigService configs;
    @Autowired CacheManager caches;
    final ObjectMapper json = new ObjectMapper();
    MockMvc http;

    @BeforeEach
    void setup() {
        caches.getCacheNames().forEach(n -> caches.getCache(n).clear());
        http = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new WhatIfExceptionHandler()).build();
    }

    Fixture populate(String season, boolean remaining) throws Exception {
        Map<String, Fixture> fixtures;
        try (var in = getClass().getResourceAsStream("/playoffs/rzs-seasons.json")) {
            fixtures = json.readValue(in, new TypeReference<>() {});
        }
        var fixture = fixtures.get(season);
        var entities = new HashMap<String, TeamEntity>();
        for (var t : fixture.teams()) {
            var team = new TeamEntity();
            team.setTeamId(entities.size() + 1); team.setAbbrName(t.abbr()); team.setDisplayName(t.abbr());
            team.setConference(t.conference()); team.setDivision(t.division());
            entities.put(t.abbr(), teams.save(team));
        }
        int id = 0;
        for (var g : fixture.games()) {
            var game = new GameEntity();
            game.setGameId(++id); game.setSeasonIndex(1); game.setStageIndex(1); game.setWeekIndex(g.week());
            game.setHomeTeam(entities.get(g.home())); game.setAwayTeam(entities.get(g.away()));
            game.setStatus(remaining && g.week() >= 16 ? 0 : 2);
            if (game.getStatus() == 2) { game.setHomeScore(g.homeScore()); game.setAwayScore(g.awayScore()); }
            games.save(game);
        }
        games.flush();
        return fixture;
    }

    JsonNode postBody(Object body, int statusCode) throws Exception {
        var response = http.perform(post("/api/playoffs/simulate").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body))).andExpect(status().is(statusCode)).andReturn().getResponse();
        return statusCode == 200 ? json.readTree(response.getContentAsString()) : null;
    }

    @Test
    void exactModeOnlyComputesComparisonWhenEnabled() throws Exception {
        populate("104", false);
        odds.odds(1, "madden");
        for (boolean comparison : List.of(false, true)) {
            caches.getCache("playoffWhatIf").clear();
            var candidate = new WhatIfService(loader, elo, new SimulationService(), odds, caches, new ComputeGate(2, 100));
            org.springframework.test.util.ReflectionTestUtils.setField(candidate, "nflComparison", comparison);
            SimulationService.resetSeedings();
            var response = candidate.simulate(new WhatIfService.Request(1, "madden", List.of(), 50));
            assertThat(response.exact()).isTrue();
            assertThat(SimulationService.seedings()).isEqualTo(comparison ? 2 : 1);
            if (!comparison) assertThat(response.conferences()).allSatisfy(c ->
                    assertThat(c.seeds()).allSatisfy(r -> assertThat(r.row().otherRulesSeed()).isNull()));
            else assertThat(response.conferences()).anySatisfy(c ->
                    assertThat(c.seeds()).anySatisfy(r -> assertThat(r.row().otherRulesSeed()).isNotNull()));
        }
    }

    @Test
    void rejectsInvalidRulesSimulationCountsAndPicksBeforeSimulating() throws Exception {
        populate("104", true);
        int id = loader.load(1).remainingGames().getFirst().gameId();
        for (int count : List.of(-1, 0, 20001, Integer.MAX_VALUE))
            postBody(Map.of("season", 1, "simulations", count), 400);
        postBody(Map.of("season", 1, "rules", "NFL"), 400);
        for (Object pick : List.of(Map.of("gameId", -1, "result", "home"), Map.of("gameId", 1, "result", "home"),
                Map.of("gameId", id, "result", "bad"), Map.of("gameId", id), Map.of("result", "tie")))
            postBody(Map.of("season", 1, "picks", List.of(pick)), 400);
        var pick = Map.of("gameId", id, "result", "home");
        postBody(Map.of("season", 1, "picks", List.of(pick, pick)), 400);
        postBody(Map.of("season", 1, "picks", Collections.nCopies(10000, pick)), 400);
        postBody(Map.of("season", 99, "picks", List.of(pick)), 404);
    }

    @Test
    void rejectsGamesFromOtherSeasonsPreseasonAndPostseason() throws Exception {
        populate("104", true);
        var original = games.findBySeasonIndex(1).getFirst();
        for (int i = 0; i < 3; i++) {
            var game = new GameEntity();
            game.setGameId(1000 + i); game.setSeasonIndex(i == 0 ? 2 : 1);
            game.setStageIndex(i == 1 ? 0 : 1); game.setWeekIndex(i == 2 ? 18 : 17); game.setStatus(0);
            game.setHomeTeam(original.getHomeTeam()); game.setAwayTeam(original.getAwayTeam());
            games.saveAndFlush(game);
            postBody(Map.of("season", 1, "picks", List.of(Map.of("gameId", 1000 + i, "result", "home"))), 400);
        }
    }

    @Test
    void remainingGamesAreOrderedAndUseSimulatorEloProbabilities() throws Exception {
        populate("104", true);
        var response = http.perform(get("/api/playoffs/remaining")).andExpect(status().isOk()).andReturn();
        var body = json.readTree(response.getResponse().getContentAsString());
        assertThat(body.get("season").asInt()).isEqualTo(1);
        assertThat(body.get("nextWeek").asInt()).isEqualTo(16);
        var probabilities = elo.homeWinProbabilities(1);
        int previousWeek = -1, previousId = -1;
        for (var game : body.get("games")) {
            int week = game.get("week").asInt(), id = game.get("gameId").asInt();
            assertThat(week).isGreaterThanOrEqualTo(previousWeek);
            if (week == previousWeek) assertThat(id).isGreaterThan(previousId);
            previousWeek = week; previousId = id;
            assertThat(game.get("homeWinProb").asDouble()).isStrictlyBetween(0.0, 1.0).isEqualTo(probabilities.get(id));
        }
        http.perform(get("/api/playoffs/remaining?season=99")).andExpect(status().isNotFound());
    }

    @Test
    void emptyPicksShareBaselineDrawsAndBaselineOddsForBothRules() throws Exception {
        populate("104", true);
        for (String rules : List.of("madden", "nfl")) {
            var response = service.simulate(new WhatIfService.Request(1, rules, List.of(), 1));
            var expected = new HashMap<String, OddsService.Row>();
            odds.odds(1, rules).conferences().forEach(c -> c.teams().forEach(r -> expected.put(r.team().abbrName(), r)));
            assertThat(response.exact()).isFalse();
            for (var conference : response.conferences()) {
                assertThat(conference.seeds()).isNull();
                for (var row : conference.teams()) {
                    assertThat(row.odds()).isEqualTo(expected.get(row.team().abbrName()).odds());
                    assertThat(row.baseline()).isEqualTo(row.odds());
                    assertThat(row.seedOdds()).isEqualTo(expected.get(row.team().abbrName()).seedOdds());
                }
            }
        }
    }

    @Test
    void exactPicksMatchPictureForTheCompletedHypothetical() throws Exception {
        populate("104", true);
        var state = loader.load(1);
        var forced = new HashMap<Integer, SimulationService.Outcome>();
        var picks = new ArrayList<WhatIfService.Pick>();
        for (var g : state.remainingGames()) {
            var outcome = SimulationService.Outcome.values()[g.gameId() % 3];
            forced.put(g.gameId(), outcome);
            picks.add(new WhatIfService.Pick(g.gameId(), outcome.name().toLowerCase(Locale.ROOT)));
        }
        var responses = List.of(service.simulate(new WhatIfService.Request(1, "madden", picks, 100)),
                service.simulate(new WhatIfService.Request(1, "nfl", picks, 100)));
        assertThat(responses).allMatch(WhatIfService.Response::exact);
        var synthetic = WhatIfService.syntheticGames(state, forced).subList(state.completedGames().size(),
                state.completedGames().size() + state.remainingGames().size());
        var scores = new HashMap<Integer, PlayoffSeeding.Game>();
        for (int i = 0; i < synthetic.size(); i++) scores.put(state.remainingGames().get(i).gameId(), synthetic.get(i));
        for (var game : games.findBySeasonIndex(1)) {
            var score = scores.get(game.getGameId());
            if (score == null) continue;
            game.setStatus(2); game.setHomeScore(score.homeScore()); game.setAwayScore(score.awayScore());
            games.save(game);
        }
        games.flush();
        for (var response : responses) {
            var expected = picture.picture(1, response.rules());
            for (var conference : response.conferences()) {
                assertThat(conference.seeds().stream().map(WhatIfService.Seed::row).toList())
                        .isEqualTo(expected.conferences().stream().filter(c -> c.name().equals(conference.name())).findFirst().orElseThrow().seeds().stream()
                                .map(r -> new PlayoffPictureService.Row(r.seed(), r.rank(), r.team(), r.division(), r.divisionWinner(),
                                        r.wins(), r.losses(), r.ties(), r.otherRulesSeed(), r.reasons(), null)).toList());
            }
        }
        var wire = postBody(Map.of("season", 1, "simulations", 1), 200);
        var seed = wire.get("conferences").get(0).get("seeds").get(0);
        assertThat(seed.has("team")).isTrue();
        assertThat(seed.has("row")).isFalse();
        assertThat(seed.has("dependsOnScores")).isTrue();
    }

    @Test
    void completedSeason104KeepsMaddensCounterintuitiveFieldAndReasons() throws Exception {
        populate("104", false);
        var response = service.simulate(new WhatIfService.Request(1, null, List.of(), 1));
        var nfc = response.conferences().stream().filter(c -> c.name().equals("NFC")).findFirst().orElseThrow();
        assertThat(nfc.seeds().stream().map(s -> s.row().team().abbrName()).toList()).contains("PHI", "DET").doesNotContain("WAS");
        assertThat(nfc.seeds().stream().filter(s -> s.row().team().abbrName().equals("PHI"))
                .flatMap(s -> s.row().reasons().stream()).toList().toString()).contains("Madden puts the biggest group");
    }

    @Test
    void exactSplitSeriesFlagsBothTeamsAndSimulatesMargins() throws Exception {
        smallSchedule(false);
        var response = service.simulate(new WhatIfService.Request(1, "madden",
                List.of(new WhatIfService.Pick(1, "home"), new WhatIfService.Pick(2, "away")), 500));
        assertThat(response.exact()).isTrue();
        var conference = response.conferences().getFirst();
        assertThat(conference.seeds()).allMatch(WhatIfService.Seed::dependsOnScores);
        assertThat(conference.seeds().stream().flatMap(s -> s.row().reasons().stream()).toList().toString())
                .contains("alphabetical");
        assertThat(conference.teams()).allSatisfy(row -> {
            assertThat(row.odds().division()).isStrictlyBetween(0.0, 1.0);
            assertThat(row.odds().playoffs()).isEqualTo(1);
        });
        var points = MaddenSeeding.madden27().seed(loader.load(1).teams(), List.of(
                new PlayoffSeeding.Game(16, "A", "B", 24, 17), new PlayoffSeeding.Game(17, "A", "B", 17, 27)));
        assertThat(WhatIfService.dependsOnScores(points)).containsExactlyInAnyOrder("A", "B");
        var wire = postBody(Map.of("season", 1, "simulations", 50, "picks", List.of(
                Map.of("gameId", 1, "result", "home"), Map.of("gameId", 2, "result", "away"))), 200);
        assertThat(wire.get("conferences").get(0).get("seeds").get(0).get("dependsOnScores").asBoolean()).isTrue();
    }

    @Test
    void headToHeadDecidesEqualRecordsWithoutScoreDependency() throws Exception {
        smallSchedule(true);
        var response = service.simulate(new WhatIfService.Request(1, "madden", List.of(
                new WhatIfService.Pick(1, "home"), new WhatIfService.Pick(2, "home"),
                new WhatIfService.Pick(3, "home")), 100));
        var afc = response.conferences().stream().filter(c -> c.name().equals("AFC")).findFirst().orElseThrow();
        assertThat(afc.seeds()).noneMatch(WhatIfService.Seed::dependsOnScores);
        assertThat(afc.seeds().getFirst().row().team().abbrName()).isEqualTo("A");
        assertThat(afc.seeds().getFirst().row().reasons().toString()).contains("head-to-head");
        assertThat(afc.teams()).allSatisfy(row -> assertThat(row.odds().division())
                .isEqualTo(row.team().abbrName().equals("A") ? 1 : 0));
    }

    @Test
    void rejectsFractionalNumbersAndUnknownPropertiesForThisRequest() throws Exception {
        smallSchedule(false);
        postBody(Map.of("season", 1, "simulations", 1.5), 400);
        postBody(Map.of("season", 1, "picks", List.of(Map.of("gameId", 1.5, "result", "home"))), 400);
        postBody(Map.of("season", 1, "unexpected", true), 400);
        postBody(Map.of("season", 1, "picks", List.of(Map.of("gameId", 1, "result", "home", "unexpected", true))), 400);
    }

    @Test
    void nullStatusGamesAreExcludedFromRemainingAndSimulation() throws Exception {
        smallSchedule(false);
        var unknown = games.findBySeasonIndex(1).stream().filter(g -> g.getGameId() == 1).findFirst().orElseThrow();
        unknown.setStatus(null);
        games.saveAndFlush(unknown);
        var remaining = service.remaining(1);
        assertThat(remaining.games()).extracting(WhatIfService.RemainingGame::gameId).containsExactly(2);
        assertThat(remaining.games().getFirst().homeWinProb()).isStrictlyBetween(0.0, 1.0);
        postBody(Map.of("season", 1, "simulations", 10), 200);
        postBody(Map.of("season", 1, "picks", List.of(Map.of("gameId", 1, "result", "home"))), 400);
    }

    @Test
    void reusesCanonicalRequestsAndSyncEvictionIncludesTheBoundedCache() throws Exception {
        smallSchedule(false);
        var picks = List.of(new WhatIfService.Pick(1, "home"), new WhatIfService.Pick(2, "away"));
        var response = service.simulate(new WhatIfService.Request(null, null, picks, null));
        assertThat(service.simulate(new WhatIfService.Request(1, "madden", picks.reversed(), 50))).isSameAs(response);
        var cache = (org.springframework.cache.caffeine.CaffeineCache) caches.getCache("playoffWhatIf");
        assertThat(cache.getNativeCache().policy().eviction().orElseThrow().getMaximum()).isEqualTo(128);
        var resolver = new CacheNames().allStatsCaches(caches);
        assertThat(resolver.resolveCaches(null).contains(cache)).isTrue();
        resolver.resolveCaches(null).forEach(org.springframework.cache.Cache::clear);
        assertThat(cache.getNativeCache().estimatedSize()).isZero();
        assertThat(service.simulate(new WhatIfService.Request(1, "madden", picks, 50))).isNotSameAs(response);
    }

    @Test
    void changingEloConfigEvictsCachedWhatIfResponses() {
        smallSchedule(false);
        var request = new WhatIfService.Request(1, "madden", List.of(), 10);
        var cached = service.simulate(request);
        assertThat(service.simulate(request)).isSameAs(cached);
        configs.update(new com.rzs.stats.model.dto.EloConfig(1500, 25, 400, true, 28, 250, 0.78));
        assertThat(service.simulate(request)).isNotSameAs(cached);
    }

    @Test
    void failedWhatIfComputationReleasesPermitForTheNextRequest() {
        smallSchedule(false);
        var state = loader.load(1);
        var snapshot = new SeasonStateLoader(games) {
            @Override public State load(Integer season) { return state; }
        };
        odds.odds(1, "madden");
        var fail = new java.util.concurrent.atomic.AtomicBoolean(true);
        var simulator = new SimulationService() {
            @Override public Simulation simulate(SeasonStateLoader.State input, Map<Integer, Double> probabilities,
                                                 Map<Integer, Outcome> forced, int count, long seed, Rules rules, boolean margins) {
                if (fail.getAndSet(false)) throw new IllegalArgumentException("failed computation");
                return super.simulate(input, probabilities, forced, count, seed, rules, margins);
            }
        };
        var whatIf = new WhatIfService(snapshot, elo, simulator, odds, caches, new ComputeGate(1, 0));
        var request = new WhatIfService.Request(1, "madden", List.of(new WhatIfService.Pick(1, "home")), 10);
        assertThatThrownBy(() -> whatIf.simulate(request)).isInstanceOf(IllegalArgumentException.class);
        assertThat(whatIf.simulate(request)).isNotNull();
    }

    @Test
    void twoConcurrentCalculationsAllowCachedRequestsAndRejectExtraWorkWithPlainMessage() throws Exception {
        smallSchedule(false);
        odds.odds(1, "madden");
        var state = loader.load(1);
        var started = new java.util.concurrent.CountDownLatch(2);
        var finish = new java.util.concurrent.CountDownLatch(1);
        var simulator = new SimulationService() {
            @Override public Simulation simulate(SeasonStateLoader.State input, Map<Integer, Double> probabilities,
                                                 Map<Integer, Outcome> forced, int count, long seed, Rules rules, boolean margins) {
                started.countDown();
                try {
                    assertThat(finish.await(10, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
                } catch (InterruptedException e) {
                    throw new AssertionError(e);
                }
                return super.simulate(input, probabilities, forced, count, seed, rules, margins);
            }
        };
        var snapshot = new SeasonStateLoader(games) {
            @Override public State load(Integer season) { return state; }
        };
        var whatIf = new WhatIfService(snapshot, elo, simulator, odds, caches, new com.rzs.stats.playoffs.ComputeGate(2, 100));
        var cachedRequest = new WhatIfService.Request(1, "madden", List.of(), 1);
        var cached = whatIf.simulate(cachedRequest);
        var picks = List.of(new WhatIfService.Pick(1, "home"), new WhatIfService.Pick(2, "away"));
        var http = MockMvcBuilders.standaloneSetup(new PlayoffsWhatIfController(whatIf))
                .setControllerAdvice(new WhatIfExceptionHandler()).build();
        try (var executor = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
            var first = executor.submit(() -> whatIf.simulate(new WhatIfService.Request(1, "madden", picks, 50)));
            var second = executor.submit(() -> whatIf.simulate(new WhatIfService.Request(1, "madden", picks, 51)));
            try {
                assertThat(started.await(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
                assertThat(whatIf.simulate(cachedRequest)).isSameAs(cached);
                var response = http.perform(post("/api/playoffs/simulate").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(new WhatIfService.Request(1, "madden", picks, 52))))
                        .andExpect(status().isServiceUnavailable()).andReturn().getResponse();
                assertThat(response.getContentAsString()).isEqualTo("Playoff simulations are busy; try again shortly");
            } finally {
                finish.countDown();
            }
            assertThat(first.get(5, java.util.concurrent.TimeUnit.SECONDS)).isNotNull();
            assertThat(second.get(5, java.util.concurrent.TimeUnit.SECONDS)).isNotNull();
        }
        assertThat(whatIf.simulate(new WhatIfService.Request(1, "madden", picks, 52))).isNotNull();
    }

    @Test
    void reusesDefaultSeasonBaselineThroughTheCanonicalSeasonKey() throws Exception {
        smallSchedule(false);
        var expected = odds.odds(null, "madden");
        var cache = caches.getCache("playoffOdds");
        var response = service.simulate(new WhatIfService.Request(1, "madden", List.of(), 1));
        assertThat(cache.get(new org.springframework.cache.interceptor.SimpleKey(1, "madden"), OddsService.Response.class)).isSameAs(expected);
        assertThat(response.conferences().getFirst().teams()).allSatisfy(row ->
                assertThat(row.baseline()).isEqualTo(expected.conferences().getFirst().teams().stream()
                        .filter(r -> r.team().equals(row.team())).findFirst().orElseThrow().odds()));
    }

    @Test
    void baselineAndForcedRunUseOneLoadedSeasonState() {
        smallSchedule(false);
        var loads = new ArrayList<SeasonStateLoader.State>();
        var loaded = new SeasonStateLoader(games) {
            @Override public State load(Integer season) {
                assertThat(loads).isEmpty();
                var state = super.load(season);
                loads.add(state);
                return state;
            }
        };
        var simulated = new ArrayList<SeasonStateLoader.State>();
        var simulator = new SimulationService() {
            @Override public Simulation baseline(SeasonStateLoader.State state, Map<Integer, Double> probabilities,
                                                 int count, long seed, Rules rules) {
                simulated.add(state);
                return super.baseline(state, probabilities, count, seed, rules);
            }
            @Override public Simulation simulate(SeasonStateLoader.State state, Map<Integer, Double> probabilities,
                                                 Map<Integer, Outcome> forced, int count, long seed, Rules rules, boolean margins) {
                simulated.add(state);
                return super.simulate(state, probabilities, forced, count, seed, rules, margins);
            }
        };
        var baseline = new OddsService(loaded, elo, simulator, 50, caches, new com.rzs.stats.playoffs.ComputeGate(2, 100));
        var whatIf = new WhatIfService(loaded, elo, simulator, baseline, caches, new com.rzs.stats.playoffs.ComputeGate(2, 100));
        whatIf.simulate(new WhatIfService.Request(null, "madden", List.of(new WhatIfService.Pick(1, "home")), 10));
        assertThat(loads).hasSize(1);
        assertThat(simulated).hasSize(2).allSatisfy(state -> assertThat(state).isSameAs(loads.getFirst()));
    }

    @Test
    void exactHeadToHeadOrderSkipsForcedSimulations() {
        smallSchedule(true);
        var calls = new ArrayList<Map<Integer, SimulationService.Outcome>>();
        var simulator = new SimulationService() {
            @Override public Simulation baseline(SeasonStateLoader.State state, Map<Integer, Double> probabilities,
                                                 int count, long seed, Rules rules) {
                calls.add(Map.of());
                return super.baseline(state, probabilities, count, seed, rules);
            }
            @Override public Simulation simulate(SeasonStateLoader.State state, Map<Integer, Double> probabilities,
                                                 Map<Integer, Outcome> forced, int count, long seed, Rules rules, boolean margins) {
                calls.add(forced);
                return super.simulate(state, probabilities, forced, count, seed, rules, margins);
            }
        };
        var whatIf = new WhatIfService(loader, elo, simulator, new OddsService(loader, elo, simulator, 50, caches, new com.rzs.stats.playoffs.ComputeGate(2, 100)), caches, new com.rzs.stats.playoffs.ComputeGate(2, 100));
        var response = whatIf.simulate(new WhatIfService.Request(1, "madden", List.of(
                new WhatIfService.Pick(1, "home"), new WhatIfService.Pick(2, "home"), new WhatIfService.Pick(3, "home")), 100));
        assertThat(calls).containsExactly(Map.of());
        assertThat(response.conferences()).flatExtracting(WhatIfService.Conference::seeds).noneMatch(WhatIfService.Seed::dependsOnScores);
    }

    @Test
    void divisionScoreTiesFlagTeamsAffectedByTheCascadingWildCardTie() {
        var entities = new HashMap<String, TeamEntity>();
        var divisions = Map.of("A", "East", "B", "East", "C", "West", "D", "West", "E", "North",
                "X", "North", "F", "South", "Y", "South", "Z", "South", "Q", "East");
        for (String abbr : divisions.keySet().stream().sorted().toList()) {
            var team = new TeamEntity();
            team.setTeamId(entities.size() + 1); team.setAbbrName(abbr); team.setDisplayName(abbr);
            team.setConference(abbr.equals("Q") ? "NFC" : "AFC"); team.setDivision(divisions.get(abbr));
            entities.put(abbr, teams.save(team));
        }
        int id = 0;
        for (String abbr : List.of("D", "E", "F", "X", "X", "X", "X", "Y", "Y", "Y", "Y")) {
            var game = new GameEntity();
            game.setGameId(++id); game.setSeasonIndex(1); game.setStageIndex(1); game.setWeekIndex(0); game.setStatus(2);
            game.setHomeTeam(entities.get(abbr)); game.setAwayTeam(entities.get("Q"));
            game.setHomeScore(id == 7 || id == 11 ? 17 : 24); game.setAwayScore(20);
            games.save(game);
        }
        var matchups = List.of(List.of("A", "B"), List.of("B", "A"), List.of("C", "A"),
                List.of("B", "C"), List.of("A", "Z"), List.of("Z", "B"));
        var picks = new ArrayList<WhatIfService.Pick>();
        var forced = new HashMap<Integer, SimulationService.Outcome>();
        for (var matchup : matchups) {
            var game = new GameEntity();
            game.setGameId(++id); game.setSeasonIndex(1); game.setStageIndex(1); game.setWeekIndex(17); game.setStatus(0);
            game.setHomeTeam(entities.get(matchup.getFirst())); game.setAwayTeam(entities.get(matchup.getLast()));
            games.save(game);
            picks.add(new WhatIfService.Pick(id, "home"));
            forced.put(id, SimulationService.Outcome.HOME);
        }
        games.flush();
        var state = loader.load(1);
        var seeded = SimulationService.seed(state.teams(), WhatIfService.syntheticGames(state, forced), SimulationService.Rules.MADDEN);
        assertThat(WhatIfService.dependsOnScores(seeded)).contains("A", "B").doesNotContain("Z");
        var response = service.simulate(new WhatIfService.Request(1, "madden", picks, 500));
        var afc = response.conferences().stream().filter(c -> c.name().equals("AFC")).findFirst().orElseThrow();
        var cascade = afc.seeds().stream().filter(s -> s.row().team().abbrName().equals("Z")).findFirst().orElseThrow();
        assertThat(cascade.dependsOnScores()).isTrue();
        assertThat(cascade.odds().playoffs()).isStrictlyBetween(0.0, 1.0);
        var seededTeams = afc.seeds().stream().map(s -> s.row().team().abbrName()).toList();
        assertThat(afc.teams()).filteredOn(t -> !seededTeams.contains(t.team().abbrName()))
                .filteredOn(t -> t.odds().playoffs() > 0 && t.odds().playoffs() < 1)
                .isNotEmpty().allSatisfy(t -> assertThat(t.dependsOnScores()).isTrue());
        assertThat(afc.seeds()).filteredOn(s -> !s.dependsOnScores()).allSatisfy(s -> {
            assertThat(s.odds().playoffs()).isIn(0.0, 1.0);
            assertThat(s.odds().division()).isIn(0.0, 1.0);
            assertThat(s.odds().oneSeed()).isIn(0.0, 1.0);
        });
    }

    private void smallSchedule(boolean headToHead) {
        var entities = new HashMap<String, TeamEntity>();
        for (String abbr : headToHead ? List.of("A", "B", "C") : List.of("A", "B")) {
            var team = new TeamEntity();
            team.setTeamId(entities.size() + 1); team.setAbbrName(abbr); team.setDisplayName(abbr);
            team.setConference(abbr.equals("C") ? "NFC" : "AFC"); team.setDivision("East");
            entities.put(abbr, teams.save(team));
        }
        var matchups = headToHead ? List.of(List.of("A", "B"), List.of("B", "C"), List.of("C", "A"))
                : List.of(List.of("A", "B"), List.of("A", "B"));
        int id = 0;
        for (var matchup : matchups) {
            var game = new GameEntity();
            game.setGameId(++id); game.setSeasonIndex(1); game.setStageIndex(1); game.setWeekIndex(14 + id); game.setStatus(0);
            game.setHomeTeam(entities.get(matchup.getFirst())); game.setAwayTeam(entities.get(matchup.getLast()));
            games.save(game);
        }
        var completed = new GameEntity();
        completed.setGameId(100); completed.setSeasonIndex(1); completed.setStageIndex(1); completed.setWeekIndex(0);
        completed.setHomeTeam(entities.get("A")); completed.setAwayTeam(entities.get("B"));
        completed.setStatus(2); completed.setHomeScore(20); completed.setAwayScore(20);
        games.save(completed);
        games.flush();
    }

    @Test
    void defaultsToBaselineSimulationCountAndAcceptsExplicitLowerAndMaximumCounts() throws Exception {
        var a = new TeamEntity();
        a.setTeamId(1); a.setAbbrName("A"); a.setDisplayName("A"); a.setConference("AFC"); a.setDivision("East"); teams.save(a);
        var b = new TeamEntity();
        b.setTeamId(2); b.setAbbrName("B"); b.setDisplayName("B"); b.setConference("AFC"); b.setDivision("East"); teams.save(b);
        var game = new GameEntity();
        game.setGameId(1); game.setSeasonIndex(1); game.setStageIndex(1); game.setWeekIndex(17); game.setStatus(0);
        game.setHomeTeam(a); game.setAwayTeam(b); games.saveAndFlush(game);
        var defaults = postBody(Map.of("season", 1, "picks", List.of(Map.of("gameId", 1, "result", "home"))), 200);
        assertThat(defaults.get("simulations").asInt()).isEqualTo(50);
        var lower = postBody(Map.of("season", 1, "simulations", 1), 200);
        assertThat(lower.get("simulations").asInt()).isEqualTo(1);
        var maximum = postBody(Map.of("season", 1, "simulations", 20000), 200);
        assertThat(maximum.get("simulations").asInt()).isEqualTo(20000);
    }
}
