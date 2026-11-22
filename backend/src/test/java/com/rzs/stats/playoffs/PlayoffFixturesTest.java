package com.rzs.stats.playoffs;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.rzs.stats.config.*;
import com.rzs.stats.controller.*;
import com.rzs.stats.model.entity.*;
import com.rzs.stats.repository.*;
import com.rzs.stats.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.cache.CacheType;
import org.springframework.boot.autoconfigure.jackson.JacksonAutoConfiguration;
import org.springframework.boot.test.autoconfigure.core.AutoConfigureCache;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.file.*;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DataJpaTest(showSql = false, properties = {"playoffs.simulations=100", "playoffs.path-simulations=100",
        "playoffs.leverage-simulations=100", "rzs.playoffs.clinch.max-remaining-games=4"})
@AutoConfigureCache(cacheProvider = CacheType.CAFFEINE)
@EnableCaching
@Import({JacksonAutoConfiguration.class, CacheNames.class, ComputeGate.class, SeasonStateLoader.class,
        SimulationService.class, OddsService.class, LeverageService.class, ClinchService.class, PathService.class,
        ScenarioService.class, ChampionshipService.class, PlayoffPictureService.class, WhatIfService.class,
        OddsSnapshotService.class, OddsHistoryService.class, EloQueryService.class, EloHistoryService.class,
        EloService.class, EloConfigService.class, OwnerChangeService.class, EloCalibrationService.class,
        SyncStatusService.class, PlayoffsController.class, PlayoffsLeverageController.class,
        PlayoffsWhatIfController.class, PlayoffsPathController.class, PlayoffsChampionshipController.class,
        PlayoffsOddsHistoryController.class, EloCalibrationController.class, SyncStatusController.class})
class PlayoffFixturesTest {
    @Autowired TeamRepository teams;
    @Autowired GameRepository games;
    @Autowired CacheManager caches;
    @Autowired ObjectMapper json;
    @Autowired PlayoffsController playoffs;
    @Autowired PlayoffsLeverageController leverage;
    @Autowired PlayoffsWhatIfController whatIf;
    @Autowired PlayoffsPathController path;
    @Autowired PlayoffsChampionshipController championship;
    @Autowired PlayoffsOddsHistoryController history;
    @Autowired EloCalibrationController calibration;
    @Autowired SyncStatusController sync;
    @Autowired SyncStatusService syncStatus;
    @Autowired OddsService odds;
    @Autowired OddsSnapshotService snapshots;
    @Autowired ChampionshipService championshipService;
    @Autowired EloQueryService elo;
    @Autowired OddsSnapshotRepository snapshotRows;
    MockMvc http;

    @BeforeEach
    void setup() {
        caches.getCacheNames().forEach(n -> caches.getCache(n).clear());
        http = MockMvcBuilders.standaloneSetup(playoffs, leverage, whatIf, path, championship, history, calibration, sync)
                .setMessageConverters(new MappingJackson2HttpMessageConverter(json))
                .setControllerAdvice(new WhatIfExceptionHandler()).build();
    }

    void populate(int remaining) throws Exception { populate(teams, games, remaining); }

    static void populate(TeamRepository teams, GameRepository games, int remaining) throws Exception {
        var source = SimulationServiceTest.season(true);
        var stored = new HashMap<String, TeamEntity>();
        for (var t : source.teams()) {
            var entity = new TeamEntity();
            entity.setTeamId(stored.size() + 1); entity.setAbbrName(t.abbr()); entity.setDisplayName(t.abbr());
            entity.setConference(t.conference()); entity.setDivision(t.division());
            stored.put(t.abbr(), teams.save(entity));
        }
        int id = 0;
        for (var g : source.completedGames()) {
            var entity = new GameEntity();
            entity.setGameId(++id); entity.setSeasonIndex(2); entity.setStageIndex(1); entity.setWeekIndex(g.week());
            entity.setHomeTeam(stored.get(g.home())); entity.setAwayTeam(stored.get(g.away()));
            boolean completed = id <= source.completedGames().size() - remaining;
            entity.setStatus(completed ? 2 : 0);
            if (completed) { entity.setHomeScore(g.homeScore()); entity.setAwayScore(g.awayScore()); }
            games.save(entity);
        }
        games.flush();
    }

