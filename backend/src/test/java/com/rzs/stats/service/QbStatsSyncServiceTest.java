package com.rzs.stats.service;

import com.rzs.stats.client.NeonSportzClient;
import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.QbGameStatEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.model.ns.*;
import com.rzs.stats.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import java.util.List;
import java.util.Map;
import java.util.Set;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class QbStatsSyncServiceTest {
    @Mock NeonSportzClient client;
    @Mock GameRepository games;
    @Mock TeamRepository teams;
    @Mock QbGameStatRepository repository;
    @Mock QbStatsWeekWriter writer;
    QbStatsSyncService service;
    TeamEntity team;

    @BeforeEach
    void setUp() {
        service = new QbStatsSyncService(client, games, teams, repository, writer);
        team = new TeamEntity();
        team.setAbbrName("AAA");
    }

    private NsPassingStat passer(String id, String position, int yards) {
        NsPassingStat p = new NsPassingStat();
        p.player__rosterId = id;
        p.player__fullName = "Player " + id;
        p.player__position = position;
        p.team__abbrName = "AAA";
        p.passTotalYds = yards;
        return p;
    }

    private NsRushingStat rusher(String id, String position, int fumbles) {
        NsRushingStat r = new NsRushingStat();
        r.player__rosterId = id;
        r.player__fullName = "Player " + id;
        r.player__position = position;
        r.team__abbrName = "AAA";
        r.rushTotalFum = fumbles;
        return r;
    }

    @Test
    void unionsPassingAndRushingQuarterbacksAndBuildsTeamContextFromAllPositions() {
        NsTeamStat context = new NsTeamStat();
        context.team__abbrName = "AAA";
        context.offTotalPassYds = 270;
        context.offTotalSacks = 3;
        context.offTotalFumLost = 2;
        var p = passer("a", "QB", 200);
        p.passTotalSacks = 1;
        p.passerAvgRating = "95.7";
        var r = rusher("b", "QB", 1);
        var rows = service.buildRows(2, 18, List.of(p, passer("c", "WR", 100)),
                List.of(r, rusher("d", "HB", 2)), List.of(context), Map.of("AAA", team), Set.of("AAA"));
        assertThat(rows).extracting(QbGameStatEntity::getRosterId).containsExactly("a", "b");
        assertThat(rows).allSatisfy(row -> {
            assertThat(row.getSeasonIndex()).isEqualTo(2);
            assertThat(row.getStageIndex()).isEqualTo(1);
            assertThat(row.getWeekIndex()).isEqualTo(18);
            assertThat(row.getTeamPasserYards()).isEqualTo(300);
            assertThat(row.getTeamFumbles()).isEqualTo(3);
            assertThat(row.getTeamFumblesLost()).isEqualTo(2);
        });
        assertThat(rows.getFirst().getPasserRating()).isEqualTo(95.7);
        assertThat(rows.getFirst().getRushFum()).isZero();
        assertThat(rows.getLast().getPassAtt()).isZero();
        assertThat(rows.getLast().getRushAtt()).isZero();
        assertThat(rows.getLast().getRushFum()).isEqualTo(1);
    }

    @Test
    void zeroAttemptRushingRowsRetainSackFumblesForPassingQuarterbacks() {
        NsTeamStat context = new NsTeamStat();
        context.team__abbrName = "AAA";
        var rows = service.buildRows(0, 0, List.of(passer("a", "QB", 100)), List.of(rusher("a", "QB", 2)),
                List.of(context), Map.of("AAA", team), Set.of("AAA"));
        assertThat(rows).hasSize(1);
        assertThat(rows.getFirst().getPassYds()).isEqualTo(100);
        assertThat(rows.getFirst().getRushFum()).isEqualTo(2);
        assertThat(rows.getFirst().getTeamFumbles()).isEqualTo(2);
    }

    private GameEntity game(int week) {
        var g = new GameEntity();
        g.setHomeTeam(team);
        g.setWeekIndex(week);
        return g;
    }

    private void league() {
        NsLeague league = new NsLeague();
        league.setSeason(1);
        when(client.fetchLeagueInfo()).thenReturn(league);
        when(teams.findAll()).thenReturn(List.of(team));
    }

    @Test
    void incrementalSkipsStoredWeeksButRepullsLatestCurrentSeasonWeek() {
        league();
        when(games.findCompletedInScope(0, 0, 22)).thenReturn(List.of(game(17)));
        when(games.findCompletedInScope(1, 0, 22)).thenReturn(List.of(game(0), game(1), game(18)));
        when(repository.existsBySeasonIndexAndStageIndexAndWeekIndex(anyInt(), eq(1), anyInt())).thenReturn(true);
        service.syncIncremental();
        verify(client).fetchPassingStats(1, 1, 18);
        verify(client).fetchRushingStats(1, 1, 18);
        verify(client).fetchTeamsStats(1, 1, 18);
        verify(writer).replaceWeek(1, 1, 18, List.of());
        verifyNoMoreInteractions(writer);
        assertThat(service.getStatus().success()).isTrue();
        assertThat(service.getStatus().inProgress()).isFalse();
        assertThat(service.getStatus().completedAt()).isNotNull();
    }

    @Test
    void fullResyncRepullsAllCompletedWeeksAndIgnoresStoredRows() {
        league();
        when(games.findCompletedInScope(0, 0, 22)).thenReturn(List.of(game(0)));
        when(games.findCompletedInScope(1, 0, 22)).thenReturn(List.of(game(22)));
        service.syncAll();
        verify(writer).replaceWeek(0, 1, 0, List.of());
        verify(writer).replaceWeek(1, 1, 22, List.of());
        verifyNoInteractions(repository);
        assertThat(service.getStatus().success()).isTrue();
    }

    @Test
    void failedFetchDoesNotReplaceStoredWeekAndReportsFailure() {
        league();
        when(games.findCompletedInScope(0, 0, 22)).thenReturn(List.of(game(0)));
        when(client.fetchPassingStats(0, 1, 0)).thenThrow(new IllegalStateException("Unavailable"));
        service.syncAll();
        verifyNoInteractions(writer);
        assertThat(service.getStatus().success()).isFalse();
        assertThat(service.getStatus().message()).contains("Unavailable");
        assertThat(service.getStatus().inProgress()).isFalse();
    }

    @Test
    void weeksWithNoCompletedGamesMakeNoStatsRequests() {
        league();
        service.syncAll();
        verify(client).fetchLeagueInfo();
        verifyNoMoreInteractions(client);
        verifyNoInteractions(writer);
    }
}
