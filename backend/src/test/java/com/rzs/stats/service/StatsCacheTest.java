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

    @Autowired StatsService statsService;
    @Autowired SyncService syncService;
    @Autowired CacheManager cacheManager;

    @BeforeEach
    void setUp() {
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
}
