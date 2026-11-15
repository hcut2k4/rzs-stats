package com.rzs.stats.controller;

import com.rzs.stats.client.NeonSportzClient;
import com.rzs.stats.config.AdminTokenFilter;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.service.CacheWarmingService;
import com.rzs.stats.service.SyncService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest({AdminController.class, AdminAuthController.class})
@Import(AdminTokenFilter.class)
class AdminTokenUnsetTest {

    @Autowired MockMvc mvc;
    @MockBean com.rzs.stats.service.EloConfigService eloConfig;
    @MockBean SyncService syncService;
    @MockBean NeonSportzClient client;
    @MockBean GameRepository gameRepository;
    @MockBean CacheWarmingService cacheWarmingService;

    @Test
    void adminStaysOpenWhenNoTokenIsConfigured() throws Exception {
        mvc.perform(get("/api/admin/auth")).andExpect(status().isOk());
    }
}
