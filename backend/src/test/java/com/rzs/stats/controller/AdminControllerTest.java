package com.rzs.stats.controller;

import com.rzs.stats.service.*;
import com.rzs.stats.client.NeonSportzClient;
import com.rzs.stats.repository.GameRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.util.Map;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AdminController.class)
class AdminControllerTest {
    @Autowired MockMvc mvc;
    @MockBean SyncService sync;
    @MockBean QbStatsSyncService qb;
    @MockBean CacheWarmingService warming;
    @MockBean SyncPipeline pipeline;
    @MockBean SyncSettingsService settings;
    @MockBean NeonSportzClient client;
    @MockBean GameRepository games;
    @MockBean EloConfigService elo;

    @Test
    void syncStartsThroughSharedPipeline() throws Exception {
        when(pipeline.start(SyncPipeline.Mode.FULL)).thenReturn(Map.of("success", true, "message", "Sync started"));
        mvc.perform(post("/api/admin/sync")).andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true));
        verify(pipeline).start(SyncPipeline.Mode.FULL);
    }

    @Test
    void busySyncReturnsConflict() throws Exception {
        when(pipeline.start(SyncPipeline.Mode.FULL)).thenThrow(new SyncPipeline.BusyException());
        mvc.perform(post("/api/admin/sync")).andExpect(status().isConflict()).andExpect(content().string("already running"));
    }

    @Test
    void statusExposesRunningOutcome() throws Exception {
        when(pipeline.getStatus()).thenReturn(new SyncPipeline.Status(true, "running", "Running", null, null));
        mvc.perform(get("/api/admin/sync/status")).andExpect(status().isOk())
                .andExpect(jsonPath("$.inProgress").value(true)).andExpect(jsonPath("$.outcome").value("running"));
    }
}
