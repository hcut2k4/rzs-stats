package com.rzs.stats.service;

import com.rzs.stats.client.NeonSportzClient;
import com.rzs.stats.model.ns.NsLeague;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.repository.TeamRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cache.CacheManager;
import org.springframework.boot.test.mock.mockito.MockBean;

import java.util.List;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

@SpringBootTest
class StatsCacheTest {

    @MockBean NeonSportzClient client;
    @MockBean GameRepository gameRepository;
    @MockBean TeamRepository teamRepository;

    @Autowired EloHistoryService eloHistoryService;
    @Autowired EloQueryService eloQueries;
    @Autowired EloConfigService eloConfigService;
    @Autowired CacheWarmingService warming;
    @Autowired StatsService statsService;
    @Autowired SyncService syncService;
    @Autowired CacheManager cacheManager;
    @Autowired QbStatsWeekWriter weekWriter;

    @BeforeEach
    void setUp() {
        cacheManager.getCache("playoffPicture");
        cacheManager.getCache("playoffClinch");
        // Clear all caches and reset mock call counts between tests
        cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
        reset(gameRepository, teamRepository, client);

        // Default stubs: return empty collections so service methods complete without NPE
        when(gameRepository.findRegularSeasonGames(anyInt(), anyInt(), anyInt(), anyInt()))
                .thenReturn(List.of());
        when(gameRepository.findFutureRegularSeasonGames(anyInt())).thenReturn(List.of());
        when(gameRepository.findDistinctSeasonIndicesWithMinGames(anyLong())).thenReturn(List.of());
        when(gameRepository.findDistinctRegularSeasonWeeks(anyInt(), anyInt())).thenReturn(List.of());
        when(gameRepository.countBySeasonIndex(anyInt())).thenReturn(0L);
        when(gameRepository.findBySeasonIndex(anyInt())).thenReturn(List.of());
        when(teamRepository.findAll()).thenReturn(List.of());

        NsLeague league = new NsLeague();
        league.setSeason(0);
        when(client.fetchLeagueInfo()).thenReturn(league);
        when(client.fetchAllTeams()).thenReturn(List.of());
        when(client.fetchAllGamesForSeason(anyInt())).thenReturn(List.of());
    }

    @Test
    void eloTimelineIsComputedOnceAcrossEndpointQueries() {
        eloQueries.ratings(null, null);
        eloQueries.history(null);
        eloQueries.games(null, null, null);
        verify(gameRepository, times(1)).findAllForElo();
    }

