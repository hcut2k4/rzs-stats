package com.rzs.stats.controller;

import com.rzs.stats.model.dto.GameDto;
import com.rzs.stats.model.dto.SeasonWeekDto;
import com.rzs.stats.model.dto.StandingDto;
import com.rzs.stats.service.StatsService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(StatsController.class)
class StatsControllerTest {

    @Autowired MockMvc mvc;
    @MockBean StatsService statsService;

    @Test
    void getStandings_returns200WithList() throws Exception {
        StandingDto dto = new StandingDto();
        dto.setTeamId(1);
        dto.setDisplayName("Eagles");
        dto.setWins(8);
        dto.setLosses(0);

        when(statsService.computeStandings(4)).thenReturn(List.of(dto));

        mvc.perform(get("/api/standings").param("season", "4"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].teamId").value(1))
                .andExpect(jsonPath("$[0].displayName").value("Eagles"))
                .andExpect(jsonPath("$[0].wins").value(8));
    }

    @Test
    void getGames_returns200WithList() throws Exception {
        GameDto dto = new GameDto();
        dto.setGameId(101);
        dto.setHomeScore(28);
        dto.setAwayScore(14);

        when(statsService.getGames(4, 1, 2)).thenReturn(List.of(dto));

        mvc.perform(get("/api/games")
                        .param("season", "4")
                        .param("stage", "1")
                        .param("week", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].gameId").value(101))
                .andExpect(jsonPath("$[0].homeScore").value(28));
    }

    @Test
    void getGames_defaultStageIsOne() throws Exception {
        when(statsService.getGames(4, 1, 0)).thenReturn(List.of());

        // stage param omitted → defaults to 1
        mvc.perform(get("/api/games").param("season", "4").param("week", "0"))
                .andExpect(status().isOk());
    }

    @Test
    void getAvailableWeeks_returns200WithList() throws Exception {
        when(statsService.getAvailableWeeks(4, 1)).thenReturn(List.of(0, 1, 2, 3));

        mvc.perform(get("/api/games/weeks").param("season", "4").param("stage", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(4));
    }

    @Test
    void getSeasons_returns200WithList() throws Exception {
        when(statsService.getAvailableSeasons()).thenReturn(List.of(0, 1, 2, 3, 4));

        mvc.perform(get("/api/seasons"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(5));
    }

    @Test
    void getSeasonTrends_returns200() throws Exception {
        when(statsService.getSeasonTrends()).thenReturn(List.of(new SeasonWeekDto(0, null, List.of())));

        mvc.perform(get("/api/trends/season"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].seasonIndex").value(0));
    }

    @Test
    void getWeeklyTrends_returns200() throws Exception {
        when(statsService.getWeeklyTrends(4)).thenReturn(List.of(new SeasonWeekDto(4, 0, List.of())));

        mvc.perform(get("/api/trends/weekly").param("season", "4"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].seasonIndex").value(4));
    }
}
