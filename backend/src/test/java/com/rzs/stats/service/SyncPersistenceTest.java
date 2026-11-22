package com.rzs.stats.service;

import com.rzs.stats.config.*;
import com.rzs.stats.controller.SyncStatusController;
import com.rzs.stats.model.entity.*;
import com.rzs.stats.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.cache.CacheType;
import org.springframework.boot.test.autoconfigure.core.AutoConfigureCache;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.boot.autoconfigure.jackson.JacksonAutoConfiguration;
import com.fasterxml.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@DataJpaTest(showSql = false)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@AutoConfigureCache(cacheProvider = CacheType.CAFFEINE)
@EnableCaching
@Import({CacheNames.class, SyncStatusService.class, EloConfigService.class, SyncStatusController.class, JacksonAutoConfiguration.class})
class SyncPersistenceTest {
    @Autowired SyncStatusRepository rows;
    @Autowired SyncStatusService status;
    @Autowired TeamRepository teams;
    @Autowired GameRepository games;
    @Autowired EloConfigService config;
    @Autowired CacheManager caches;
    @Autowired PlayoffCacheInvalidation invalidation;
    @Autowired SyncStatusController controller;
    @Autowired ObjectMapper json;
    @Autowired jakarta.persistence.EntityManagerFactory entityManagerFactory;

    @BeforeEach
    @AfterEach
    void clear() {
        rows.deleteAll(); games.deleteAll(); teams.deleteAll();
        caches.getCacheNames().forEach(name -> caches.getCache(name).clear());
        invalidation.takeWarm();
    }

    @Test
    void lastSuccessfulSyncSurvivesServiceRecreationAndUnchangedSyncKeepsCaches() {
        assertThat(status.lastSyncAt()).isNull();
        status.successful(2);
        var saved = rows.findById(1L).orElseThrow();
        assertThat(saved.getLastFingerprint()).hasSize(64);
        assertThat(invalidation.takeWarm()).isTrue();
        CacheNames.PLAYOFF.forEach(name -> caches.getCache(name).put("keep", "value"));
        var restarted = new SyncStatusService(rows, games, teams, config, invalidation);
        assertThat(restarted.lastSyncAt()).isEqualTo(saved.getLastSyncAt());
        status.successful(2);
        assertThat(invalidation.takeWarm()).isFalse();
        CacheNames.PLAYOFF.forEach(name -> assertThat(caches.getCache(name).get("keep", String.class)).isEqualTo("value"));
        assertThat(rows.count()).isEqualTo(1);
    }

    @Test
    void changedScoreStatusWeekMetadataAndConfigInvalidatePlayoffCaches() {
        var home = new TeamEntity(); home.setTeamId(1); home.setAbbrName("A"); home.setConference("AFC"); home.setDivision("East");
        var away = new TeamEntity(); away.setTeamId(2); away.setAbbrName("B"); away.setConference("AFC"); away.setDivision("West");
        teams.save(home); teams.save(away);
        var game = new GameEntity(); game.setGameId(1); game.setSeasonIndex(2); game.setStageIndex(1); game.setWeekIndex(1);
        game.setStatus(0); game.setHomeTeam(home); game.setAwayTeam(away); games.save(game);
        status.successful(2); invalidation.takeWarm();
        var mutations = java.util.List.<Runnable>of(
                () -> game.setHomeScore(24), () -> game.setAwayScore(17), () -> game.setStatus(2),
                () -> game.setWeekIndex(2), () -> game.setSeasonIndex(0), () -> game.setStageIndex(2),
                () -> { home.setDisplayName("Renamed"); teams.save(home); },
                () -> { home.setAbbrName("REN"); teams.save(home); }, () -> { home.setConference("NFC"); teams.save(home); },
                () -> { home.setDivision("South"); teams.save(home); });
        for (var mutate : mutations) {
            caches.getCache("playoffOdds").put("old", "value");
            String previous = rows.findById(1L).orElseThrow().getLastFingerprint();
            mutate.run(); games.save(game); status.successful(2);
            assertThat(rows.findById(1L).orElseThrow().getLastFingerprint()).isNotEqualTo(previous);
            assertThat(caches.getCache("playoffOdds").get("old")).isNull();
            assertThat(invalidation.takeWarm()).isTrue();
        }
        caches.getCache("playoffBaseline").put("old", "value");
        config.update(new com.rzs.stats.model.dto.EloConfig(1500, 30, 400, true, 28, 0, .78));
        assertThat(caches.getCache("playoffBaseline").get("old")).isNull();
        assertThat(invalidation.takeWarm()).isTrue();
    }

    @Test
    void fingerprintStreamsScalarRowsWithoutLoadingGameOrTeamEntities() {
        var team = new TeamEntity(); team.setTeamId(1); team.setAbbrName("A"); teams.saveAndFlush(team);
        for (int i = 0; i < 30; i++) {
            var game = new GameEntity(); game.setGameId(i); game.setSeasonIndex(i % 3); game.setHomeTeam(team);
            games.saveAndFlush(game);
        }
        var statistics = entityManagerFactory.unwrap(org.hibernate.SessionFactory.class).getStatistics();
        boolean enabled = statistics.isStatisticsEnabled();
        statistics.setStatisticsEnabled(true);
        statistics.clear();
        try {
            assertThat(status.fingerprint(2)).hasSize(64);
            assertThat(statistics.getEntityStatistics(GameEntity.class.getName()).getLoadCount()).isZero();
            assertThat(statistics.getEntityStatistics(TeamEntity.class.getName()).getLoadCount()).isZero();
            assertThat(statistics.getPrepareStatementCount()).isEqualTo(3);
        } finally { statistics.setStatisticsEnabled(enabled); }
    }

    @Test
    void correctionsToEarlierSeasonsInvalidateCurrentPlayoffCaches() {
        var historical = new GameEntity(); historical.setGameId(7); historical.setSeasonIndex(0);
        historical.setStatus(2); historical.setHomeScore(21); historical.setAwayScore(7);
        games.saveAndFlush(historical);
        status.successful(2);
        var previous = rows.findById(1L).orElseThrow().getLastFingerprint();
        CacheNames.PLAYOFF.forEach(name -> caches.getCache(name).put("old", "value"));
        historical.setAwayScore(28); games.saveAndFlush(historical);
        status.successful(2);
        assertThat(rows.findById(1L).orElseThrow().getLastFingerprint()).isNotEqualTo(previous);
        CacheNames.PLAYOFF.forEach(name -> assertThat(caches.getCache(name).get("old")).isNull());
    }

    @Test
    void statusEndpointReturnsNullThenPersistedIsoTimestamp() throws Exception {
        var http = MockMvcBuilders.standaloneSetup(controller)
                .setMessageConverters(new MappingJackson2HttpMessageConverter(json)).build();
        http.perform(get("/api/sync/status")).andExpect(status().isOk()).andExpect(content().json("{\"lastSyncAt\":null}"));
        status.successful(2);
        http.perform(get("/api/sync/status")).andExpect(status().isOk())
                .andExpect(jsonPath("$.lastSyncAt").value(status.lastSyncAt().toString()));
    }

    @Test
    void playoffCachesHaveSizeBoundsWithoutExpiration() {
        for (String name : CacheNames.PLAYOFF) {
            var nativeCache = (com.github.benmanes.caffeine.cache.Cache<?, ?>) caches.getCache(name).getNativeCache();
            assertThat(nativeCache.policy().expireAfterWrite()).isEmpty();
            assertThat(nativeCache.policy().expireAfterAccess()).isEmpty();
            assertThat(nativeCache.policy().eviction()).isPresent();
        }
    }
}
