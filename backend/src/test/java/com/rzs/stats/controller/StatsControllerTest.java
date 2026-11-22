package com.rzs.stats.controller;

import com.rzs.stats.model.dto.GameDto;
import com.rzs.stats.model.dto.SeasonWeekDto;
import com.rzs.stats.model.dto.StandingDto;
import com.rzs.stats.service.StatsService;
import org.junit.jupiter.api.Test;
import com.rzs.stats.service.EloQueryService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(StatsController.class)
@org.springframework.context.annotation.Import({EloQueryService.class, com.rzs.stats.service.EloService.class,
        com.rzs.stats.service.EloHistoryService.class, com.rzs.stats.service.EloConfigService.class,
        com.rzs.stats.service.OwnerChangeService.class})
class StatsControllerTest {
    @org.springframework.boot.test.mock.mockito.MockBean
    com.rzs.stats.config.PlayoffCacheInvalidation playoffInvalidation;

    @MockBean com.rzs.stats.repository.GameRepository eloGames;
    @MockBean com.rzs.stats.repository.EloConfigRepository eloConfigs;
    @Autowired MockMvc mvc;
    @MockBean StatsService statsService;
    @MockBean com.rzs.stats.service.TeamEfficiencyService efficiencyService;

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

        mvc.perform(get("/api/games").param("season", "4").param("week", "0"))
                .andExpect(status().isOk());

