package com.rzs.stats.playoffs;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rzs.stats.config.CacheNames;
import com.rzs.stats.controller.PlayoffsController;
import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.repository.*;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@DataJpaTest(showSql = false, properties = "playoffs.simulations=100")
@AutoConfigureCache(cacheProvider = CacheType.CAFFEINE)
@EnableCaching
@Import({SeasonStateLoader.class, OddsService.class, SimulationService.class, OddsSnapshotService.class,
        ChampionshipService.class, OddsHistoryService.class,
        com.rzs.stats.controller.PlayoffsChampionshipController.class, com.rzs.stats.controller.PlayoffsOddsHistoryController.class,
        PlayoffsController.class, ClinchService.class, PlayoffPictureService.class, CacheNames.class, EloQueryService.class,
        EloHistoryService.class, EloService.class, EloConfigService.class, OwnerChangeService.class})
class OddsServiceTest {
    @Autowired GameRepository games;
    @Autowired TeamRepository teams;
    @Autowired OddsSnapshotRepository snapshots;
    @Autowired OddsSnapshotService writer;
    @Autowired OddsService odds;
    @Autowired ChampionshipService championship;
    @Autowired OddsHistoryService history;
    @Autowired SeasonStateLoader loader;
    @Autowired SimulationService simulator;
    @Autowired com.rzs.stats.controller.PlayoffsChampionshipController championshipController;
    @Autowired com.rzs.stats.controller.PlayoffsOddsHistoryController historyController;
    @Autowired EloQueryService elo;
    @Autowired EloConfigService configs;
    @Autowired PlayoffsController controller;
    @Autowired CacheManager caches;
    MockMvc http;
    final ObjectMapper json = new ObjectMapper();

    @BeforeEach
    void setup() {
        caches.getCacheNames().forEach(n -> caches.getCache(n).clear());
        http = MockMvcBuilders.standaloneSetup(controller, championshipController, historyController).build();
    }

    void populate(boolean completed) throws Exception {
        var state = SimulationServiceTest.season(true);
        var entities = new HashMap<String, TeamEntity>();
        for (var t : state.teams()) {
            var team = new TeamEntity();
            team.setTeamId(entities.size() + 1);
            team.setAbbrName(t.abbr());
            team.setDisplayName(t.abbr());
            team.setDivision(t.division());
            team.setConference(t.conference());
            entities.put(t.abbr(), teams.save(team));
        }
        int id = 0;
        for (var g : state.completedGames()) {
            var game = new GameEntity();
            game.setSeasonIndex(2); game.setStageIndex(1); game.setWeekIndex(g.week()); game.setGameId(++id);
            game.setHomeTeam(entities.get(g.home())); game.setAwayTeam(entities.get(g.away()));
            game.setStatus(completed || g.week() < 16 ? 2 : 0);
            if (game.getStatus() == 2) { game.setHomeScore(g.homeScore()); game.setAwayScore(g.awayScore()); }
            games.save(game);
        }
        games.flush();
    }

    @Test
    void endpointReturnsFractionsSortedTeamsAndSevenSeedOdds() throws Exception {
        populate(false);
        var response = http.perform(get("/api/playoffs/odds")).andExpect(status().isOk()).andReturn();
        var body = json.readTree(response.getResponse().getContentAsString());
        assertThat(body.get("season").asInt()).isEqualTo(2);
        assertThat(body.get("simulations").asInt()).isEqualTo(100);
        assertThat(body.get("throughWeek").asInt()).isEqualTo(15);
        assertThat(body.get("nextWeek").asInt()).isEqualTo(16);
        assertThat(body.get("computedAt").asText()).isNotBlank();
        for (var conference : body.get("conferences")) {
            double previous = 1, playoffs = 0, one = 0;
            var divisions = new HashMap<String, Double>();
            for (var row : conference.get("teams")) {
                double p = row.get("odds").get("playoffs").asDouble();
                assertThat(p).isBetween(0.0, previous);
                previous = p; playoffs += p;
                one += row.get("odds").get("oneSeed").asDouble();
                divisions.merge(row.get("division").asText(), row.get("odds").get("division").asDouble(), Double::sum);
                assertThat(row.get("seedOdds").size()).isEqualTo(7);
            }
            assertThat(playoffs).isCloseTo(7, within(1e-10));
            assertThat(one).isCloseTo(1, within(1e-10));
            divisions.values().forEach(p -> assertThat(p).isCloseTo(1, within(1e-10)));
        }
        var probabilities = elo.homeWinProbabilities(2);
        elo.upcoming(2, null).forEach(g -> assertThat(probabilities.get(g.gameId())).isEqualTo(g.homeWinProbability()));
        assertThat(snapshots.count()).isZero();
    }

