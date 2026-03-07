package com.rzs.stats.controller;

import com.rzs.stats.client.NeonSportzClient;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.service.SyncService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AdminController.class)
class AdminControllerTest {

    @Autowired MockMvc mvc;
    @MockBean SyncService syncService;
    @MockBean NeonSportzClient client;
    @MockBean GameRepository gameRepository;

    @Test
    void postSync_returns200WithStartedMessage() throws Exception {
        mvc.perform(post("/api/admin/sync"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Sync started"));
    }

    @Test
    void postSync_alwaysReturnsStartedRegardlessOfOutcome() throws Exception {
        // Sync runs async; the HTTP response always reflects "started", not the sync result
        mvc.perform(post("/api/admin/sync"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
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
