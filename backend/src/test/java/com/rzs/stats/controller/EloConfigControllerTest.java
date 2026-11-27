package com.rzs.stats.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rzs.stats.config.AdminTokenFilter;
import com.rzs.stats.model.dto.EloConfig;
import com.rzs.stats.service.EloConfigService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DataJpaTest
@Import(EloConfigService.class)
class EloConfigControllerTest {
    @org.springframework.boot.test.mock.mockito.MockBean
    com.rzs.stats.config.PlayoffCacheInvalidation playoffInvalidation;
    @Autowired EloConfigService config;
    @Autowired EntityManager em;
    private MockMvc mvc;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new StatsController(null, null, null, config),
                new AdminController(null, null, null, config, null, null, null))
                .addFilters(new AdminTokenFilter("secret")).build();
    }

    @Test
    void publicGetReturnsPersistedRatingParametersWithoutAnAdminToken() throws Exception {
        var saved = new EloConfig(1400, 30, 500, false, 14, 50, 0.8);
        config.update(saved);
        em.flush();
        em.clear();
        mvc.perform(get("/api/elo/config"))
                .andExpect(status().isOk())
                .andExpect(content().json(mapper.writeValueAsString(saved), true));
    }

    @Test
    void publicConfigRejectsWritesAndLeavesSettingsUnchanged() throws Exception {
        config.seed();
        mvc.perform(put("/api/elo/config").contentType("application/json")
                        .content(mapper.writeValueAsString(new EloConfig(1400, 30, 500, false, 14, 50, 0.8))))
                .andExpect(status().isMethodNotAllowed());
        assertThat(config.get()).isEqualTo(EloConfig.defaults());
    }

    @Test
    void adminConfigStillRequiresATokenForReadsAndWrites() throws Exception {
        config.seed();
        mvc.perform(get("/api/admin/elo/config")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/admin/elo/config").contentType("application/json")
                        .content(mapper.writeValueAsString(EloConfig.defaults())))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/elo/config").header("X-Admin-Token", "secret"))
                .andExpect(status().isOk())
                .andExpect(content().json(mapper.writeValueAsString(EloConfig.defaults()), true));
    }
}
