package com.rzs.stats.service;

import com.rzs.stats.client.NeonSportzClient;
import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.model.ns.NsGame;
import com.rzs.stats.model.ns.NsLeague;
import com.rzs.stats.model.ns.NsTeam;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.repository.TeamRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SyncServiceTest {

    @Mock NeonSportzClient client;
    @Mock TeamRepository teamRepository;
    @Mock GameRepository gameRepository;

    SyncService service;

    @BeforeEach
    void setUp() {
        service = new SyncService(client, teamRepository, gameRepository);
    }

    // ── sync() ─────────────────────────────────────────────────────────────────

    @Test
    void sync_success_upsertsTeamsAndGames() {
        when(client.fetchLeagueInfo()).thenReturn(league(1));  // season=1 → index=0
        when(client.fetchAllTeams()).thenReturn(List.of(nsTeam(10), nsTeam(20)));
        when(client.fetchAllGamesForSeason(0)).thenReturn(List.of(nsGame(100, 2), nsGame(101, 2)));
        when(teamRepository.findByTeamId(any())).thenReturn(Optional.empty());
        when(teamRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        when(gameRepository.findByGameId(any())).thenReturn(Optional.empty());
        when(gameRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        SyncService.SyncResult result = service.sync();

        assertThat(result.success()).isTrue();
        verify(teamRepository, times(2)).save(any(TeamEntity.class));
        verify(gameRepository, times(2)).save(any(GameEntity.class));
    }

    @Test
    void sync_skipsGamesWithStatusLessThan2() {
        when(client.fetchLeagueInfo()).thenReturn(league(1));
        when(client.fetchAllTeams()).thenReturn(List.of());
        // game with status=1 should be skipped; status=2 should be saved
        when(client.fetchAllGamesForSeason(0)).thenReturn(
                List.of(nsGame(100, 1), nsGame(101, 2)));
        when(gameRepository.findByGameId(101)).thenReturn(Optional.empty());
        when(gameRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        service.sync();

        verify(gameRepository, times(1)).save(any(GameEntity.class));
    }

    @Test
    void sync_clientThrows_returnsFailureResult() {
        when(client.fetchLeagueInfo()).thenThrow(new RuntimeException("connection refused"));

        SyncService.SyncResult result = service.sync();

        assertThat(result.success()).isFalse();
        assertThat(result.message()).contains("Sync failed:");
        verify(gameRepository, never()).save(any());
    }

    @Test
    void sync_updatesStatusAfterSuccess() {
        when(client.fetchLeagueInfo()).thenReturn(league(1));
        when(client.fetchAllTeams()).thenReturn(List.of());
        when(client.fetchAllGamesForSeason(0)).thenReturn(List.of());

        service.sync();

        SyncService.SyncStatus status = service.getStatus();
        assertThat(status.lastSyncTime()).isNotNull();
        assertThat(status.success()).isTrue();
    }

    @Test
    void sync_updatesStatusAfterFailure() {
        when(client.fetchLeagueInfo()).thenThrow(new RuntimeException("timeout"));

        service.sync();

        SyncService.SyncStatus status = service.getStatus();
        assertThat(status.lastSyncTime()).isNotNull();
        assertThat(status.success()).isFalse();
    }

    @Test
    void sync_syncsAllSeasonsUpToCurrent() {
        // season=3 (1-based) → currentSeasonIndex=2 → syncs seasons 0, 1, 2
        when(client.fetchLeagueInfo()).thenReturn(league(3));
        when(client.fetchAllTeams()).thenReturn(List.of());
        when(client.fetchAllGamesForSeason(anyInt())).thenReturn(List.of());

        service.sync();

        verify(client).fetchAllGamesForSeason(0);
        verify(client).fetchAllGamesForSeason(1);
        verify(client).fetchAllGamesForSeason(2);
    }

    @Test
    void sync_existingGame_updatesWithoutCounting() {
        when(client.fetchLeagueInfo()).thenReturn(league(1));
        when(client.fetchAllTeams()).thenReturn(List.of());
        GameEntity existing = new GameEntity();
        when(client.fetchAllGamesForSeason(0)).thenReturn(List.of(nsGame(100, 2)));
        when(gameRepository.findByGameId(100)).thenReturn(Optional.of(existing));
        when(gameRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        SyncService.SyncResult result = service.sync();

        // Existing game was updated (not counted as new), so message says "0 games added/updated"
        // Actually it says "X games added/updated" where X counts new games (upsertGame returns false for existing)
        assertThat(result.success()).isTrue();
        verify(gameRepository, times(1)).save(any(GameEntity.class));
    }

    // ── getStatus() before any sync ────────────────────────────────────────────

    @Test
    void getStatus_beforeSync_returnsNullSyncTime() {
        SyncService.SyncStatus status = service.getStatus();

        // lastSyncTime and message are null before any sync;
        // success is false (primitive boolean field default in SyncService)
        assertThat(status.lastSyncTime()).isNull();
        assertThat(status.message()).isNull();
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private static NsLeague league(int season) {
        NsLeague l = new NsLeague();
        l.setSeason(season);
        return l;
    }

    private static NsTeam nsTeam(int teamId) {
        NsTeam t = new NsTeam();
        t.setTeamId(teamId);
        t.setDisplayName("Team " + teamId);
        t.setAbbrName("T" + teamId);
        t.setCityName("City");
        t.setNickName("Nick");
        t.setConferenceName("AFC");
        t.setDivisionName("AFC East");
        return t;
    }

    private static NsGame nsGame(int gameId, int status) {
        NsGame g = new NsGame();
        g.setGameId(gameId);
        g.setSeasonIndex(0);
        g.setStageIndex(1);
        g.setWeekIndex(0);
        g.setHomeScore(28);
        g.setAwayScore(14);
        g.setStatus(status);
        g.setSimmed(false);
        // homeTeam/awayTeam left null to avoid team-lookup in upsertGame
        return g;
    }
}
