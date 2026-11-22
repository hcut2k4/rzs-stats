package com.rzs.stats.controller;

import com.rzs.stats.config.CacheNames;
import com.rzs.stats.model.dto.EloConfig;
import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.repository.TeamRepository;
import com.rzs.stats.service.EloCalibrationService;
import com.rzs.stats.service.EloConfigService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cache.CacheManager;
import org.springframework.cache.interceptor.CacheResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.closeTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "rzs.admin-token=calibration-test")
@AutoConfigureMockMvc
@Transactional
class EloCalibrationControllerTest {
    @Autowired MockMvc mvc;
    @Autowired GameRepository games;
    @Autowired TeamRepository teams;
    @Autowired EloConfigService configs;
    @Autowired EloCalibrationService calibration;
    @Autowired CacheManager caches;
    @Autowired CacheNames cacheNames;
    private int nextId;

    @BeforeEach
    void setUp() {
        caches.getCacheNames().forEach(name -> caches.getCache(name).clear());
        nextId = 1;
    }

    @Test
    void publicReportAveragesProbabilitiesAndCountsATieAsHalf() throws Exception {
        configs.update(new EloConfig(1500, 25, 100, false, 21, 100 * Math.log10(5.0 / 3), 0.9));
        game(0, 1, 0, 2, 14, 0);
        game(0, 1, 1, 2, 0, 14);
        game(0, 1, 17, 3, 7, 7);

        mvc.perform(get("/api/playoffs/calibration")).andExpect(status().isOk())
                .andExpect(jsonPath("$.games").value(3))
                .andExpect(jsonPath("$.brier").value(closeTo(35.0 / 192, 1e-12), Double.class))
                .andExpect(jsonPath("$.coinFlipBrier").value(closeTo(1.0 / 6, 1e-12), Double.class))
                .andExpect(jsonPath("$.buckets.length()").value(1))
                .andExpect(jsonPath("$.buckets[0].low").value(0.6))
                .andExpect(jsonPath("$.buckets[0].high").value(0.7))
                .andExpect(jsonPath("$.buckets[0].games").value(3))
                .andExpect(jsonPath("$.buckets[0].predicted").value(closeTo(0.625, 1e-12), Double.class))
                .andExpect(jsonPath("$.buckets[0].actual").value(0.5));
    }

    @Test
    void optionalSeasonIncludesAllSeasonsAndFiltersWhenProvided() throws Exception {
        game(0, 1, 0, 2, 7, 0);
        game(1, 1, 0, 2, 0, 7);

        mvc.perform(get("/api/playoffs/calibration")).andExpect(jsonPath("$.games").value(2));
        mvc.perform(get("/api/playoffs/calibration").param("season", "0"))
                .andExpect(jsonPath("$.games").value(1)).andExpect(jsonPath("$.buckets[0].actual").value(1));
        mvc.perform(get("/api/playoffs/calibration").param("season", "1"))
                .andExpect(jsonPath("$.games").value(1)).andExpect(jsonPath("$.buckets[0].actual").value(0));
    }

    @Test
    void emptyAndUnknownSeasonsReturnAnEmptyReport() throws Exception {
        for (String path : new String[]{"/api/playoffs/calibration", "/api/playoffs/calibration?season=99"}) {
            mvc.perform(get(path)).andExpect(status().isOk())
                    .andExpect(content().json("{\"games\":0,\"brier\":0,\"coinFlipBrier\":0,\"buckets\":[]}", true));
        }
    }

    @Test
    void onlyCompletedRegularSeasonGamesWithScoresCount() throws Exception {
        game(0, 0, 0, 2, 7, 0);
        game(0, 1, -1, 2, 7, 0);
        game(0, 1, 18, 2, 7, 0);
        game(0, 1, 22, 2, 7, 0);
        game(0, 2, 0, 2, 7, 0);
        game(0, 1, 1, 1, 7, 0);
        game(0, 1, 2, 2, null, null);
        game(0, 1, 0, 2, 7, 7);
        game(0, 1, 17, 2, 7, 0);

        mvc.perform(get("/api/playoffs/calibration")).andExpect(status().isOk())
                .andExpect(jsonPath("$.games").value(2))
                .andExpect(jsonPath("$.coinFlipBrier").value(0.125));
    }

    @Test
    void cachedReportIsRecomputedAfterEloConfigurationChanges() {
        game(0, 1, 0, 2, 7, 0);
        var first = calibration.report(null);
        assertThat(calibration.report(null)).isSameAs(first);

        configs.update(new EloConfig(1500, 25, 400, true, 21, 100, 0.9));

        assertThat(calibration.report(null).brier()).isLessThan(first.brier());
    }

    @Test
    void calibrationCacheParticipatesInSharedEviction() {
        calibration.report(null);
        CacheResolver resolver = cacheNames.allStatsCaches(caches);
        assertThat(resolver.resolveCaches(null)).extracting(org.springframework.cache.Cache::getName)
                .contains("eloCalibration");
    }

    private void game(int season, int stage, int week, int status, Integer homeScore, Integer awayScore) {
        var home = new TeamEntity();
        home.setTeamId(nextId++);
        var away = new TeamEntity();
        away.setTeamId(nextId++);
        teams.save(home);
        teams.save(away);
        var game = new GameEntity();
        game.setGameId(nextId);
        game.setSeasonIndex(season);
        game.setStageIndex(stage);
        game.setWeekIndex(week);
        game.setStatus(status);
        game.setHomeTeam(home);
        game.setAwayTeam(away);
        game.setHomeScore(homeScore);
        game.setAwayScore(awayScore);
        games.saveAndFlush(game);
    }
}
