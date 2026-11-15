package com.rzs.stats.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rzs.stats.model.dto.EloConfig;
import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.repository.EloConfigRepository;
import com.rzs.stats.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class EloControllerTest {
    @Mock GameRepository games;
    @Mock EloConfigRepository configs;
    private MockMvc mvc;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        var configService = new EloConfigService(configs);
        var engine = new EloService();
        var queries = new EloQueryService(new EloHistoryService(games, configService, engine), engine);
        mvc = MockMvcBuilders.standaloneSetup(new StatsController(null, queries),
                new AdminController(null, null, games, null, configService)).build();
    }

    private GameEntity game(int id, int season, int week, int score) {
        var a = new TeamEntity(); a.setTeamId(1); a.setAbbrName("A"); a.setDisplayName("Alpha");
        var b = new TeamEntity(); b.setTeamId(2); b.setAbbrName("B"); b.setDisplayName("Beta");
        var g = new GameEntity(); g.setGameId(id); g.setSeasonIndex(season); g.setStageIndex(1);
        g.setWeekIndex(week); g.setStatus(2); g.setHomeTeam(a); g.setAwayTeam(b); g.setHomeScore(score); g.setAwayScore(0);
        return g;
    }

    @Test
    void ratingsDefaultToLatestWeekAndSupportSeasonAndWeekFilters() throws Exception {
        when(games.findAllForElo()).thenReturn(List.of(game(1, 0, 0, 7), game(2, 0, 1, 0), game(3, 1, 0, 14)));
        mvc.perform(get("/api/elo/ratings")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].teamId").value(1)).andExpect(jsonPath("$[0].gamesCounted").value(3))
                .andExpect(jsonPath("$[0].rank").value(1)).andExpect(jsonPath("$[0].prevRank").value(1))
                .andExpect(jsonPath("$[0].rankChange").value(0)).andExpect(jsonPath("$[0].abbrName").value("A"));
        mvc.perform(get("/api/elo/ratings").param("season", "0")).andExpect(jsonPath("$[0].gamesCounted").value(2));
        mvc.perform(get("/api/elo/ratings").param("season", "0").param("week", "0"))
                .andExpect(jsonPath("$[0].elo").value(1526.0)).andExpect(jsonPath("$[0].change").value(26.0));
        mvc.perform(get("/api/elo/ratings").param("season", "99")).andExpect(content().json("[]"));
    }

    @Test
    void historyAndGameDetailsExposeAllSeasonsAndFilterCorrectly() throws Exception {
        when(games.findAllForElo()).thenReturn(List.of(game(1, 0, 0, 7), game(2, 1, 18, 14)));
        mvc.perform(get("/api/elo/history")).andExpect(jsonPath("$.length()").value(4));
        mvc.perform(get("/api/elo/history").param("season", "1")).andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].seasonStart").value(true)).andExpect(jsonPath("$[0].startElo").value(1523.4));
        var previous = new EloService().play(new EloService.Game(1, 1L, 0, 1, 0,
                new EloService.Team(1, "A", "Alpha"), new EloService.Team(2, "B", "Beta"), 7, 0),
                1500, 1500, EloConfig.defaults()).homePostgameElo();
        var snapshot = new EloService().play(new EloService.Game(2, 2L, 1, 1, 18,
                new EloService.Team(1, "A", "Alpha"), new EloService.Team(2, "B", "Beta"), 14, 0),
                1500 + (previous - 1500) * 0.9, 1500 - (previous - 1500) * 0.9, EloConfig.defaults());
        mvc.perform(get("/api/elo/ratings"))
                .andExpect(jsonPath("$[0].change").value(Math.round((snapshot.homePostgameElo() - previous) * 10) / 10.0));
        mvc.perform(get("/api/elo/games")).andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].homePregameElo").value(1500)).andExpect(jsonPath("$[0].homeWinProbability").value(0.5))
                .andExpect(jsonPath("$[0].margin").value(7)).andExpect(jsonPath("$[0].pointsMoved").value(26.0))
                .andExpect(jsonPath("$[0].homePostgameElo").value(1526.0)).andExpect(jsonPath("$[0].awayPostgameElo").value(1474.0));
        mvc.perform(get("/api/elo/games").param("season", "1").param("week", "18").param("teamId", "2"))
                .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].gameId").value(2));
        mvc.perform(get("/api/elo/games").param("teamId", "99")).andExpect(content().json("[]"));
    }

    @Test
    void matchupUsesCurrentUnroundedRatingsAndOptionalHomeTeam() throws Exception {
        var entity = new com.rzs.stats.model.entity.EloConfigEntity();
        entity.update(new EloConfig(1500, 25, 400, true, 21, 100, 0.9));
        when(configs.findById(1L)).thenReturn(java.util.Optional.of(entity));
        when(games.findAllForElo()).thenReturn(List.of(game(1, 0, 0, 0)));
        mvc.perform(get("/api/elo/matchup").param("teamA", "1").param("teamB", "2"))
                .andExpect(jsonPath("$.teamAWinProbability").value(org.hamcrest.Matchers.closeTo(0.4899227, 0.00001)));
        String neutral = mvc.perform(get("/api/elo/matchup").param("teamA", "1").param("teamB", "2"))
                .andReturn().getResponse().getContentAsString();
        String home = mvc.perform(get("/api/elo/matchup").param("teamA", "1").param("teamB", "2").param("homeTeam", "1"))
                .andReturn().getResponse().getContentAsString();
        assertThat(mapper.readTree(home).get("teamAWinProbability").asDouble())
                .isGreaterThan(mapper.readTree(neutral).get("teamAWinProbability").asDouble());
        mvc.perform(get("/api/elo/matchup").param("teamA", "1").param("teamB", "99")).andExpect(status().isNotFound());
        mvc.perform(get("/api/elo/matchup").param("teamA", "1").param("teamB", "1")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/elo/matchup").param("teamA", "1").param("teamB", "2").param("homeTeam", "99")).andExpect(status().isBadRequest());
    }

    @ParameterizedTest
    @ValueSource(strings = {"\"k\":0", "\"k\":101", "\"offseasonRetention\":-0.1", "\"offseasonRetention\":1.1",
            "\"divisor\":0", "\"marginCap\":0", "\"initialRating\":-1", "\"k\":\"NaN\"", "\"homeFieldAdvantage\":\"Infinity\""})
    void invalidConfigurationReturns400(String field) throws Exception {
        var node = mapper.valueToTree(EloConfig.defaults());
        var override = mapper.readTree("{" + field + "}");
        ((com.fasterxml.jackson.databind.node.ObjectNode) node).setAll((com.fasterxml.jackson.databind.node.ObjectNode) override);
        mvc.perform(put("/api/admin/elo/config").contentType("application/json").content(mapper.writeValueAsString(node)))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(configs);
    }

    @Test
    void configurationCanBeReadAndSaved() throws Exception {
        mvc.perform(get("/api/admin/elo/config")).andExpect(jsonPath("$.k").value(25));
        mvc.perform(put("/api/admin/elo/config").contentType("application/json")
                .content(mapper.writeValueAsString(new EloConfig(1500, 30, 500, false, 14, 25, 1))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.k").value(30));
        verify(configs).save(org.mockito.ArgumentMatchers.argThat(e -> e.config().k() == 30));
    }
}
