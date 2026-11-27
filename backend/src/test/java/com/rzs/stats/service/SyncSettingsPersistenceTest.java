package com.rzs.stats.service;

import com.rzs.stats.client.NeonSportzClient;
import com.rzs.stats.config.CacheNames;
import com.rzs.stats.controller.AdminController;
import com.rzs.stats.model.entity.*;
import com.rzs.stats.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.cache.CacheType;
import org.springframework.boot.test.autoconfigure.core.AutoConfigureCache;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import com.rzs.stats.model.ns.NsLeague;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@DataJpaTest(showSql = false)
@AutoConfigureCache(cacheProvider = CacheType.CAFFEINE)
@EnableCaching
@Import({SyncSettingsService.class, SyncService.class, SyncStatusService.class, EloConfigService.class,
        CacheNames.class, NeonSportzClient.class, QbStatsWeekWriter.class})
class SyncSettingsPersistenceTest {
    @Autowired PlatformTransactionManager transactions;
    @Autowired SyncSettingsService settings;
    @Autowired SyncSettingsRepository settingRows;
    @Autowired SyncService sync;
    @Autowired GameRepository games;
    @Autowired TeamRepository teams;
    @Autowired QbStatsWeekWriter writer;
    @Autowired QbGameStatRepository qbRows;
    @Autowired TeamGameStatRepository teamRows;
    @Autowired CacheManager caches;

