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
        PlayoffsController.class, ClinchService.class, PlayoffPictureService.class, CacheNames.class, EloQueryService.class,
        EloHistoryService.class, EloService.class, EloConfigService.class, OwnerChangeService.class})
class OddsServiceTest {
    @Autowired GameRepository games;
    @Autowired TeamRepository teams;
    @Autowired OddsSnapshotRepository snapshots;
    @Autowired OddsSnapshotService writer;
    @Autowired OddsService odds;
    @Autowired EloQueryService elo;
    @Autowired EloConfigService configs;
    @Autowired PlayoffsController controller;
    @Autowired CacheManager caches;
    MockMvc http;
    final ObjectMapper json = new ObjectMapper();

    @BeforeEach
    void setup() {
        caches.getCacheNames().forEach(n -> caches.getCache(n).clear());
        http = MockMvcBuilders.standaloneSetup(controller).build();
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
    void invalidRulesAndMissingSeasonReturnContractStatuses() throws Exception {
        http.perform(get("/api/playoffs/odds?rules=unknown")).andExpect(status().isBadRequest());
        http.perform(get("/api/playoffs/odds?season=99")).andExpect(status().isNotFound());
    }
}
