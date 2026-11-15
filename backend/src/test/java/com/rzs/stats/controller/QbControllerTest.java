package com.rzs.stats.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rzs.stats.model.dto.QbDtos;
import com.rzs.stats.model.dto.QbStatDto;
import com.rzs.stats.service.QbStatsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.ArrayList;
import java.util.List;
import static com.rzs.stats.service.QbStatsService.Scope.SEASON;
import static com.rzs.stats.service.QbStatsService.Stage.REGULAR;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class QbControllerTest {
    @Mock QbStatsService service;
    MockMvc mvc;

    @BeforeEach
    void setUp() { mvc = MockMvcBuilders.standaloneSetup(new QbController(service)).build(); }

    @Test
    void leaderboardAcceptsFrontendLowercaseParametersAndPreservesExactFields() throws Exception {
        QbStatDto row = new QbStatDto();
        row.rosterId = "123";
        when(service.leaderboard(SEASON, 0, null, REGULAR, null, false)).thenReturn(List.of(row));
        var result = mvc.perform(get("/api/qb/leaderboard").param("scope", "season").param("season", "0").param("stage", "regular"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].rosterId").value("123")).andReturn();
        var json = new ObjectMapper().readTree(result.getResponse().getContentAsString()).get(0);
        List<String> fields = new ArrayList<>();
        json.fieldNames().forEachRemaining(fields::add);
        assertThat(fields).containsExactlyInAnyOrder("rosterId", "playerName", "teamAbbr", "teamName", "gamesPlayed",
                "tanya", "passOnly", "deltaRush", "anya", "passerRating", "passAtt", "passComp", "passYds", "passTd", "passInt",
                "tdPct", "intPct", "tdToInt", "passSacks", "sackYardsLost", "fumblesLost", "rushAtt", "rushYds", "rushTd",
                "rushYdsPerAtt", "qualified", "rank", "rankChange");
    }

    @Test
    void invalidScopeOrWeekReturnsBadRequest() throws Exception {
        mvc.perform(get("/api/qb/leaderboard").param("scope", "other")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/qb/leaderboard").param("week", "23")).andExpect(status().isBadRequest());
    }

    @Test
    void movementReturnsExpectedCollections() throws Exception {
        when(service.movement(0, REGULAR, 1)).thenReturn(new QbDtos.Movement(List.of(), List.of(), List.of()));
        mvc.perform(get("/api/qb/movement").param("season", "0"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.risers").isArray())
                .andExpect(jsonPath("$.fallers").isArray()).andExpect(jsonPath("$.series").isArray());
    }
}