    @Test
    void asyncReservationRejectsEveryCompetingEntryPointUntilCompletion() throws Exception {
        var pipeline = new SyncPipeline(sync, null, null, settings, null);
        var release = new java.util.concurrent.CountDownLatch(1);
        var finished = new java.util.concurrent.CountDownLatch(1);
        pipeline.start("Holding guard", () -> {
            try { release.await(5, java.util.concurrent.TimeUnit.SECONDS); }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            finally { finished.countDown(); }
        });
        try {
            assertThat(pipeline.getStatus().inProgress()).isTrue();
            var http = MockMvcBuilders.standaloneSetup(
                    new AdminController(null, null, null, null, null, pipeline, settings),
                    new com.rzs.stats.controller.PlayoffsOddsHistoryController(null, pipeline))
                    .setControllerAdvice(new com.rzs.stats.playoffs.WhatIfExceptionHandler()).build();
            for (String endpoint : List.of("/sync", "/sync/force", "/sync/verbose", "/cache/warm", "/sync/qb", "/playoffs/odds/backfill?season=0"))
                http.perform(post("/api/admin" + endpoint)).andExpect(status().isConflict()).andExpect(content().string("Busy: Holding guard is running"));
        } finally {
            release.countDown();
            assertThat(finished.await(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        }
    }

    @Test
    void failedWorkReleasesGuardAndReportsFailure() {
        var pipeline = new SyncPipeline(sync, null, null, settings, null);
        assertThatThrownBy(() -> pipeline.exclusive(() -> { throw new IllegalStateException("failed"); }))
                .hasMessage("failed");
        assertThat(pipeline.getStatus().outcome()).isEqualTo("failed");
        assertThat(pipeline.exclusive(() -> "retried")).isEqualTo("retried");
        assertThat(pipeline.getStatus().outcome()).isEqualTo("completed");
    }

    @Test
    void intervalDefaultsToTwoHoursAndOffPersistsWithoutNextRun() throws Exception {
        assertThat(settings.view().intervalMinutes()).isEqualTo(120);
        var http = MockMvcBuilders.standaloneSetup(new AdminController(null, null, null, null, null, null, settings)).build();
        http.perform(put("/api/admin/sync/settings").contentType("application/json").content("{\"intervalMinutes\":0}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.intervalMinutes").value(0))
                .andExpect(jsonPath("$.nextRunAt").doesNotExist());
        assertThat(settingRows.findById(1L).orElseThrow().getIntervalMinutes()).isZero();
        http.perform(put("/api/admin/sync/settings").contentType("application/json").content("{\"intervalMinutes\":7}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.intervalMinutes").value(7));
        for (String value : List.of("-1", "10081", "null"))
            http.perform(put("/api/admin/sync/settings").contentType("application/json").content("{\"intervalMinutes\":" + value + "}"))
                    .andExpect(status().isBadRequest());
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void intervalAndTimestampUpdatesPreserveEachOtherAcrossInterleavedTransactions() {
        var transaction = new TransactionTemplate(transactions);
        transaction.setPropagationBehavior(Propagation.REQUIRES_NEW.value());
        var league = new NsLeague();
        league.setSeason(1); league.setStage(1); league.setWeek(22);
        try {
            settings.get();
            transaction.executeWithoutResult(outer -> {
                settings.get();
                transaction.executeWithoutResult(inner -> {
                    settings.checked();
                    settings.recordChanges(league, true);
                    settings.fullSucceeded();
                });
                settings.update(30);
            });
            var before = settings.view();
            assertThat(before.intervalMinutes()).isEqualTo(30);
            assertThat(before.lastCheckedAt()).isNotNull();
            assertThat(before.lastChangedAt()).isNotNull();
            assertThat(before.lastFullSuccessAt()).isNotNull();
            transaction.executeWithoutResult(outer -> {
                settings.get();
                transaction.executeWithoutResult(inner -> settings.update(5));
                settings.checked();
                settings.recordChanges(league, false);
                settings.fullSucceeded();
            });
            var after = settings.get();
            assertThat(after.getIntervalMinutes()).isEqualTo(5);
            assertThat(after.getLastChangedAt()).isEqualTo(before.lastChangedAt());
            assertThat(after.getLastCheckedAt()).isAfterOrEqualTo(before.lastCheckedAt());
            assertThat(after.getLastFullSuccessAt()).isAfterOrEqualTo(before.lastFullSuccessAt());
            assertThat(after.getSeason()).isEqualTo(1);
            assertThat(after.getStage()).isEqualTo(1);
            assertThat(after.getWeek()).isEqualTo(22);
        } finally { settingRows.deleteAll(); }
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void failedDispatchReleasesGuardAndReportsFailure(boolean error) {
        var pipeline = new SyncPipeline(sync, null, null, settings, null, command -> {
            if (error) throw new AssertionError("Dispatch failed");
            throw new java.util.concurrent.RejectedExecutionException("Dispatch failed");
        });
        assertThatThrownBy(() -> pipeline.start("Starting", () -> fail("Must not dispatch")))
                .hasMessage("Dispatch failed");
        assertThat(pipeline.getStatus().outcome()).isEqualTo("failed");
        assertThat(pipeline.getStatus().inProgress()).isFalse();
        assertThat(pipeline.exclusive(() -> "retried")).isEqualTo("retried");
    }

    @Test
    void invalidQbSeasonReleasesGuardAndReportsFailure() {
        var pipeline = new SyncPipeline(sync, null, null, settings, null);
        assertThatThrownBy(() -> pipeline.startQb(-1))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
                .hasMessageContaining("400");
        assertThat(pipeline.getStatus().outcome()).isEqualTo("failed");
        assertThat(pipeline.getStatus().inProgress()).isFalse();
        assertThat(pipeline.exclusive(() -> "retried")).isEqualTo("retried");
    }

    @Test
    void workerErrorReleasesGuardAndReportsFailure() {
        var pipeline = new SyncPipeline(sync, null, null, settings, null);
        assertThatThrownBy(() -> pipeline.exclusive(() -> { throw new AssertionError("failed"); }))
                .isInstanceOf(AssertionError.class);
        assertThat(pipeline.getStatus().outcome()).isEqualTo("failed");
        assertThat(pipeline.exclusive(() -> "retried")).isEqualTo("retried");
    }

    @Test
    void unchangedQbWeekPreservesRowsAndCachesWhileCorrectedKickingEvicts() {
        var team = new TeamEntity(); team.setTeamId(1); teams.saveAndFlush(team);
        var qb = new QbGameStatEntity(); qb.setRosterId("qb"); qb.setPlayerName("QB"); qb.setStageIndex(1); qb.setTeam(team);
        var stats = new TeamGameStatEntity(); stats.setTeam(team); stats.setStageIndex(1); stats.setFgMade(1);
        assertThat(writer.replaceWeek(0, 1, 0, List.of(qb), List.of(stats))).isTrue();
        var qbId = qbRows.findAll().getFirst().getId();
        var teamId = teamRows.findAll().getFirst().getId();
        for (String name : List.of("qbStats", "teamEfficiency")) caches.getCache(name).put("keep", "value");
        var sameQb = new QbGameStatEntity(); sameQb.setRosterId("qb"); sameQb.setPlayerName("QB"); sameQb.setStageIndex(1); sameQb.setTeam(team);
        var sameStats = new TeamGameStatEntity(); sameStats.setTeam(team); sameStats.setStageIndex(1); sameStats.setFgMade(1);
        assertThat(writer.replaceWeek(0, 1, 0, List.of(sameQb), List.of(sameStats))).isFalse();
        assertThat(qbRows.findAll().getFirst().getId()).isEqualTo(qbId);
        assertThat(teamRows.findAll().getFirst().getId()).isEqualTo(teamId);
        for (String name : List.of("qbStats", "teamEfficiency")) assertThat(caches.getCache(name).get("keep", String.class)).isEqualTo("value");
        sameStats.setFgMade(2);
        assertThat(writer.replaceWeek(0, 1, 0, List.of(sameQb), List.of(sameStats))).isTrue();
        for (String name : List.of("qbStats", "teamEfficiency")) assertThat(caches.getCache(name).get("keep")).isNull();
    }
}
