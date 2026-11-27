package com.rzs.stats.controller;

import com.rzs.stats.client.NeonSportzClient;
import com.rzs.stats.config.*;
import com.rzs.stats.service.*;
import com.rzs.stats.playoffs.*;
import com.rzs.stats.repository.*;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.cache.CacheType;
import org.springframework.boot.test.autoconfigure.core.AutoConfigureCache;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@DataJpaTest(showSql = false, properties = {"playoffs.simulations=10", "playoffs.leverage-simulations=10"})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@AutoConfigureCache(cacheProvider = CacheType.CAFFEINE)
@EnableCaching
@Import({CacheNames.class, SyncService.class, SyncStatusService.class, SyncSettingsService.class,
        NeonSportzClient.class, QbStatsSyncService.class, QbStatsWeekWriter.class, CacheWarmingService.class,
        StatsService.class, QbStatsService.class, QbStatsCalculator.class, TeamEfficiencyService.class,
        TeamEfficiencyCalculator.class, EloHistoryService.class, EloQueryService.class, EloService.class,
        EloConfigService.class, OwnerChangeService.class, ComputeGate.class, SeasonStateLoader.class,
        OddsService.class, OddsSnapshotService.class, LeverageService.class, ChampionshipService.class,
        SimulationService.class, ClinchService.class})
class AdminControllerTest {
    @Autowired SyncService sync;
    @Autowired SyncSettingsService settings;
    @org.springframework.boot.test.mock.mockito.SpyBean QbStatsSyncService qb;
    @Autowired CacheWarmingService warming;
    @org.springframework.boot.test.mock.mockito.SpyBean StatsService stats;
    @Autowired NeonSportzClient client;
    @Autowired GameRepository games;
    @Autowired EloConfigService elo;
    @Autowired org.springframework.cache.CacheManager caches;
    SyncPipeline pipeline;
    MockMvc mvc;

    @BeforeEach
    void setup() {
        pipeline = new SyncPipeline(sync, qb, warming, settings, client);
        mvc = MockMvcBuilders.standaloneSetup(new AdminController(client, games, warming, elo, qb, pipeline, settings))
                .setControllerAdvice(new WhatIfExceptionHandler()).build();
    }

    @Test
    void missingLatestSeasonScheduleDoesNotKeepCacheWarmingDue() {
        org.mockito.Mockito.doReturn(java.util.List.of(1)).when(stats).getAvailableSeasons();
        assertThatThrownBy(() -> new SeasonStateLoader(games).load(1))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
                .hasMessageContaining("404").hasMessageContaining("No regular-season data");
        pipeline.exclusive("Cache rebuild", () -> { pipeline.warm(); return null; });
        assertThat(warming.getStatus().success()).isTrue();
        assertThat(pipeline.getStatus().success()).isTrue();
        assertThat(org.springframework.test.util.ReflectionTestUtils.getField(pipeline, "warmRequired")).isEqualTo(false);
        assertThat(caches.getCache("standings").getNativeCache()).isInstanceOf(com.github.benmanes.caffeine.cache.Cache.class);
    }

