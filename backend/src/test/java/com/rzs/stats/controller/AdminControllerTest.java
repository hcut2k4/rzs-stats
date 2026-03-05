package com.rzs.stats.controller;

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

    @Test
    void postSync_success_returns200WithSuccessTrue() throws Exception {
        when(syncService.sync()).thenReturn(new SyncService.SyncResult(true, "32 teams synced, 256 games added/updated"));

        mvc.perform(post("/api/admin/sync"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("32 teams synced, 256 games added/updated"));
    }

    @Test
    void postSync_failure_returns200WithSuccessFalse() throws Exception {
        when(syncService.sync()).thenReturn(new SyncService.SyncResult(false, "Sync failed: connection refused"));

        mvc.perform(post("/api/admin/sync"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Sync failed: connection refused"));
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
