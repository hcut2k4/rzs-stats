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
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest({AdminController.class, AdminAuthController.class, StatsController.class})
@Import(AdminTokenFilter.class)
@TestPropertySource(properties = "rzs.admin-token=secret")
class AdminTokenTest {

    @Autowired MockMvc mvc;
    @MockBean com.rzs.stats.service.EloConfigService eloConfig;
    @MockBean SyncService syncService;
    @MockBean com.rzs.stats.service.QbStatsSyncService qbSync;
    @MockBean NeonSportzClient client;
    @MockBean GameRepository gameRepository;
    @MockBean CacheWarmingService cacheWarmingService;
    @MockBean com.rzs.stats.service.StatsService statsService;
    @MockBean com.rzs.stats.service.TeamEfficiencyService efficiencyService;
    @MockBean com.rzs.stats.service.EloQueryService eloQueryService;

    @Test
    void rejectsAdminRequestWithoutToken() throws Exception {
        mvc.perform(get("/api/admin/auth")).andExpect(status().isUnauthorized());
    }

    @Test
    void rejectsAdminRequestWithWrongToken() throws Exception {
        mvc.perform(get("/api/admin/auth").header("X-Admin-Token", "nope")).andExpect(status().isUnauthorized());
    }

    @Test
    void allowsAdminRequestWithCorrectToken() throws Exception {
        mvc.perform(get("/api/admin/auth").header("X-Admin-Token", "secret")).andExpect(status().isOk());
    }

    @Test
    void protectsEveryAdminEndpoint() throws Exception {
        mvc.perform(get("/api/admin/sync/status")).andExpect(status().isUnauthorized());
    }

    @Test
    void leavesPublicEndpointsOpen() throws Exception {
        mvc.perform(get("/api/seasons")).andExpect(status().isOk());
    }

    @Test
    void letsPreflightRequestsThrough() throws Exception {
        mvc.perform(options("/api/admin/sync")).andExpect(status().is(org.hamcrest.Matchers.not(401)));
    }
}
