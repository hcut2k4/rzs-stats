package com.rzs.stats.service;

import com.rzs.stats.playoffs.OddsService;
import com.rzs.stats.playoffs.OddsSnapshotService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static com.rzs.stats.service.QbStatsService.Scope.ALLTIME;
import static com.rzs.stats.service.QbStatsService.Scope.SEASON;
import static com.rzs.stats.service.QbStatsService.Stage.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CacheWarmingServiceTest {
    @Mock StatsService stats;
    @Mock EloHistoryService elo;
    @Mock QbStatsService qb;
    @Mock com.rzs.stats.playoffs.ChampionshipService championship;
    @Mock OddsService odds;
    @Mock com.rzs.stats.playoffs.LeverageService leverage;
    @Mock OddsSnapshotService snapshots;
    @Mock TeamEfficiencyService efficiency;
    @Mock com.rzs.stats.playoffs.ClinchService clinch;
    CacheWarmingService warming;

    private com.rzs.stats.config.PlayoffCacheInvalidation invalidation() {
        return new com.rzs.stats.config.PlayoffCacheInvalidation(new org.springframework.cache.caffeine.CaffeineCacheManager());
    }

    @BeforeEach
    void setUp() {
        warming = new CacheWarmingService(stats, elo, qb, odds, snapshots, leverage, championship, new com.rzs.stats.playoffs.ComputeGate(2, 100), clinch, invalidation(), efficiency);
        lenient().when(leverage.canonicalKey(null, null)).thenReturn(new com.rzs.stats.playoffs.LeverageService.Key(2, 11));
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(ints = {404, 503})
    void missingPlayoffDataIsSkippedButOtherHttpErrorsFailWarming(int status) {
        when(stats.getAvailableSeasons()).thenReturn(List.of(2));
        var failure = new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatusCode.valueOf(status), "No regular-season data for season 2");
        when(odds.odds(null, "madden")).thenThrow(failure);
        when(leverage.matrix(2, 11, "madden")).thenThrow(failure);
        when(clinch.clinch(null, "madden")).thenThrow(failure);
        warming.warmCaches();
        verify(odds).odds(null, "madden");
        verify(leverage).matrix(2, 11, "madden");
        verify(clinch).clinch(null, "madden");
        verifyNoInteractions(snapshots);
        assertThat(warming.getStatus().success()).isEqualTo(status == 404);
        if (status != 404) assertThat(warming.getStatus().message()).contains("playoff odds", "playoff leverage", "playoff clinch");
    }

    @Test
    void warmsSeasonAndAlltimeQbBoardsAndMovementForTheLatestSeason() {
        when(stats.getAvailableSeasons()).thenReturn(List.of(2, 0, 1));
        var baseline = new OddsService.Response(2, "madden", 10, 11, 20000, java.time.Instant.now(), List.of());
        when(odds.odds(null, "madden")).thenReturn(baseline);
        warming.warmCaches();
        for (int season : List.of(0, 1, 2)) {
            verify(qb).leaderboard(SEASON, season, null, REGULAR, null, false);
        }
        verify(qb).leaderboard(ALLTIME, null, null, REGULAR, null, false);
        verify(qb).leaderboard(ALLTIME, null, null, PLAYOFFS, null, false);
        verify(qb).movement(2, REGULAR, 1, QbStatsService.Basis.SEASON);
        verify(odds).odds(null, "madden");
        verify(snapshots).save(baseline);
        verifyNoInteractions(championship);
        verify(leverage).matrix(2, 11, "madden");
        assertThat(warming.getStatus().message()).contains("QB stats");
        assertThat(warming.getStatus().success()).isTrue();
    }

    @Test
    void warmsPlayoffCachesAfterARestartEvenWhenNoSyncChangedData() {
        when(stats.getAvailableSeasons()).thenReturn(List.of(2));
        var baseline = new OddsService.Response(2, "madden", 10, 11, 20000, java.time.Instant.now(), List.of());
        when(odds.odds(null, "madden")).thenReturn(baseline);
        warming.warmCaches();
        verify(odds).odds(null, "madden");
        verify(snapshots).save(baseline);
        verify(leverage).matrix(2, 11, "madden");
    }

    @Test
    void qbFailuresDoNotPreventRemainingSeasonsOrEloFromWarming() {
        when(stats.getAvailableSeasons()).thenReturn(List.of(0, 1));
        when(qb.leaderboard(SEASON, 0, null, REGULAR, null, false)).thenThrow(new IllegalStateException("failed"));
        when(qb.leaderboard(ALLTIME, null, null, REGULAR, null, false)).thenThrow(new IllegalStateException("failed"));
        when(qb.movement(1, REGULAR, 1, QbStatsService.Basis.SEASON)).thenThrow(new IllegalStateException("failed"));
        warming.warmCaches();
        verify(stats).computeStandings(1);
        verify(qb).leaderboard(SEASON, 1, null, REGULAR, null, false);
        verify(qb).leaderboard(ALLTIME, null, null, PLAYOFFS, null, false);
        verify(elo).getTimeline();
        assertThat(warming.getStatus().success()).isFalse();
        assertThat(warming.getStatus().message()).contains("incomplete");
    }

    @Test
    void missingPlayoffDataDoesNotFailOtherCacheWarming() {
        when(stats.getAvailableSeasons()).thenReturn(List.of(0));
        when(odds.odds(null, "madden")).thenThrow(new IllegalStateException("missing playoff data"));
        warming.warmCaches();
        verify(elo).getTimeline();
        verifyNoInteractions(snapshots);
        verifyNoInteractions(championship);
        verify(leverage).matrix(2, 11, "madden");
        assertThat(warming.getStatus().success()).isFalse();
        assertThat(warming.getStatus().message()).contains("incomplete");
    }

    @Test
    void warmsAlltimeQbBoardsWithoutSeasonsAndSkipsMovement() {
        when(stats.getAvailableSeasons()).thenReturn(List.of());
        warming.warmCaches();
        verify(qb).leaderboard(ALLTIME, null, null, REGULAR, null, false);
        verify(qb).leaderboard(ALLTIME, null, null, PLAYOFFS, null, false);
        verifyNoMoreInteractions(qb);
        verify(elo).getTimeline();
    }
}