    @Test
    void responsesMatchCheckedInFrontendFixtures() throws Exception {
        populate(32);
        fixture("odds", read("/api/playoffs/odds?season=2"));
        fixture("picture", read("/api/playoffs/picture?season=2"));
        fixture("leverage", read("/api/playoffs/leverage?season=2"));
        var remaining = read("/api/playoffs/remaining?season=2");
        fixture("remaining", remaining);
        fixture("clinch", read("/api/playoffs/clinch?season=2"));
        fixture("calibration", read("/api/playoffs/calibration?season=2"));
        fixture("championship", read("/api/playoffs/championship?season=2"));
        String abbr = remaining.at("/games/0/home/abbrName").asText();
        fixture("path", read("/api/playoffs/path/" + abbr + "?season=2"));
        int gameId = remaining.at("/games/0/gameId").asInt();
        fixture("simulate", simulate("{\"season\":2,\"simulations\":100,\"picks\":[{\"gameId\":" + gameId + ",\"result\":\"home\"}]}"));
        var picks = json.createArrayNode();
        for (var g : remaining.get("games")) picks.addObject().put("gameId", g.get("gameId").asInt()).put("result", "home");
        var exact = json.createObjectNode().put("season", 2).put("simulations", 100).set("picks", picks);
        fixture("simulate-exact", simulate(json.writeValueAsString(exact)));
        snapshots.save(odds.odds(2, "madden"));
        fixture("odds-history", read("/api/playoffs/odds/history?season=2"));
        fixture("sync-status-empty", read("/api/sync/status"));
        syncStatus.successful(2);
        fixture("sync-status", read("/api/sync/status"));
        var unplayed = games.findBySeasonIndex(2).stream().filter(g -> g.getStatus() < 2).toList();
        for (int i = 0; i < unplayed.size() - 2; i++) {
            var g = unplayed.get(i); g.setStatus(2); g.setHomeScore(24); g.setAwayScore(17);
        }
        games.flush(); clear();
        fixture("path-scenarios", read("/api/playoffs/path/" + abbr + "?season=2"));
        for (var g : unplayed) { g.setStatus(2); g.setHomeScore(24); g.setAwayScore(17); }
        games.flush(); clear();
        fixture("championship-preplayoff", read("/api/playoffs/championship?season=2"));
    }

    @Test
    void postseasonResultsDoNotMoveFrozenChampionshipProjection() throws Exception {
        populate(0);
        var before = championshipService.championship(2, "madden");
        assertThat(before.preplayoff()).isTrue();
        var regularRatings = elo.currentRatings(2);
        var members = teams.findAll();
        for (int week = 18; week <= 22; week++) {
            var g = new GameEntity();
            g.setGameId(1000 + week); g.setSeasonIndex(2); g.setStageIndex(1); g.setWeekIndex(week);
            g.setHomeTeam(members.getFirst()); g.setAwayTeam(members.getLast());
            g.setHomeScore(70); g.setAwayScore(0); g.setStatus(2); games.save(g);
        }
        games.flush(); clear();
        assertThat(elo.currentRatings(2).teams()).isNotEqualTo(regularRatings.teams());
        assertThat(championshipService.championship(2, "madden").teams()).isEqualTo(before.teams());
    }

    @Test
    void savedSnapshotProvenanceStaysOutOfPublicHistory() throws Exception {
        populate(32);
        var baseline = odds.odds(2, "madden");
        snapshots.save(baseline);
        var live = snapshotRows.findBySeasonAndNextWeek(2, baseline.nextWeek()).getFirst();
        assertThat(live.getModelVersion()).isNotBlank();
        assertThat(live.getEloConfigHash()).hasSize(64);
        assertThat(live.getInputFingerprint()).hasSize(64);
        assertThat(live.getOrigin()).isEqualTo("live");
        assertThat(snapshots.saveIfAbsent(2, 0, () -> new OddsService.Response(2, "madden", null, 0,
                baseline.simulations(), baseline.computedAt(), baseline.conferences(), baseline.provenance()))).isTrue();
        assertThat(snapshotRows.findBySeasonAndNextWeek(2, 0)).allSatisfy(row -> {
            assertThat(row.getOrigin()).isEqualTo("backfill");
            assertThat(row.getModelVersion()).isEqualTo(live.getModelVersion());
        });
        String response = read("/api/playoffs/odds/history?season=2").toString();
        assertThat(response).doesNotContain("modelVersion", "eloConfigHash", "inputFingerprint", "origin");
    }

    void clear() { caches.getCacheNames().forEach(n -> caches.getCache(n).clear()); }

    JsonNode read(String url) throws Exception {
        return json.readTree(http.perform(get(url)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    JsonNode simulate(String body) throws Exception {
        return json.readTree(http.perform(post("/api/playoffs/simulate").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    void fixture(String name, JsonNode response) throws Exception {
        normalize(response);
        Path target = Path.of("../frontend/src/test/fixtures/playoffs", name + ".json");
        if (Boolean.getBoolean("fixtures.update")) {
            Files.createDirectories(target.getParent());
            Files.writeString(target, json.writerWithDefaultPrettyPrinter().writeValueAsString(response) + "\n");
        }
        assertThat(Files.exists(target)).as("Generate %s with -Dfixtures.update=true", target).isTrue();
        assertThat(response).as(name).isEqualTo(json.readTree(Files.readString(target)));
    }

    void normalize(JsonNode node) {
        if (node instanceof ObjectNode object && object.has("computedAt")) object.put("computedAt", "2026-01-01T00:00:00Z");
        if (node instanceof ObjectNode object && object.hasNonNull("lastSyncAt")) object.put("lastSyncAt", "2026-01-01T00:00:00Z");
        node.forEach(this::normalize);
    }
}
