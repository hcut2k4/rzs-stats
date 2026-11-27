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
    @Autowired QbStatsSyncService qb;
    @Autowired CacheWarmingService warming;
    @Autowired NeonSportzClient client;
    @Autowired GameRepository games;
    @Autowired EloConfigService elo;
    SyncPipeline pipeline;
    MockMvc mvc;

    @BeforeEach
    void setup() {
        pipeline = new SyncPipeline(sync, qb, warming, settings, client);
        mvc = MockMvcBuilders.standaloneSetup(new AdminController(client, games, warming, elo, qb, pipeline, settings))
                .setControllerAdvice(new WhatIfExceptionHandler()).build();
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
