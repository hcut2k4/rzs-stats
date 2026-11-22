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
@Import({SeasonStateLoader.class, WhatIfService.class, PlayoffsWhatIfController.class, OddsService.class,
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
    @Autowired CacheManager caches;
    final ObjectMapper json = new ObjectMapper();
    MockMvc http;

    @BeforeEach
    void setup() {
        caches.getCacheNames().forEach(n -> caches.getCache(n).clear());
        http = MockMvcBuilders.standaloneSetup(controller).build();
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
            var response = service.simulate(new WhatIfService.Request(1, rules, List.of(), 50));
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
        games.flush();
    }

    @Test
    void defaultsToFiveThousandAndAcceptsTwentyThousandSimulations() throws Exception {
        var a = new TeamEntity();
        a.setTeamId(1); a.setAbbrName("A"); a.setDisplayName("A"); a.setConference("AFC"); a.setDivision("East"); teams.save(a);
        var b = new TeamEntity();
        b.setTeamId(2); b.setAbbrName("B"); b.setDisplayName("B"); b.setConference("AFC"); b.setDivision("East"); teams.save(b);
        var game = new GameEntity();
        game.setGameId(1); game.setSeasonIndex(1); game.setStageIndex(1); game.setWeekIndex(17); game.setStatus(0);
        game.setHomeTeam(a); game.setAwayTeam(b); games.saveAndFlush(game);
        var defaults = postBody(Map.of("season", 1, "picks", List.of(Map.of("gameId", 1, "result", "home"))), 200);
        assertThat(defaults.get("simulations").asInt()).isEqualTo(5000);
        var maximum = postBody(Map.of("season", 1, "simulations", 20000), 200);
        assertThat(maximum.get("simulations").asInt()).isEqualTo(20000);
    }
}
