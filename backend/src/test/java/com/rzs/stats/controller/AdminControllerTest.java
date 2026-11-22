package com.rzs.stats.controller;

import com.rzs.stats.client.NeonSportzClient;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.service.CacheWarmingService;
import com.rzs.stats.service.SyncService;
import org.junit.jupiter.api.Test;
import com.rzs.stats.service.EloConfigService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AdminController.class)
@org.springframework.context.annotation.Import(EloConfigService.class)
class AdminControllerTest {
    @org.springframework.boot.test.mock.mockito.MockBean
    com.rzs.stats.config.PlayoffCacheInvalidation playoffInvalidation;

    @MockBean com.rzs.stats.repository.EloConfigRepository eloConfigs;
    @Autowired MockMvc mvc;
    @MockBean SyncService syncService;
    @MockBean com.rzs.stats.service.QbStatsSyncService qbSync;
    @MockBean NeonSportzClient client;
    @MockBean GameRepository gameRepository;
    @MockBean CacheWarmingService cacheWarmingService;

    @Test
    void postQbSyncReturnsImmediatelyWithStartedMessage() throws Exception {
        mvc.perform(post("/api/admin/sync/qb"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("QB sync started"));
        org.mockito.Mockito.verify(qbSync, org.mockito.Mockito.timeout(1000)).syncAll();
    }

    @Test
    void qbSyncStatusIncludesProgressAndOutcome() throws Exception {
        when(qbSync.getStatus()).thenReturn(new com.rzs.stats.service.QbStatsSyncService.Status(
                false, "Done", Instant.parse("2026-11-14T12:00:00Z"), true));
        mvc.perform(get("/api/admin/sync/qb/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.inProgress").value(false))
                .andExpect(jsonPath("$.message").value("Done"))
                .andExpect(jsonPath("$.completedAt").exists())
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    void manualSyncRunsQbSyncAfterSuccessfulGameSync() throws Exception {
        when(syncService.sync()).thenReturn(new SyncService.SyncResult(true, "ok"));
        mvc.perform(post("/api/admin/sync"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Sync started"));
        verify(qbSync, timeout(1000)).syncIncremental();
        var order = inOrder(syncService, qbSync);
        order.verify(syncService).sync();
        order.verify(qbSync).syncIncremental();
    }

    @Test
    void failedGameSyncSkipsQbSyncAndStillReturnsStarted() throws Exception {
        when(syncService.sync()).thenReturn(new SyncService.SyncResult(false, "failed"));
        mvc.perform(post("/api/admin/sync"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
        verify(syncService, timeout(1000)).sync();
        verify(qbSync, after(100).never()).syncIncremental();
    }

    @Test
    void getSyncStatus_returns200WithStatus() throws Exception {
        Instant now = Instant.parse("2025-01-15T02:00:00Z");
        when(syncService.getStatus()).thenReturn(
                new SyncService.SyncStatus(now, "32 teams synced", true));

        mvc.perform(get("/api/admin/sync/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("32 teams synced"));
    }

    @Test
    void getSyncStatus_beforeAnySync_returns200() throws Exception {
        when(syncService.getStatus()).thenReturn(new SyncService.SyncStatus(null, null, null));

        mvc.perform(get("/api/admin/sync/status"))
                .andExpect(status().isOk());
    }
}