    @Test
    void completedSeasonUsesExactOddsAndSnapshotUpsertPreservesFirstBaseline() throws Exception {
        populate(true);
        var response = odds.odds(2, "madden");
        assertThat(response.simulations()).isZero();
        var state = SimulationServiceTest.season(true);
        var exact = MaddenSeeding.madden27().seed(state.teams(), state.completedGames());
        for (var conference : response.conferences()) for (var row : conference.teams()) {
            var rank = exact.conferences().get(conference.name()).stream().filter(r -> r.teams().contains(row.team().abbrName())).findFirst().orElseThrow();
            assertThat(row.odds().playoffs()).isEqualTo(rank.position() <= 7 ? 1 : 0);
            assertThat(row.odds().oneSeed()).isEqualTo(rank.position() == 1 ? 1 : 0);
        }
        writer.save(response);
        writer.save(new OddsService.Response(2, "madden", 17, null, 99, response.computedAt().plusSeconds(60), response.conferences()));
        var saved = snapshots.findBySeasonAndNextWeek(2, -1);
        assertThat(saved).hasSize(32);
        saved.forEach(row -> {
            assertThat(row.getComputedAt()).isEqualTo(response.computedAt());
            assertThat(row.getRules()).isEqualTo("madden");
            assertThat(row.getSimulations()).isZero();
            assertThat(row.getSeedOdds()).hasSize(7);
        });
        assertThat(odds.odds(2, "nfl").simulations()).isZero();
        writer.save(odds.odds(2, "nfl"));
        assertThat(snapshots.count()).isEqualTo(32);
    }

    @Test
    void oddsCacheIsEvictedByTheSharedResolver() throws Exception {
        populate(false);
        var before = odds.odds(2, "madden");
        games.deleteAllInBatch();
        assertThat(odds.odds(2, "madden")).isSameAs(before);
        new CacheNames().allStatsCaches(caches).resolveCaches(null).forEach(org.springframework.cache.Cache::clear);
        http.perform(get("/api/playoffs/odds?season=2")).andExpect(status().isNotFound());
    }

    @Test
    void eloConfigurationChangesInvalidateOddsAndUseUpdatedHomeField() throws Exception {
        populate(false);
        var before = odds.odds(2, "madden");
        var previous = elo.homeWinProbabilities(2);
        configs.update(new com.rzs.stats.model.dto.EloConfig(1500, 25, 400, true, 28, 250, 0.78));
        var updated = elo.homeWinProbabilities(2);
        assertThat(updated).isNotEqualTo(previous);
        elo.upcoming(2, null).forEach(g -> assertThat(updated.get(g.gameId())).isEqualTo(g.homeWinProbability()));
        assertThat(odds.odds(2, "madden")).isNotSameAs(before);
    }

    @Test
    void unresolvedNflOrderStillReturnsOddsUsingAlphabeticalFallback() throws Exception {
        populate(true);
        games.deleteAllInBatch();
        var entities = new HashMap<String, TeamEntity>();
        teams.findAll().forEach(t -> entities.put(t.getAbbrName(), t));
        var tie = new GameEntity();
        tie.setSeasonIndex(3); tie.setStageIndex(1); tie.setWeekIndex(17); tie.setGameId(1);
        tie.setHomeTeam(entities.get("BUF")); tie.setAwayTeam(entities.get("NE"));
        tie.setStatus(2); tie.setHomeScore(20); tie.setAwayScore(20);
        games.saveAndFlush(tie);
        http.perform(get("/api/playoffs/odds?season=3&rules=nfl")).andExpect(status().isOk());
        http.perform(get("/api/playoffs/odds?season=3&rules=madden")).andExpect(status().isOk());
    }

