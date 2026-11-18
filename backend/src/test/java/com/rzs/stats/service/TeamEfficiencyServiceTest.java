package com.rzs.stats.service;

import com.rzs.stats.model.dto.TeamEfficiencyDto;
import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.model.entity.TeamGameStatEntity;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.repository.TeamGameStatRepository;
import com.rzs.stats.service.QbStatsService.Stage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TeamEfficiencyServiceTest {
    @Mock TeamGameStatRepository stats;
    @Mock GameRepository games;

    private TeamEfficiencyService service() {
        return new TeamEfficiencyService(stats, games, new TeamEfficiencyCalculator());
    }

    private TeamEntity team(int id) {
        var t = new TeamEntity();
        ReflectionTestUtils.setField(t, "id", (long) id);
        t.setTeamId(id);
        t.setDisplayName("Team " + id);
        t.setAbbrName("T" + id);
        return t;
    }

    private GameEntity game(int week, TeamEntity home, TeamEntity away) {
        var g = new GameEntity();
        g.setWeekIndex(week);
        g.setHomeTeam(home);
        g.setAwayTeam(away);
        return g;
    }

    private TeamGameStatEntity row(int week, TeamEntity team, int tds, int punts) {
        var r = new TeamGameStatEntity();
        r.setTeam(team);
        r.setWeekIndex(week);
        r.setPassTds(tds);
        r.setPunts(punts);
        r.setPassAtt(20);
        r.setTotalYds(200);
        r.setFirstDowns(10);
        r.setThirdAtt(5);
        r.setThirdConv(2);
        r.setRedZones(3);
        r.setRedZoneTds(tds);
        r.setSacks(2);
        return r;
    }

    @Test
    void defenseEqualsOpponentsOffenseAndResultsRankNetPointsWithNullLast() {
        var a = team(1);
        var b = team(2);
        var c = team(3);
        var d = team(4);
        when(games.findCompletedInScope(2, 0, 17)).thenReturn(List.of(game(0, b, a), game(1, c, d)));
        when(stats.findInScope(2, 0, 17)).thenReturn(List.of(
                row(0, a, 3, 1), row(0, b, 1, 3), row(1, c, 0, 0), row(1, d, 1, 1)));
        var result = service().efficiency(2, Stage.REGULAR);
        assertThat(result).extracting(TeamEfficiencyDto::teamId).containsExactly(1, 2, 3, 4);
        assertThat(result.get(0).defense()).isEqualTo(result.get(1).offense());
        assertThat(result.get(1).defense()).isEqualTo(result.get(0).offense());
        assertThat(result.get(0).netPointsPerDrive()).isEqualTo(3.0);
        assertThat(result.get(1).netPointsPerDrive()).isEqualTo(-3.0);
        assertThat(result.subList(2, 4)).allSatisfy(t -> assertThat(t.netPointsPerDrive()).isNull());
        assertThat(result).allSatisfy(t -> assertThat(t.games()).isEqualTo(1));
    }

    @Test
    void gamesMissingEitherStatRowAreExcludedFromTotalsAndGameCounts() {
        var a = team(1);
        var b = team(2);
        when(games.findCompletedInScope(0, 0, 22)).thenReturn(List.of(
                game(0, a, b), game(1, a, b), game(2, a, b)));
        when(stats.findInScope(0, 0, 22)).thenReturn(List.of(
                row(0, a, 1, 1), row(0, b, 1, 1), row(1, a, 9, 0), row(2, b, 8, 0)));
        var result = service().efficiency(0, Stage.BOTH);
        assertThat(result).hasSize(2).allSatisfy(t -> {
            assertThat(t.games()).isEqualTo(1);
            assertThat(t.offense().drives()).isEqualTo(2);
            assertThat(t.offense().pointsPerDrive()).isEqualTo(3.0);
        });
    }

    @ParameterizedTest
    @CsvSource({"true", "false"})
    void completedGamesMissingEitherTeamAreSkippedWhileOtherTeamsRemain(boolean missingHome) {
        var a = team(1);
        var b = team(2);
        var c = team(3);
        when(games.findCompletedInScope(0, 0, 17)).thenReturn(List.of(
                game(0, a, b), game(1, missingHome ? null : c, missingHome ? c : null)));
        when(stats.findInScope(0, 0, 17)).thenReturn(List.of(
                row(0, a, 1, 1), row(0, b, 1, 1), row(1, c, 9, 0)));

        var result = service().efficiency(0, Stage.REGULAR);

        assertThat(result).extracting(TeamEfficiencyDto::teamId).containsExactly(1, 2);
        assertThat(result).allSatisfy(t -> {
            assertThat(t.games()).isEqualTo(1);
            assertThat(t.offense().pointsPerDrive()).isEqualTo(3.0);
        });
    }

    @ParameterizedTest
    @CsvSource({"REGULAR,0,17", "PLAYOFFS,18,22", "BOTH,0,22"})
    void stageScopesBothRepositories(Stage stage, int minWeek, int maxWeek) {
        assertThat(service().efficiency(4, stage)).isEmpty();
        verify(stats).findInScope(4, minWeek, maxWeek);
        verify(games).findCompletedInScope(4, minWeek, maxWeek);
        verifyNoMoreInteractions(stats, games);
    }
}
