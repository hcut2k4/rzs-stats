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

    private List<NsPassingStat> misattributedPassing() {
        var green = passer("green", "QB", 277);
        green.team__abbrName = "CLE";
        green.passTotalAtt = 21;
        green.passTotalSacks = 2;
        var young = passer("young", "QB", 165);
        young.team__abbrName = "CLE";
        young.passTotalAtt = 25;
        young.passTotalComp = 15;
        young.passTotalTDs = 2;
        young.passTotalInts = 1;
        young.passTotalSacks = 5;
        young.passerAvgRating = "90.1";
        return List.of(green, young);
    }

    private NsTeamStat context(String abbr, int yards, int sacks) {
        var stat = new NsTeamStat();
        stat.team__abbrName = abbr;
        stat.offTotalPassYds = yards;
        stat.offTotalSacks = sacks;
        return stat;
    }

    @Test
    void singlyListedTradedQuarterbackAndHisRushingFollowMatchingSackTotalsWithoutChangingInputs() {
        var passing = misattributedPassing();
        var rush = rusher("young", "QB", 1);
        rush.team__abbrName = "CLE";
        rush.rushTotalAtt = 4;
        rush.rushTotalYds = 20;
        rush.rushTotalTDs = 1;
        var contexts = List.of(context("CLE", 267, 2), context("CAR", 122, 5));
        var cle = new TeamEntity();
        cle.setAbbrName("CLE");
        var car = new TeamEntity();
        car.setAbbrName("CAR");
        var teams = Map.of("CLE", cle, "CAR", car);
        var completed = Set.of("CLE", "CAR");
        var rows = service.buildRows(0, 2, passing, List.of(rush), contexts, teams, completed);
        assertThat(rows).hasSize(2);
        var green = rows.getFirst();
        assertThat(green.getTeam().getAbbrName()).isEqualTo("CLE");
        assertThat(green.getTeamPasserYards()).isEqualTo(277);
        assertThat(green.getTeamPasserYards() - green.getTeamNetPassYds()).isEqualTo(10);
        assertThat(green.getTeamSacks()).isEqualTo(2);
        var young = rows.getLast();
        assertThat(young.getTeam().getAbbrName()).isEqualTo("CAR");
        assertThat(young.getTeamPasserYards()).isEqualTo(165);
        assertThat(young.getTeamPasserYards() - young.getTeamNetPassYds()).isEqualTo(43);
        assertThat(young.getTeamSacks()).isEqualTo(5);
        assertThat(young.getPassComp()).isEqualTo(15);
        assertThat(young.getPassTd()).isEqualTo(2);
        assertThat(young.getPassInt()).isEqualTo(1);
        assertThat(young.getPasserRating()).isEqualTo(90.1);
        assertThat(young.getRushAtt()).isEqualTo(4);
        assertThat(young.getRushYds()).isEqualTo(20);
        assertThat(young.getRushTd()).isEqualTo(1);
        assertThat(young.getTeamFumbles()).isEqualTo(1);
        assertThat(green.getTeamFumbles()).isZero();
        var teamRows = service.buildTeamRows(0, 2, passing, List.of(rush), contexts,
                List.of(), List.of(), teams, completed);
        assertThat(teamRows).extracting(r -> r.getPassAtt()).containsExactly(21, 25);
        assertThat(teamRows).extracting(r -> r.getRushAtt()).containsExactly(0, 4);
        assertThat(passing).allSatisfy(p -> assertThat(p.team__abbrName).isEqualTo("CLE"));
        assertThat(rush.team__abbrName).isEqualTo("CLE");
        assertThat(service.buildRows(0, 2, passing, List.of(rush), contexts, teams, completed))
                .usingRecursiveComparison().isEqualTo(rows);
    }

    @Test
    void equallyGoodDestinationsAndTeamsWithoutPassersLeaveAttributionUnchanged() {
        var passing = misattributedPassing();
        var contexts = List.of(context("CLE", 267, 2), context("CAR", 122, 5),
                context("DAL", 122, 5), context("DET", 200, 3));
        var result = service.dedupeWeeklyStats(passing, List.of(), contexts);
        assertThat(result.passing()).containsExactlyElementsOf(passing);
        assertThat(result.passing()).allSatisfy(p -> assertThat(p.team__abbrName).isEqualTo("CLE"));
        assertThat(service.dedupeWeeklyStats(List.of(), List.of(), contexts).passing()).isEmpty();
    }

    @Test
    void equallyGoodPassersLeaveAttributionUnchanged() {
        var passing = misattributedPassing();
        var other = passer("other", "QB", 165);
        other.team__abbrName = "CLE";
        other.passTotalSacks = 5;
        var result = service.dedupeWeeklyStats(List.of(passing.getLast(), other), List.of(),
                List.of(context("CLE", 122, 5), context("CAR", 122, 5)));
        assertThat(result.passing()).extracting(p -> p.team__abbrName).containsExactly("CLE", "CLE");
    }

    @Test
    void negativeYardGapsPreventReassignment() {
        var passing = misattributedPassing();
        for (var contexts : List.of(List.of(context("CLE", 278, 2), context("CAR", 122, 5)),
                List.of(context("CLE", 267, 2), context("CAR", 166, 5)))) {
            var result = service.dedupeWeeklyStats(passing, List.of(), contexts);
            assertThat(result.passing()).extracting(p -> p.team__abbrName).containsExactly("CLE", "CLE");
        }
    }

    @Test
    void zeroSackPassersStayOnTheirListedTeam() {
        var passer = passer("zero", "QB", 200);
        var result = service.dedupeWeeklyStats(List.of(passer), List.of(),
                List.of(context("AAA", 0, 0), context("CAR", 150, 1)));
        assertThat(result.passing()).containsExactly(passer);
        assertThat(passer.team__abbrName).isEqualTo("AAA");
    }

    @Test
    void bestYardGapWinsAndFurtherMovesAreReconsidered() {
        var passing = misattributedPassing();
        var other = passer("other", "QB", 180);
        other.team__abbrName = "MIN";
        other.passTotalSacks = 3;
        var result = service.dedupeWeeklyStats(List.of(passing.getFirst(), passing.getLast(), other), List.of(),
                List.of(context("CLE", 267, 2), context("CAR", 122, 5),
                        context("NO", 100, 5), context("MIN", 0, 0), context("KC", 160, 3)));
        assertThat(result.passing()).extracting(p -> p.team__abbrName).containsExactly("CLE", "CAR", "KC");
    }

    @Test
    void singlyListedRushingFollowsPassingEvenWhenPassingWasOnlyDeduplicated() {
        var rush = tradedRushing().getFirst();
        var result = service.dedupeWeeklyStats(tradedPassing(), List.of(rush), tradedTeamStats());
        assertThat(result.rushing()).hasSize(1);
        assertThat(result.rushing().getFirst().team__abbrName).isEqualTo("MIN");
        assertThat(rush.team__abbrName).isEqualTo("NO");
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
        lenient().when(client.fetchLeagueInfo()).thenReturn(league);
        when(teams.findAll()).thenReturn(List.of(team));
    }

    @Test
    void incrementalSkipsAllStoredWeeksWithoutChanges() {
        league();
        when(games.findCompletedInScope(0, 0, 22)).thenReturn(List.of(game(17)));
        when(games.findCompletedInScope(1, 0, 22)).thenReturn(List.of(game(0), game(1), game(18)));
        when(repository.existsBySeasonIndexAndStageIndexAndWeekIndex(anyInt(), eq(1), anyInt())).thenReturn(true);
        when(teamRepository.countBySeasonIndexAndStageIndexAndWeekIndex(anyInt(), eq(1), anyInt())).thenReturn(1L);
        service.syncIncremental(1, java.util.Set.of());
        verify(client, never()).fetchPassingStats(anyInt(), anyInt(), anyInt());
        verifyNoInteractions(writer);
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
        service.syncIncremental(1, java.util.Set.of());
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
    void singleSeasonResyncRewritesEveryCompletedWeekOnlyInRequestedSeason() {
        league();
        when(games.findCompletedInScope(0, 0, 22)).thenReturn(List.of(game(0), game(2), game(18)));
        service.syncAll(0);
        verify(games).findCompletedInScope(0, 0, 22);
        verifyNoMoreInteractions(games);
        for (int week : List.of(0, 2, 18)) {
            verify(client).fetchPassingStats(0, 1, week);
            verify(client).fetchRushingStats(0, 1, week);
            verify(client).fetchTeamsStats(0, 1, week);
            verify(client).fetchKickingStats(0, 1, week);
            verify(client).fetchPuntingStats(0, 1, week);
            verify(writer).replaceWeek(0, 1, week, List.of(), List.of());
        }
        verify(client).fetchLeagueInfo();
        verifyNoMoreInteractions(client, writer);
        verifyNoInteractions(repository, teamRepository);
        assertThat(service.getStatus().success()).isTrue();
        assertThat(service.getStatus().message()).isEqualTo("3 QB weeks synced for season 0");
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
        service.syncIncremental(1, java.util.Set.of());
        verify(client).fetchKickingStats(0, 1, 0);
        verify(client).fetchPuntingStats(0, 1, 0);
        verify(writer).replaceWeek(eq(0), eq(1), eq(0),
                argThat(rows -> rows.size() == 1 && rows.getFirst().getPassYds() == 200),
                argThat(rows -> rows.size() == 1 && rows.getFirst().getFgAtt() == 2 && rows.getFirst().getPunts() == 3));
        assertThat(service.getStatus().success()).isTrue();
    }
}