    @Test
    void championshipEndpointUsesSameBaselineFractionsAndConservesTitles() throws Exception {
        populate(false);
        var before = http.perform(get("/api/playoffs/odds?season=2")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        var response = http.perform(get("/api/playoffs/championship?season=2")).andExpect(status().isOk()).andReturn();
        var body = json.readTree(response.getResponse().getContentAsString());
        assertThat(body.get("simulations").asInt()).isEqualTo(100);
        double champions = 0, finalists = 0, conferenceFinals = 0, previous = 1;
        var baseline = new HashMap<String, Double>();
        odds.odds(2, "madden").conferences().forEach(c -> c.teams().forEach(t -> baseline.put(t.team().abbrName(), t.odds().playoffs())));
        for (var row : body.get("teams")) {
            assertThat(row.get("playoffs").asDouble()).isEqualTo(baseline.get(row.get("team").get("abbrName").asText()));
            assertThat(row.get("champion").asDouble()).isLessThanOrEqualTo(previous);
            previous = row.get("champion").asDouble();
            champions += previous;
            finalists += row.get("final").asDouble();
            conferenceFinals += row.get("conferenceFinal").asDouble();
        }
        assertThat(champions).isCloseTo(1, within(1e-10));
        assertThat(finalists).isCloseTo(2, within(1e-10));
        assertThat(conferenceFinals).isCloseTo(4, within(1e-10));
        caches.getCache("playoffOdds").clear();
        var after = json.readTree(http.perform(get("/api/playoffs/odds?season=2")).andReturn().getResponse().getContentAsString());
        var original = json.readTree(before);
        ((com.fasterxml.jackson.databind.node.ObjectNode) after).remove("computedAt");
        ((com.fasterxml.jackson.databind.node.ObjectNode) original).remove("computedAt");
        assertThat(after).isEqualTo(original);
    }

    @Test
    void completedChampionshipUsesConfiguredCountAndCacheEvictsWithEloAndSharedResolver() throws Exception {
        populate(true);
        var first = championship.championship(2, "madden");
        assertThat(first.simulations()).isEqualTo(100);
        assertThat(championship.championship(2, "madden")).isSameAs(first);
        configs.update(new com.rzs.stats.model.dto.EloConfig(1500, 25, 400, true, 28, 250, 0.78));
        var updated = championship.championship(2, "madden");
        assertThat(updated).isNotSameAs(first);
        assertThat(updated.teams()).isNotEqualTo(first.teams());
        new CacheNames().allStatsCaches(caches).resolveCaches(null).forEach(org.springframework.cache.Cache::clear);
        assertThat(championship.championship(2, "madden")).isNotSameAs(updated);
        http.perform(get("/api/playoffs/championship?season=2&rules=nfl")).andExpect(status().isOk());
        http.perform(get("/api/playoffs/championship?rules=bad")).andExpect(status().isBadRequest());
        http.perform(get("/api/playoffs/championship?season=99")).andExpect(status().isNotFound());
    }

    @Test
    void historyReturnsEmptyOrOrderedSnapshotsAndFiltersTeam() throws Exception {
        populate(false);
        http.perform(get("/api/playoffs/odds/history?season=2")).andExpect(status().isOk()).andExpect(jsonPath("$.snapshots").isEmpty());
        var baseline = odds.odds(2, "madden");
        writer.save(baseline);
        writer.save(new OddsService.Response(2, "madden", 2, 3, 100, baseline.computedAt().minusSeconds(60), baseline.conferences()));
        writer.save(new OddsService.Response(2, "madden", 17, null, 0, baseline.computedAt().plusSeconds(60), baseline.conferences()));
        http.perform(get("/api/playoffs/odds/history?team=buf"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.season").value(2))
                .andExpect(jsonPath("$.snapshots[0].week").value(3))
                .andExpect(jsonPath("$.snapshots[1].week").value(16))
                .andExpect(jsonPath("$.snapshots[2].week").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.snapshots[0].teams.length()").value(1))
                .andExpect(jsonPath("$.snapshots[0].teams[0].team.abbrName").value("BUF"));
        http.perform(get("/api/playoffs/odds/history?season=99")).andExpect(status().isNotFound());
    }

    @Test
    void backfillCreatesEveryEarlierWeekAndNeverOverwritesExistingSnapshot() throws Exception {
        populate(false);
        for (var game : games.findBySeasonIndex(2)) {
            if (game.getWeekIndex() > 3) game.setStatus(0);
        }
        games.flush();
        var existing = odds.historical(loader.loadAtStart(2, 2));
        writer.save(existing);
        http.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/admin/playoffs/odds/backfill?season=2"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.season").value(2))
                .andExpect(jsonPath("$.created").value(2)).andExpect(jsonPath("$.skipped").value(1));
        assertThat(snapshots.count()).isEqualTo(3 * 32);
        assertThat(history.backfill(2)).isEqualTo(new OddsHistoryService.Backfill(2, 0, 3));
        snapshots.findBySeasonAndNextWeek(2, 2).forEach(row -> {
            assertThat(row.getComputedAt()).isEqualTo(existing.computedAt());
            assertThat(row.getSimulations()).isEqualTo(existing.simulations());
            var original = existing.conferences().stream().flatMap(c -> c.teams().stream()).filter(t -> t.team().teamId() == row.getTeamId()).findFirst().orElseThrow();
            assertThat(row.getPlayoffs()).isEqualTo(original.odds().playoffs());
            assertThat(row.getSeedOdds()).isEqualTo(original.seedOdds());
        });
        http.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/admin/playoffs/odds/backfill?season=99"))
                .andExpect(status().isNotFound());
    }

    @Test
    void backfillUsesExistingAdminTokenGateAndAllowsUnsetToken() throws Exception {
        populate(false);
        for (var game : games.findBySeasonIndex(2)) if (game.getWeekIndex() > 0) game.setStatus(0);
        games.flush();
        var gated = MockMvcBuilders.standaloneSetup(historyController)
                .addFilters(new com.rzs.stats.config.AdminTokenFilter("secret")).build();
        var request = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/admin/playoffs/odds/backfill?season=2");
        gated.perform(request).andExpect(status().isUnauthorized());
        gated.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/admin/playoffs/odds/backfill?season=2")
                .header("X-Admin-Token", "wrong")).andExpect(status().isUnauthorized());
        gated.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/admin/playoffs/odds/backfill?season=2")
                .header("X-Admin-Token", "secret")).andExpect(status().isOk()).andExpect(jsonPath("$.created").value(0));
        var open = MockMvcBuilders.standaloneSetup(historyController)
                .addFilters(new com.rzs.stats.config.AdminTokenFilter("")).build();
        open.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/admin/playoffs/odds/backfill?season=2"))
                .andExpect(status().isOk());
    }