    @Test
    void statusSamplingCannotCrossAnOperationCompletion() throws Exception {
        var workEntered = new CountDownLatch(1);
        var finishWork = new CountDownLatch(1);
        var phaseSampled = new CountDownLatch(1);
        var finishSample = new CountDownLatch(1);
        org.mockito.Mockito.doAnswer(call -> {
            phaseSampled.countDown();
            assertThat(finishSample.await(10, TimeUnit.SECONDS)).isTrue();
            return call.callRealMethod();
        }).when(qb).getStatus();
        var running = CompletableFuture.runAsync(() -> pipeline.exclusive("First", () -> {
            workEntered.countDown();
            try { assertThat(finishWork.await(10, TimeUnit.SECONDS)).isTrue(); }
            catch (InterruptedException e) { throw new RuntimeException(e); }
            return null;
        }));
        try {
            assertThat(workEntered.await(10, TimeUnit.SECONDS)).isTrue();
            var controller = new AdminController(client, games, warming, elo, qb, pipeline, settings);
            var sampling = CompletableFuture.supplyAsync(controller::getStatus);
            assertThat(phaseSampled.await(10, TimeUnit.SECONDS)).isTrue();
            finishWork.countDown();
            assertThatThrownBy(() -> running.get(100, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            finishSample.countDown();
            var sampled = sampling.get(10, TimeUnit.SECONDS).pipeline();
            assertThat(sampled.operation()).isEqualTo("First");
            assertThat(sampled.inProgress()).isTrue();
            assertThat(sampled.completedAt()).isNull();
        } finally { finishWork.countDown(); finishSample.countDown(); }
        running.get(10, TimeUnit.SECONDS);
        assertThat(pipeline.getStatus().completedAt()).isNotNull();
    }

    @Test
    void eloSaveIsGuardedAndReleasesOnlyAfterCommitAndInvalidation() throws Exception {
        var controller = new AdminController(client, games, warming, elo, qb, pipeline, settings);
        var before = elo.get();
        pipeline.exclusive("Auto-sync", () -> {
            assertThatThrownBy(() -> controller.updateEloConfig(before)).hasMessageContaining("Busy: Auto-sync");
            return null;
        });
        caches.getCache("playoffOdds").put("old", "value");
        controller.updateEloConfig(before);
        assertThat(pipeline.getStatus().operation()).isEqualTo("Elo recalculation");
        assertThat(pipeline.getStatus().completedAt()).isNotNull();
        assertThat(caches.getCache("playoffOdds").get("old")).isNull();
        assertThat(elo.get()).isEqualTo(before);
    }


    @Test
    void terminalStatusIsNotVisibleUntilThePermitIsReleased() throws Exception {
        var releasing = new CountDownLatch(1);
        var allowRelease = new CountDownLatch(1);
        var semaphore = new Semaphore(1) {
            @Override public void release() {
                releasing.countDown();
                try { assertThat(allowRelease.await(10, TimeUnit.SECONDS)).isTrue(); }
                catch (InterruptedException e) { throw new RuntimeException(e); }
                super.release();
            }
        };
        org.springframework.test.util.ReflectionTestUtils.setField(pipeline, "lock", semaphore);
        var worker = CompletableFuture.runAsync(() -> pipeline.exclusive("First", () -> null));
        try {
            assertThat(releasing.await(10, TimeUnit.SECONDS)).isTrue();
            var reading = new CountDownLatch(1);
            var status = CompletableFuture.supplyAsync(() -> { reading.countDown(); return pipeline.getStatus(); });
            assertThat(reading.await(10, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> status.get(100, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            allowRelease.countDown();
            assertThat(status.get(10, TimeUnit.SECONDS).inProgress()).isFalse();
            pipeline.exclusive("Second", () -> null);
            assertThat(pipeline.getStatus().operation()).isEqualTo("Second");
        } finally { allowRelease.countDown(); }
        worker.get(10, TimeUnit.SECONDS);
    }


    @Test
    void combinedStatusIncludesAllServicesAndPersistedSettings() throws Exception {
        settings.update(30);
        settings.checked();
        mvc.perform(get("/api/admin/status")).andExpect(status().isOk())
                .andExpect(jsonPath("$.pipeline.inProgress").value(false))
                .andExpect(jsonPath("$.qb.inProgress").value(false))
                .andExpect(jsonPath("$.warm.inProgress").value(false))
                .andExpect(jsonPath("$.settings.intervalMinutes").value(30))
                .andExpect(jsonPath("$.settings.lastCheckedAt").isNotEmpty())
                .andExpect(jsonPath("$.settings.nextRunAt").isNotEmpty());
    }

    @Test
    void busyRequestsNameTheRunningOperationAndKeepItsStatus() throws Exception {
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var running = CompletableFuture.runAsync(() -> pipeline.exclusive("Auto-sync", () -> {
            entered.countDown();
            try { release.await(10, TimeUnit.SECONDS); }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            return null;
        }));
        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            mvc.perform(post("/api/admin/sync")).andExpect(status().isConflict())
                    .andExpect(content().string("Busy: Auto-sync is running"));
            mvc.perform(get("/api/admin/sync/status")).andExpect(status().isOk())
                    .andExpect(jsonPath("$.operation").value("Auto-sync"))
                    .andExpect(jsonPath("$.startedAt").isNotEmpty())
                    .andExpect(jsonPath("$.outcome").value("running"));
        } finally { release.countDown(); running.get(10, TimeUnit.SECONDS); }
    }
}
