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
    @Mock TeamGameStatRepository teamRepository;
    @Mock QbStatsWeekWriter writer;
    QbStatsSyncService service;
    TeamEntity team;

    @BeforeEach
    void setUp() {
        service = new QbStatsSyncService(client, games, teams, repository, teamRepository, writer);
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

    private List<NsPassingStat> tradedPassing() {
        var wrongTeam = passer("555222907", "QB", 181);
        wrongTeam.team__abbrName = "NO";
        wrongTeam.passTotalAtt = 24;
        var correctTeam = passer("555222907", "QB", 181);
        correctTeam.team__abbrName = "MIN";
        correctTeam.passTotalAtt = 24;
        var other = passer("shough", "QB", 271);
        other.team__abbrName = "NO";
        other.passTotalAtt = 30;
        return List.of(wrongTeam, correctTeam, other);
    }

    private List<NsRushingStat> tradedRushing() {
        var wrongTeam = rusher("555222907", "QB", 1);
        wrongTeam.team__abbrName = "NO";
        wrongTeam.rushTotalYds = 20;
        wrongTeam.rushTotalAtt = 4;
        var correctTeam = rusher("555222907", "QB", 1);
        correctTeam.team__abbrName = "MIN";
        correctTeam.rushTotalYds = 20;
        correctTeam.rushTotalAtt = 4;
        var other = rusher("hb", "HB", 2);
        other.team__abbrName = "NO";
        other.rushTotalYds = 100;
        other.rushTotalAtt = 18;
        return List.of(wrongTeam, correctTeam, other);
    }

    private List<NsTeamStat> tradedTeamStats() {
        var min = new NsTeamStat();
        min.team__abbrName = "MIN";
        min.offTotalPassYds = 181;
        min.offTotalRushYds = 20;
        var no = new NsTeamStat();
        no.team__abbrName = "NO";
        no.offTotalPassYds = 271;
        no.offTotalRushYds = 100;
        return List.of(min, no);
    }

    private Map<String, TeamEntity> tradedTeams() {
        var min = new TeamEntity();
        min.setAbbrName("MIN");
        var no = new TeamEntity();
        no.setAbbrName("NO");
        return Map.of("MIN", min, "NO", no);
    }

    @Test
    void tradedQuarterbackBelongsToMatchingTeamWithoutInflatingEitherTeamsYardsOrFumbles() {
        var rows = service.buildRows(0, 0, tradedPassing(), tradedRushing(), tradedTeamStats(),
                tradedTeams(), Set.of("MIN", "NO"));
        assertThat(rows).hasSize(2);
        var murray = rows.stream().filter(r -> r.getRosterId().equals("555222907")).findFirst().orElseThrow();
        assertThat(murray.getTeam().getAbbrName()).isEqualTo("MIN");
        assertThat(murray.getTeamPasserYards()).isEqualTo(181);
        assertThat(murray.getRushAtt()).isEqualTo(4);
        assertThat(murray.getTeamFumbles()).isEqualTo(1);
        var shough = rows.stream().filter(r -> r.getRosterId().equals("shough")).findFirst().orElseThrow();
        assertThat(shough.getTeam().getAbbrName()).isEqualTo("NO");
        assertThat(shough.getTeamPasserYards()).isEqualTo(271);
        assertThat(shough.getTeamFumbles()).isEqualTo(2);
        assertThat(rows).allSatisfy(r -> assertThat(r.getTeamPasserYards() - r.getTeamNetPassYds()).isZero());
    }

    @Test
    void tradedPlayersAttemptsCountOnlyForTheMatchingTeam() {
        var rows = service.buildTeamRows(0, 0, tradedPassing(), tradedRushing(), tradedTeamStats(),
                List.of(), List.of(), tradedTeams(), Set.of("MIN", "NO"));
        assertThat(rows).hasSize(2);
        assertThat(rows.getFirst().getPassAtt()).isEqualTo(24);
        assertThat(rows.getFirst().getRushAtt()).isEqualTo(4);
        assertThat(rows.getLast().getPassAtt()).isEqualTo(30);
        assertThat(rows.getLast().getRushAtt()).isEqualTo(18);
    }

    @Test
    void rushingDuplicatesUseRushingYardsEvenWithoutPassingRows() {
        var rows = service.buildTeamRows(0, 0, List.of(), tradedRushing(), tradedTeamStats(),
                List.of(), List.of(), tradedTeams(), Set.of("MIN", "NO"));
        assertThat(rows.getFirst().getRushAtt()).isEqualTo(4);
        assertThat(rows.getLast().getRushAtt()).isEqualTo(18);
    }

    @Test
    void rushingDuplicatesFollowPassingTeamEvenWhenRushingYardsFavorAnotherTeam() {
        var contexts = tradedTeamStats();
        contexts.getFirst().offTotalRushYds = 200;
        contexts.getLast().offTotalRushYds = 120;
        var deduped = service.dedupeWeeklyStats(tradedPassing(), tradedRushing(), contexts);
        assertThat(deduped.passing()).filteredOn(p -> p.player__rosterId.equals("555222907"))
                .extracting(p -> p.team__abbrName).containsExactly("MIN");
        assertThat(deduped.rushing()).filteredOn(r -> r.player__rosterId.equals("555222907"))
                .extracting(r -> r.team__abbrName).containsExactly("MIN");
    }

    @Test
    void rushingDuplicatesFollowPassingTeamWhenRushingTeamYardsAreMissing() {
        var contexts = tradedTeamStats();
        contexts.forEach(t -> t.offTotalRushYds = null);
        var rows = service.buildRows(0, 0, tradedPassing(), tradedRushing(), contexts,
                tradedTeams(), Set.of("MIN", "NO"));
        var murray = rows.stream().filter(r -> r.getRosterId().equals("555222907")).findFirst().orElseThrow();
        assertThat(murray.getTeam().getAbbrName()).isEqualTo("MIN");
        assertThat(murray.getTeamFumbles()).isEqualTo(1);
        assertThat(rows.stream().filter(r -> r.getRosterId().equals("shough")).findFirst().orElseThrow().getTeamFumbles()).isEqualTo(2);
    }

    @Test
    void duplicateYardTiesAndMissingContextsKeepTheFirstRow() {
        var contexts = tradedTeamStats();
        contexts.getFirst().offTotalPassYds = 0;
        var deduped = service.dedupeWeeklyStats(tradedPassing(), tradedRushing(), contexts);
        assertThat(deduped.passing().getFirst().team__abbrName).isEqualTo("NO");
        deduped = service.dedupeWeeklyStats(List.of(), tradedRushing(), List.of());
        assertThat(deduped.rushing().getFirst().team__abbrName).isEqualTo("NO");
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
        when(teamRepository.countBySeasonIndexAndStageIndexAndWeekIndex(anyInt(), eq(1), anyInt())).thenReturn(1L);
        service.syncIncremental();
        verify(client).fetchPassingStats(1, 1, 18);
        verify(client).fetchRushingStats(1, 1, 18);
        verify(client).fetchTeamsStats(1, 1, 18);
        verify(client).fetchKickingStats(1, 1, 18);
        verify(client).fetchPuntingStats(1, 1, 18);
        verify(writer).replaceWeek(1, 1, 18, List.of(), List.of());
        verifyNoMoreInteractions(writer);
        assertThat(service.getStatus().success()).isTrue();
        assertThat(service.getStatus().inProgress()).isFalse();
        assertThat(service.getStatus().completedAt()).isNotNull();
    }

    @Test
    void incrementalRefetchesOlderWeekWhenNewlyCompletedTeamsOutnumberStoredTeamRows() {
        league();
        var other = new TeamEntity();
        other.setAbbrName("BBB");
        when(games.findCompletedInScope(0, 0, 22)).thenReturn(List.of());
        var partiallyStored = game(0);
        partiallyStored.setAwayTeam(other);
        when(games.findCompletedInScope(1, 0, 22)).thenReturn(List.of(partiallyStored, game(1), game(2)));
        when(repository.existsBySeasonIndexAndStageIndexAndWeekIndex(1, 1, 0)).thenReturn(true);
        when(repository.existsBySeasonIndexAndStageIndexAndWeekIndex(1, 1, 1)).thenReturn(true);
        when(teamRepository.countBySeasonIndexAndStageIndexAndWeekIndex(1, 1, 0)).thenReturn(1L);
        when(teamRepository.countBySeasonIndexAndStageIndexAndWeekIndex(1, 1, 1)).thenReturn(1L);
        service.syncIncremental();
        verify(writer).replaceWeek(1, 1, 0, List.of(), List.of());
        verify(writer).replaceWeek(1, 1, 2, List.of(), List.of());
        verifyNoMoreInteractions(writer);
        verify(client, never()).fetchPassingStats(1, 1, 1);
        assertThat(service.getStatus().success()).isTrue();
    }

    @Test
    void fullResyncRepullsAllCompletedWeeksAndIgnoresStoredRows() {
        league();
        when(games.findCompletedInScope(0, 0, 22)).thenReturn(List.of(game(0)));
        when(games.findCompletedInScope(1, 0, 22)).thenReturn(List.of(game(22)));
        service.syncAll();
        verify(writer).replaceWeek(0, 1, 0, List.of(), List.of());
        verify(writer).replaceWeek(1, 1, 22, List.of(), List.of());
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
    @Test
    void teamRowsSumEveryPositionAndSpecialistAndMapTeamContext() {
        var context = new NsTeamStat();
        context.team__abbrName = "AAA";
        context.offTotalSacks = 1;
        context.offTotalTotalYds = 402;
        context.offTotal1stDowns = 23;
        context.offTotal3rdDownAtt = 14;
        context.offTotal3rdDownConv = 5;
        context.offTotal4thDownAtt = 4;
        context.offTotal4thDownConv = 2;
        context.offTotalRedZones = 6;
        context.offTotalRedZoneTDs = 3;
        context.offTotalPassTDs = 2;
        context.offTotalRushTDs = 1;
        context.offTotalIntsLost = 3;
        context.offTotalFumLost = 2;
        context.offTotal2PtAtt = 2;
        context.offTotal2PtConv = 1;
        var noSpecialists = new NsTeamStat();
        noSpecialists.team__abbrName = "BBB";
        var unplayed = new NsTeamStat();
        unplayed.team__abbrName = "NOT_COMPLETED";
        var otherTeam = new TeamEntity();
        otherTeam.setAbbrName("BBB");
        var qb = passer("a", "QB", 200);
        qb.passTotalAtt = 25;
        var wr = passer("b", "WR", 20);
        wr.passTotalAtt = 2;
        var qbRush = rusher("a", "QB", 0);
        qbRush.rushTotalAtt = 3;
        var hb = rusher("c", "HB", 0);
        hb.rushTotalAtt = 17;
        var kick = new NsKickingStat();
        kick.team__abbrName = "AAA";
        kick.fGTotalAtt = 2;
        kick.fGTotalMade = 1;
        kick.xPTotalAtt = 3;
        kick.xPTotalMade = 2;
        var backupKick = new NsKickingStat();
        backupKick.team__abbrName = "AAA";
        backupKick.fGTotalAtt = 1;
        backupKick.fGTotalMade = 1;
        backupKick.xPTotalAtt = 1;
        backupKick.xPTotalMade = 1;
        var punt = new NsPuntingStat();
        punt.team__abbrName = "AAA";
        punt.puntTotalAtt = 3;
        var backupPunt = new NsPuntingStat();
        backupPunt.team__abbrName = "AAA";
        backupPunt.puntTotalAtt = 1;
        var rows = service.buildTeamRows(2, 18, List.of(qb, wr), List.of(qbRush, hb),
                List.of(context, noSpecialists, unplayed), List.of(kick, backupKick), List.of(punt, backupPunt),
                Map.of("AAA", team, "BBB", otherTeam), Set.of("AAA", "BBB"));
        assertThat(rows).hasSize(2);
        var row = rows.getFirst();
        assertThat(row.getTeam()).isSameAs(team);
        assertThat(row.getSeasonIndex()).isEqualTo(2);
        assertThat(row.getStageIndex()).isEqualTo(1);
        assertThat(row.getWeekIndex()).isEqualTo(18);
        assertThat(row.getPassAtt()).isEqualTo(27);
        assertThat(row.getRushAtt()).isEqualTo(20);
        assertThat(row.getFgAtt()).isEqualTo(3);
        assertThat(row.getFgMade()).isEqualTo(2);
        assertThat(row.getXpAtt()).isEqualTo(4);
        assertThat(row.getXpMade()).isEqualTo(3);
        assertThat(row.getPunts()).isEqualTo(4);
        assertThat(row.getSacks()).isEqualTo(1);
        assertThat(row.getTotalYds()).isEqualTo(402);
        assertThat(row.getFirstDowns()).isEqualTo(23);
        assertThat(row.getThirdAtt()).isEqualTo(14);
        assertThat(row.getThirdConv()).isEqualTo(5);
        assertThat(row.getFourthAtt()).isEqualTo(4);
        assertThat(row.getFourthConv()).isEqualTo(2);
        assertThat(row.getRedZones()).isEqualTo(6);
        assertThat(row.getRedZoneTds()).isEqualTo(3);
        assertThat(row.getPassTds()).isEqualTo(2);
        assertThat(row.getRushTds()).isEqualTo(1);
        assertThat(row.getIntsLost()).isEqualTo(3);
        assertThat(row.getFumLost()).isEqualTo(2);
        assertThat(row.getTwoPtAtt()).isEqualTo(2);
        assertThat(row.getTwoPtConv()).isEqualTo(1);
        var empty = rows.getLast();
        assertThat(empty.getTeam()).isSameAs(otherTeam);
        assertThat(empty.getPassAtt()).isZero();
        assertThat(empty.getRushAtt()).isZero();
        assertThat(empty.getFgAtt()).isZero();
        assertThat(empty.getFgMade()).isZero();
        assertThat(empty.getXpAtt()).isZero();
        assertThat(empty.getXpMade()).isZero();
        assertThat(empty.getPunts()).isZero();
    }

    @Test
    void incrementalBackfillsTeamRowsWhenQuarterbackRowsAlreadyExist() {
        league();
        when(games.findCompletedInScope(0, 0, 22)).thenReturn(List.of(game(0)));
        when(repository.existsBySeasonIndexAndStageIndexAndWeekIndex(0, 1, 0)).thenReturn(true);
        when(teamRepository.countBySeasonIndexAndStageIndexAndWeekIndex(0, 1, 0)).thenReturn(0L);
        var context = new NsTeamStat();
        context.team__abbrName = "AAA";
        when(client.fetchPassingStats(0, 1, 0)).thenReturn(List.of(passer("a", "QB", 200)));
        when(client.fetchTeamsStats(0, 1, 0)).thenReturn(List.of(context));
        var kick = new NsKickingStat();
        kick.team__abbrName = "AAA";
        kick.fGTotalAtt = 2;
        var punt = new NsPuntingStat();
        punt.team__abbrName = "AAA";
        punt.puntTotalAtt = 3;
        when(client.fetchKickingStats(0, 1, 0)).thenReturn(List.of(kick));
        when(client.fetchPuntingStats(0, 1, 0)).thenReturn(List.of(punt));
        service.syncIncremental();
        verify(client).fetchKickingStats(0, 1, 0);
        verify(client).fetchPuntingStats(0, 1, 0);
        verify(writer).replaceWeek(eq(0), eq(1), eq(0),
                argThat(rows -> rows.size() == 1 && rows.getFirst().getPassYds() == 200),
                argThat(rows -> rows.size() == 1 && rows.getFirst().getFgAtt() == 2 && rows.getFirst().getPunts() == 3));
        assertThat(service.getStatus().success()).isTrue();
    }
}