    @Test
    void firstWeekBackfillWorksWithoutAnyCompletedGamesAndKeepsStoredGameIdentity() throws Exception {
        populate(true);
        for (var game : games.findBySeasonIndex(2)) {
            if (game.getWeekIndex() == 0) game.setWeekIndex(1);
            if (game.getWeekIndex() > 1) game.setStatus(0);
        }
        games.flush();
        var state = loader.loadAtStart(2, 1);
        assertThat(state.completedGames()).isEmpty();
        assertThat(state.nextWeek()).isEqualTo(1);
        assertThat(state.remainingGames()).hasSize(272);
        var stored = games.findBySeasonIndex(2);
        for (var remaining : state.remainingGames()) {
            var game = stored.stream().filter(g -> g.getGameId() == remaining.gameId()).findFirst().orElseThrow();
            assertThat(remaining.homeTeamId()).isEqualTo(game.getHomeTeam().getTeamId());
            assertThat(remaining.awayTeamId()).isEqualTo(game.getAwayTeam().getTeamId());
        }
        assertThat(elo.ratingsAtStart(2, 1).teams().values()).allMatch(r -> r == 1500);
        assertThat(history.backfill(2)).isEqualTo(new OddsHistoryService.Backfill(2, 1, 0));
        assertThat(snapshots.findBySeasonAndNextWeek(2, 1)).hasSize(32);
    }

    @Test
    void historicalOddsUseEarlierEloInsteadOfLaterRatings() throws Exception {
        populate(true);
        var state = loader.loadAtStart(2, 1);
        var early = elo.ratingsAtStart(2, 1);
        var latest = elo.currentRatings();
        assertThat(early.teams()).isNotEqualTo(latest.teams());
        var currentProbabilities = new HashMap<Integer, Double>();
        state.remainingGames().forEach(g -> currentProbabilities.put(g.gameId(), elo.winProbability(latest, g.homeTeamId(), g.awayTeamId(), false)));
        var wrong = simulator.simulate(state, currentProbabilities, Map.of(), 100, OddsService.seed(state, "madden"), SimulationService.Rules.MADDEN);
        var historical = odds.historical(state);
        assertThat(historical.conferences().stream().flatMap(c -> c.teams().stream())
                .anyMatch(t -> t.odds().playoffs() != wrong.teams().get(t.team().abbrName()).playoffs() / 100.0)).isTrue();
        var expectedProbabilities = new HashMap<Integer, Double>();
        state.remainingGames().forEach(g -> expectedProbabilities.put(g.gameId(), elo.winProbability(early, g.homeTeamId(), g.awayTeamId(), false)));
        var expected = simulator.simulate(state, expectedProbabilities, Map.of(), 100, OddsService.seed(state, "madden"), SimulationService.Rules.MADDEN);
        historical.conferences().forEach(c -> c.teams().forEach(t ->
                assertThat(t.odds().playoffs()).isEqualTo(expected.teams().get(t.team().abbrName()).playoffs() / 100.0)));
    }

    @Test
    void invalidRulesAndMissingSeasonReturnContractStatuses() throws Exception {
        http.perform(get("/api/playoffs/odds?rules=unknown")).andExpect(status().isBadRequest());
        http.perform(get("/api/playoffs/odds?season=99")).andExpect(status().isNotFound());
    }
}