        verify(statsService).getGames(4, 1, 0);
    }

    @Test
    void getAvailableWeeks_returns200WithList() throws Exception {
        when(statsService.getAvailableWeeks(4, 1)).thenReturn(List.of(0, 1, 2, 3));

        mvc.perform(get("/api/games/weeks").param("season", "4").param("stage", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(4));
    }

    @Test
    void getAvailableWeeks_defaultStageIsOne() throws Exception {
        when(statsService.getAvailableWeeks(4, 1)).thenReturn(List.of());

        mvc.perform(get("/api/games/weeks").param("season", "4"))
                .andExpect(status().isOk());

        verify(statsService).getAvailableWeeks(4, 1);
    }

    @Test
    void getStandings_withoutSeason_returns400() throws Exception {
        mvc.perform(get("/api/standings"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(statsService);
    }

    @Test
    void getGames_withoutSeason_returns400() throws Exception {
        mvc.perform(get("/api/games").param("week", "2"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(statsService);
    }

    @Test
    void getGames_withoutWeek_returns400() throws Exception {
        mvc.perform(get("/api/games").param("season", "4"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(statsService);
    }

    @Test
    void getAvailableWeeks_withoutSeason_returns400() throws Exception {
        mvc.perform(get("/api/games/weeks"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(statsService);
    }

    @Test
    void getWeeklyTrends_withoutSeason_returns400() throws Exception {
        mvc.perform(get("/api/trends/weekly"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(statsService);
    }

    @Test
    void getStandings_withNonNumericSeason_returns400() throws Exception {
        mvc.perform(get("/api/standings").param("season", "abc"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(statsService);
    }

    @Test
    void getGames_withNonNumericSeason_returns400() throws Exception {
        mvc.perform(get("/api/games").param("season", "abc").param("week", "2"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(statsService);
    }

    @Test
    void getGames_withNonNumericWeek_returns400() throws Exception {
        mvc.perform(get("/api/games").param("season", "4").param("week", "xyz"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(statsService);
    }

    @Test
    void getGames_withNonNumericStage_returns400() throws Exception {
        mvc.perform(get("/api/games")
                        .param("season", "4")
                        .param("stage", "foo")
                        .param("week", "2"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(statsService);
    }

    @Test
    void getAvailableWeeks_withNonNumericSeason_returns400() throws Exception {
        mvc.perform(get("/api/games/weeks").param("season", "abc"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(statsService);
    }

    @Test
    void getAvailableWeeks_withNonNumericStage_returns400() throws Exception {
        mvc.perform(get("/api/games/weeks").param("season", "4").param("stage", "foo"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(statsService);
    }

    @Test
    void getWeeklyTrends_withNonNumericSeason_returns400() throws Exception {
        mvc.perform(get("/api/trends/weekly").param("season", "abc"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(statsService);
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
    @Test
    void efficiencyReturnsNamedSidesAndDefaultsToRegularSeason() throws Exception {
        var offense = new com.rzs.stats.model.dto.TeamEfficiencyDto.Side(10, 50, 2.5, 0.5, 5.0, 0.6, 0.4, 0.7, 0.1, 0.05);
        var defense = new com.rzs.stats.model.dto.TeamEfficiencyDto.Side(12, 60, 1.5, 0.3, 4.0, 0.5, 0.3, 0.6, 0.2, 0.08);
        var dto = new com.rzs.stats.model.dto.TeamEfficiencyDto(1, "Eagles", "PHI", "Philadelphia", "NFC", "East", "000000", 1,
                2, offense, defense, 1.0);
        when(efficiencyService.efficiency(4, com.rzs.stats.service.QbStatsService.Stage.REGULAR)).thenReturn(List.of(dto));
        var result = mvc.perform(get("/api/efficiency").param("season", "4"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].teamId").value(1))
                .andExpect(jsonPath("$[0].displayName").value("Eagles"))
                .andExpect(jsonPath("$[0].abbrName").value("PHI"))
                .andExpect(jsonPath("$[0].games").value(2))
                .andExpect(jsonPath("$[0].netPointsPerDrive").value(1.0));
        String[] fields = {"drives", "plays", "pointsPerDrive", "pointsPerPlay", "yardsPerPlay", "seriesRate",
                "thirdDownRate", "redZoneTdRate", "giveawayRate", "sackRate"};
        double[] off = {10, 50, 2.5, 0.5, 5.0, 0.6, 0.4, 0.7, 0.1, 0.05};
        double[] def = {12, 60, 1.5, 0.3, 4.0, 0.5, 0.3, 0.6, 0.2, 0.08};
        for (int i = 0; i < fields.length; i++) {
            result.andExpect(jsonPath("$[0].offense." + fields[i]).value(org.hamcrest.Matchers.is(off[i]), Double.class));
            result.andExpect(jsonPath("$[0].defense." + fields[i]).value(org.hamcrest.Matchers.is(def[i]), Double.class));
        }
        verify(efficiencyService).efficiency(4, com.rzs.stats.service.QbStatsService.Stage.REGULAR);
    }

    @Test
    void efficiencyAcceptsCaseInsensitiveStageNames() throws Exception {
        mvc.perform(get("/api/efficiency").param("season", "4").param("stage", "Playoffs"))
                .andExpect(status().isOk());
        verify(efficiencyService).efficiency(4, com.rzs.stats.service.QbStatsService.Stage.PLAYOFFS);
    }

    @Test
    void efficiencyRejectsNumericAndUnknownStages() throws Exception {
        for (String stage : List.of("1", "unknown")) {
            mvc.perform(get("/api/efficiency").param("season", "4").param("stage", stage))
                    .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(efficiencyService);
    }

    @Test
    void efficiencyRequiresANonnegativeSeason() throws Exception {
        mvc.perform(get("/api/efficiency").param("season", "-1")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/efficiency")).andExpect(status().isBadRequest());
        verifyNoInteractions(efficiencyService);
    }

    @Test
    void efficiencySerializesUndefinedRatesAsExplicitNulls() throws Exception {
        var side = new com.rzs.stats.model.dto.TeamEfficiencyDto.Side(0, 0, null, null, null, null, null, null, null, null);
        var dto = new com.rzs.stats.model.dto.TeamEfficiencyDto(1, "Eagles", "PHI", null, null, null, null, null, 1, side, side, null);
        when(efficiencyService.efficiency(0, com.rzs.stats.service.QbStatsService.Stage.REGULAR)).thenReturn(List.of(dto));
        var result = mvc.perform(get("/api/efficiency").param("season", "0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].netPointsPerDrive").value(org.hamcrest.Matchers.nullValue()));
        for (String name : List.of("offense", "defense")) {
            for (String field : List.of("pointsPerDrive", "pointsPerPlay", "yardsPerPlay", "seriesRate", "thirdDownRate",
                    "redZoneTdRate", "giveawayRate", "sackRate")) {
                result.andExpect(jsonPath("$[0]." + name, org.hamcrest.Matchers.hasKey(field)))
                        .andExpect(jsonPath("$[0]." + name + "." + field).value(org.hamcrest.Matchers.nullValue()));
            }
        }
    }
}