    @Test
    void syncAndForceSyncEvictEloWithEveryOtherCache() {
        for (boolean force : List.of(false, true)) {
            cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).put("sentinel", "old"));
            eloHistoryService.getTimeline();
            if (force) syncService.syncForce(); else syncService.sync();
            for (String name : cacheManager.getCacheNames()) {
                org.assertj.core.api.Assertions.assertThat(cacheManager.getCache(name).get("sentinel")).isNull();
            }
            eloHistoryService.getTimeline();
        }
        verify(gameRepository, times(3)).findAllForElo();
    }

    @Test
    void warmingEvictsAllCachesAndRecomputesEloEvenWithoutSeasons() {
        eloHistoryService.getTimeline();
        cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).put("sentinel", "old"));
        warming.warmCaches();
        for (String name : cacheManager.getCacheNames()) {
            org.assertj.core.api.Assertions.assertThat(cacheManager.getCache(name).get("sentinel")).isNull();
        }
        org.assertj.core.api.Assertions.assertThat(warming.getStatus().success()).isTrue();
        eloHistoryService.getTimeline();
        verify(gameRepository, times(2)).findAllForElo();
    }

    @Test
    void warmingComputesEloAfterSeasonCaches() {
        when(gameRepository.findDistinctSeasonIndicesWithMinGames(anyLong())).thenReturn(List.of(0));
        when(gameRepository.findDistinctRegularSeasonWeeks(0, 1)).thenReturn(List.of(0));
        warming.warmCaches();
        var order = inOrder(gameRepository);
        order.verify(gameRepository).findBySeasonIndexAndStageIndexAndWeekIndex(0, 1, 0);
        order.verify(gameRepository).findAllForElo();
        org.assertj.core.api.Assertions.assertThat(warming.getStatus().success()).isTrue();
    }

    @Test
    void invalidConfigPreservesCachedTimeline() {
        eloHistoryService.getTimeline();
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> eloConfigService.update(
                new com.rzs.stats.model.dto.EloConfig(1500, 0, 400, true, 21, 0, 0.9)))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        eloHistoryService.getTimeline();
        verify(gameRepository, times(1)).findAllForElo();
    }

    @Test
    void configChangesEvictOnlyEloHistory() {
        eloHistoryService.getTimeline();
        cacheManager.getCache("standings").put("sentinel", "keep");
        eloConfigService.update(com.rzs.stats.model.dto.EloConfig.defaults());
        eloHistoryService.getTimeline();
        verify(gameRepository, times(2)).findAllForElo();
        org.assertj.core.api.Assertions.assertThat(cacheManager.getCache("standings").get("sentinel", String.class)).isEqualTo("keep");
    }

    @Test
    void computeStandings_cachedOnSecondCall() {
        statsService.computeStandings(0);
        statsService.computeStandings(0);

        // DB should only be hit once despite two calls
        verify(gameRepository, times(1)).findRegularSeasonGames(anyInt(), anyInt(), anyInt(), anyInt());
    }

    @Test
    void computeStandings_differentSeasonsCachedSeparately() {
        statsService.computeStandings(0);
        statsService.computeStandings(1);
        statsService.computeStandings(0); // should hit cache
        statsService.computeStandings(1); // should hit cache

        // Each season's first call goes to DB; second call hits cache
        // computeStandings(1) also calls regularSeasonGames(0) for prevGames — so season 0 query fires twice:
        // once for computeStandings(0) and once inside computeStandings(1). Both are cached after first call.
        verify(gameRepository, times(3))
                .findRegularSeasonGames(anyInt(), anyInt(), anyInt(), anyInt());
    }

    @Test
    void computeStandings_cacheEvictedAfterSync() {
        // Populate cache
        statsService.computeStandings(0);
        verify(gameRepository, times(1)).findRegularSeasonGames(anyInt(), anyInt(), anyInt(), anyInt());

        // Evict via sync
        syncService.sync();

        // Cache cleared — next call should hit DB again
        statsService.computeStandings(0);
        verify(gameRepository, times(2)).findRegularSeasonGames(anyInt(), anyInt(), anyInt(), anyInt());
    }

    @Test
    void getAvailableSeasons_cachedOnSecondCall() {
        statsService.getAvailableSeasons();
        statsService.getAvailableSeasons();

        verify(gameRepository, times(1)).findDistinctSeasonIndicesWithMinGames(anyLong());
    }

    @Test
    void getAvailableSeasons_cacheEvictedAfterSync() {
        statsService.getAvailableSeasons();
        syncService.sync();
        statsService.getAvailableSeasons();

        verify(gameRepository, times(2)).findDistinctSeasonIndicesWithMinGames(anyLong());
    }

    @Test
    void getGames_cachedOnSecondCall() {
        when(gameRepository.findBySeasonIndexAndStageIndexAndWeekIndex(anyInt(), anyInt(), anyInt()))
                .thenReturn(List.of());

        statsService.getGames(0, 1, 0);
        statsService.getGames(0, 1, 0);

        verify(gameRepository, times(1)).findBySeasonIndexAndStageIndexAndWeekIndex(anyInt(), anyInt(), anyInt());
    }

    @Test
    void getAvailableWeeks_cachedOnSecondCall() {
        statsService.getAvailableWeeks(0, 1);
        statsService.getAvailableWeeks(0, 1);

        verify(gameRepository, times(1)).findDistinctRegularSeasonWeeks(anyInt(), anyInt());
    }
    @Test
    void syncAndForceSyncEvictTeamEfficiency() {
        for (boolean force : List.of(false, true)) {
            cacheManager.getCache("teamEfficiency").put("sentinel", "old");
            if (force) syncService.syncForce(); else syncService.sync();
            org.assertj.core.api.Assertions.assertThat(cacheManager.getCache("teamEfficiency").get("sentinel")).isNull();
        }
    }

    @Test
    void replacingAWeekEvictsQuarterbacksAndTeamEfficiency() {
        for (String name : List.of("qbStats", "teamEfficiency")) cacheManager.getCache(name).put("sentinel", "old");
        weekWriter.replaceWeek(0, 1, 0, List.of(), List.of());
        for (String name : List.of("qbStats", "teamEfficiency")) {
            org.assertj.core.api.Assertions.assertThat(cacheManager.getCache(name).get("sentinel")).isNull();
        }
    }
}
