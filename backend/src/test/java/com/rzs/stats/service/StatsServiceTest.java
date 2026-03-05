package com.rzs.stats.service;

import com.rzs.stats.model.dto.StandingDto;
import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.repository.TeamRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StatsServiceTest {

    @Mock GameRepository gameRepository;
    @Mock TeamRepository teamRepository;

    StatsService service;

    @BeforeEach
    void setUp() {
        service = new StatsService(gameRepository, teamRepository);
    }

    // ── calculatePyPat ─────────────────────────────────────────────────────────

    @Test
    void calculatePyPat_zeroGames_returnsZero() {
        assertThat(StatsService.calculatePyPat(100, 50, 0)).isEqualTo(0.0);
    }

    @Test
    void calculatePyPat_bothZeroScores_returnsZero() {
        assertThat(StatsService.calculatePyPat(0, 0, 5)).isEqualTo(0.0);
    }

    @Test
    void calculatePyPat_paIsZero_returnsOne() {
        assertThat(StatsService.calculatePyPat(100, 0, 5)).isEqualTo(1.0);
    }

    @Test
    void calculatePyPat_pfIsZero_returnsZero() {
        assertThat(StatsService.calculatePyPat(0, 100, 5)).isEqualTo(0.0);
    }

    @Test
    void calculatePyPat_equalScores_returnsHalf() {
        assertThat(StatsService.calculatePyPat(200, 200, 10)).isCloseTo(0.5, within(0.001));
    }

    @Test
    void calculatePyPat_dominantTeam_returnsHighValue() {
        assertThat(StatsService.calculatePyPat(500, 100, 10)).isGreaterThan(0.98);
    }

    @Test
    void calculatePyPat_normalCase_returnsInExpectedRange() {
        // PF well ahead of PA → expectancy comfortably above 0.5
        double result = StatsService.calculatePyPat(300, 200, 10);
        assertThat(result).isBetween(0.70, 0.85);
    }

    // ── TeamStats ──────────────────────────────────────────────────────────────

    @Test
    void teamStats_addGame_tracksWinLossTie() {
        StatsService.TeamStats ts = new StatsService.TeamStats();
        ts.addGame(30, 20, 2);  // win
        ts.addGame(14, 21, 3);  // loss
        ts.addGame(17, 17, 4);  // tie

        assertThat(ts.wins).isEqualTo(1);
        assertThat(ts.losses).isEqualTo(1);
        assertThat(ts.ties).isEqualTo(1);
        assertThat(ts.games).isEqualTo(3);
    }

    @Test
    void teamStats_addGame_tracksPointsForAndAgainst() {
        StatsService.TeamStats ts = new StatsService.TeamStats();
        ts.addGame(30, 20, 2);
        ts.addGame(14, 21, 3);

        assertThat(ts.pf).isEqualTo(44);
        assertThat(ts.pa).isEqualTo(41);
    }

    @Test
    void teamStats_statsExcluding_noH2H_returnsFullStats() {
        StatsService.TeamStats ts = new StatsService.TeamStats();
        ts.addGame(30, 20, 2);
        ts.addGame(17, 14, 3);

        // Team 99 was never faced: returns full stats unchanged
        assertThat(ts.statsExcluding(99)).containsExactly(47, 34, 2);
    }

    @Test
    void teamStats_statsExcluding_withH2H_subtractsCorrectly() {
        StatsService.TeamStats ts = new StatsService.TeamStats();
        ts.addGame(30, 20, 2);  // This team scored 30, team2 scored 20
        ts.addGame(17, 14, 3);  // This team scored 17, team3 scored 14

        // Excluding team2: should reflect only the game vs team3
        int[] result = ts.statsExcluding(2);
        assertThat(result).containsExactly(17, 14, 1);
    }

    @Test
    void teamStats_statsExcluding_multipleGamesVsSameOpponent() {
        StatsService.TeamStats ts = new StatsService.TeamStats();
        ts.addGame(30, 20, 2);  // vs team2, game 1
        ts.addGame(24, 28, 2);  // vs team2, game 2
        ts.addGame(17, 14, 3);  // vs team3

        // Excluding both games vs team2: only game vs team3 remains
        int[] result = ts.statsExcluding(2);
        assertThat(result).containsExactly(17, 14, 1);
    }

    // ── computeStandings ───────────────────────────────────────────────────────

    @Test
    void computeStandings_basicWinLossPfPa() {
        TeamEntity teamA = team(1, "Eagles");
        TeamEntity teamB = team(2, "Raiders");
        GameEntity g = game(101, teamA, teamB, 30, 14);  // A wins 30-14

        when(teamRepository.findAll()).thenReturn(List.of(teamA, teamB));
        when(gameRepository.findRegularSeasonGames(3, 1, 0, 17)).thenReturn(List.of(g));
        when(gameRepository.findRegularSeasonGames(2, 1, 0, 17)).thenReturn(List.of());

        List<StandingDto> standings = service.computeStandings(3);

        assertThat(standings).hasSize(2);
        StandingDto a = standings.stream().filter(s -> s.getTeamId() == 1).findFirst().orElseThrow();
        StandingDto b = standings.stream().filter(s -> s.getTeamId() == 2).findFirst().orElseThrow();

        assertThat(a.getWins()).isEqualTo(1);
        assertThat(a.getLosses()).isEqualTo(0);
        assertThat(a.getPointsFor()).isEqualTo(30);
        assertThat(a.getPointsAgainst()).isEqualTo(14);

        assertThat(b.getWins()).isEqualTo(0);
        assertThat(b.getLosses()).isEqualTo(1);
        assertThat(b.getPointsFor()).isEqualTo(14);
        assertThat(b.getPointsAgainst()).isEqualTo(30);
    }

    @Test
    void computeStandings_pythagoreanPatReflectsScoring() {
        TeamEntity teamA = team(1, "Eagles");
        TeamEntity teamB = team(2, "Raiders");
        GameEntity g = game(101, teamA, teamB, 30, 14);

        when(teamRepository.findAll()).thenReturn(List.of(teamA, teamB));
        when(gameRepository.findRegularSeasonGames(3, 1, 0, 17)).thenReturn(List.of(g));
        when(gameRepository.findRegularSeasonGames(2, 1, 0, 17)).thenReturn(List.of());

        List<StandingDto> standings = service.computeStandings(3);

        StandingDto a = standings.stream().filter(s -> s.getTeamId() == 1).findFirst().orElseThrow();
        StandingDto b = standings.stream().filter(s -> s.getTeamId() == 2).findFirst().orElseThrow();

        assertThat(a.getPythagoreanPat()).isGreaterThan(0.5);
        assertThat(b.getPythagoreanPat()).isLessThan(0.5);
    }

    @Test
    void computeStandings_sortedByWinPctDescending() {
        TeamEntity teamA = team(1, "Eagles");
        TeamEntity teamB = team(2, "Raiders");
        GameEntity g = game(101, teamA, teamB, 30, 14);

        when(teamRepository.findAll()).thenReturn(List.of(teamA, teamB));
        when(gameRepository.findRegularSeasonGames(3, 1, 0, 17)).thenReturn(List.of(g));
        when(gameRepository.findRegularSeasonGames(2, 1, 0, 17)).thenReturn(List.of());

        List<StandingDto> standings = service.computeStandings(3);

        // Winner (A) should appear first
        assertThat(standings.get(0).getTeamId()).isEqualTo(1);
        assertThat(standings.get(1).getTeamId()).isEqualTo(2);
    }

    @Test
    void computeStandings_firstSeason_noPrevSeasonLookup() {
        // seasonIndex=0 → no previous season query, no repo call for prev season
        TeamEntity teamA = team(1, "Eagles");

        when(teamRepository.findAll()).thenReturn(List.of(teamA));
        when(gameRepository.findRegularSeasonGames(0, 1, 0, 17)).thenReturn(List.of());

        List<StandingDto> standings = service.computeStandings(0);

        assertThat(standings).hasSize(1);
        assertThat(standings.get(0).getWins()).isEqualTo(0);
        assertThat(standings.get(0).getPythagoreanPat()).isEqualTo(0.0);
        assertThat(standings.get(0).getOppPyPatCurr()).isEqualTo(0.0);
        assertThat(standings.get(0).getOppPyPatPrev()).isEqualTo(0.0);
    }

    @Test
    void computeStandings_sosExcludesH2H() {
        // 3-team scenario: A plays B and C; B plays C.
        // A's SoS should use B's and C's stats excluding their games vs A.
        TeamEntity a = team(1, "A");
        TeamEntity b = team(2, "B");
        TeamEntity c = team(3, "C");

        GameEntity ab = game(1, a, b, 30, 14);  // A beats B 30-14
        GameEntity ac = game(2, a, c, 24, 21);  // A beats C 24-21
        GameEntity bc = game(3, b, c, 28, 17);  // B beats C 28-17

        when(teamRepository.findAll()).thenReturn(List.of(a, b, c));
        when(gameRepository.findRegularSeasonGames(3, 1, 0, 17)).thenReturn(List.of(ab, ac, bc));
        when(gameRepository.findRegularSeasonGames(2, 1, 0, 17)).thenReturn(List.of());

        List<StandingDto> standings = service.computeStandings(3);

        // A should have SoS > 0 (computed from B's and C's non-H2H games)
        StandingDto aDto = standings.stream().filter(s -> s.getTeamId() == 1).findFirst().orElseThrow();
        assertThat(aDto.getOppPyPatCurr()).isGreaterThan(0.0);

        // SoS for A is average of B's PyPat (vs C only: 28-17, strong) and C's PyPat (vs B only: 17-28, weak)
        // These are complementary, so average ≈ 0.5
        assertThat(aDto.getOppPyPatCurr()).isCloseTo(0.5, within(0.01));
    }

    // ── computeStandings: winDiff ──────────────────────────────────────────────

    @Test
    void computeStandings_winDiff_positiveWhenWinsExceedExpectation() {
        // Team A wins 4 close games (30-28): PyPAT ≈ 0.52, actualWins=4, expected≈2.1 → winDiff > 0
        TeamEntity teamA = team(1, "A");
        TeamEntity teamB = team(2, "B");
        List<GameEntity> played = List.of(
                game(1, teamA, teamB, 30, 28),
                game(2, teamA, teamB, 30, 28),
                game(3, teamA, teamB, 30, 28),
                game(4, teamA, teamB, 30, 28)
        );

        when(teamRepository.findAll()).thenReturn(List.of(teamA, teamB));
        when(gameRepository.findRegularSeasonGames(3, 1, 0, 17)).thenReturn(played);
        when(gameRepository.findRegularSeasonGames(2, 1, 0, 17)).thenReturn(List.of());

        List<StandingDto> standings = service.computeStandings(3);

        StandingDto a = standings.stream().filter(s -> s.getTeamId() == 1).findFirst().orElseThrow();
        assertThat(a.getWinDiff()).isGreaterThan(0);
    }

    @Test
    void computeStandings_winDiff_negativeWhenWinsBelowExpectation() {
        // Team A loses 4 close games (28-30): PyPAT ≈ 0.48, actualWins=0, expected≈1.9 → winDiff < 0
        TeamEntity teamA = team(1, "A");
        TeamEntity teamB = team(2, "B");
        List<GameEntity> played = List.of(
                game(1, teamA, teamB, 28, 30),
                game(2, teamA, teamB, 28, 30),
                game(3, teamA, teamB, 28, 30),
                game(4, teamA, teamB, 28, 30)
        );

        when(teamRepository.findAll()).thenReturn(List.of(teamA, teamB));
        when(gameRepository.findRegularSeasonGames(3, 1, 0, 17)).thenReturn(played);
        when(gameRepository.findRegularSeasonGames(2, 1, 0, 17)).thenReturn(List.of());

        List<StandingDto> standings = service.computeStandings(3);

        StandingDto a = standings.stream().filter(s -> s.getTeamId() == 1).findFirst().orElseThrow();
        assertThat(a.getWinDiff()).isLessThan(0);
    }

    @Test
    void computeStandings_winDiff_zeroWhenNoGamesPlayed() {
        TeamEntity teamA = team(1, "A");

        when(teamRepository.findAll()).thenReturn(List.of(teamA));
        when(gameRepository.findRegularSeasonGames(3, 1, 0, 17)).thenReturn(List.of());
        when(gameRepository.findRegularSeasonGames(2, 1, 0, 17)).thenReturn(List.of());

        List<StandingDto> standings = service.computeStandings(3);

        assertThat(standings.get(0).getWinDiff()).isEqualTo(0.0);
    }

    // ── computeStandings: oppPyPatRemaining ────────────────────────────────────

    @Test
    void computeStandings_oppPyPatRemainingCurr_nullWhenNoFutureGames() {
        TeamEntity teamA = team(1, "A");
        TeamEntity teamB = team(2, "B");

        when(teamRepository.findAll()).thenReturn(List.of(teamA, teamB));
        when(gameRepository.findRegularSeasonGames(3, 1, 0, 17))
                .thenReturn(List.of(game(1, teamA, teamB, 28, 14)));
        when(gameRepository.findRegularSeasonGames(2, 1, 0, 17)).thenReturn(List.of());
        when(gameRepository.findFutureRegularSeasonGames(3)).thenReturn(List.of());

        List<StandingDto> standings = service.computeStandings(3);

        StandingDto a = standings.stream().filter(s -> s.getTeamId() == 1).findFirst().orElseThrow();
        assertThat(a.getOppPyPatRemainingCurr()).isNull();
        assertThat(a.getOppPyPatRemainingPrev()).isNull();
    }

    @Test
    void computeStandings_oppPyPatRemainingCurr_nonNullWhenFutureGamesExist() {
        TeamEntity teamA = team(1, "A");
        TeamEntity teamB = team(2, "B");

        // Played game gives B some current-season stats; future game means A still faces B
        when(teamRepository.findAll()).thenReturn(List.of(teamA, teamB));
        when(gameRepository.findRegularSeasonGames(3, 1, 0, 17))
                .thenReturn(List.of(game(1, teamA, teamB, 28, 14)));
        when(gameRepository.findRegularSeasonGames(2, 1, 0, 17)).thenReturn(List.of());
        when(gameRepository.findFutureRegularSeasonGames(3))
                .thenReturn(List.of(futureGame(99, teamA, teamB)));

        List<StandingDto> standings = service.computeStandings(3);

        StandingDto a = standings.stream().filter(s -> s.getTeamId() == 1).findFirst().orElseThrow();
        assertThat(a.getOppPyPatRemainingCurr()).isNotNull();
        assertThat(a.getOppPyPatRemainingPrev()).isNotNull();
    }

    @Test
    void computeStandings_oppPyPatRemainingCurr_reflectsOpponentCurrentStrength() {
        // B dominates C in current season (huge margin) → B's PyPAT ≈ 1.0
        // A has a future game against B → A's remaining SoS should be very high
        TeamEntity teamA = team(1, "A");
        TeamEntity teamB = team(2, "B");
        TeamEntity teamC = team(3, "C");

        when(teamRepository.findAll()).thenReturn(List.of(teamA, teamB, teamC));
        when(gameRepository.findRegularSeasonGames(3, 1, 0, 17)).thenReturn(List.of(
                game(10, teamB, teamC, 50, 0),
                game(11, teamB, teamC, 50, 0),
                game(12, teamB, teamC, 50, 0),
                game(13, teamB, teamC, 50, 0)
        ));
        when(gameRepository.findRegularSeasonGames(2, 1, 0, 17)).thenReturn(List.of());
        when(gameRepository.findFutureRegularSeasonGames(3))
                .thenReturn(List.of(futureGame(20, teamA, teamB)));

        List<StandingDto> standings = service.computeStandings(3);

        StandingDto a = standings.stream().filter(s -> s.getTeamId() == 1).findFirst().orElseThrow();
        assertThat(a.getOppPyPatRemainingCurr()).isNotNull();
        assertThat(a.getOppPyPatRemainingCurr()).isGreaterThan(0.9);
    }

    @Test
    void computeStandings_oppPyPatRemainingPrev_usesOpponentPrevSeasonStats() {
        // Current season: no played games
        // Previous season: B dominated C → B's prev PyPAT ≈ 1.0
        // Future game: A vs B → remaining SoS (prev) should be high
        TeamEntity teamA = team(1, "A");
        TeamEntity teamB = team(2, "B");
        TeamEntity teamC = team(3, "C");

        when(teamRepository.findAll()).thenReturn(List.of(teamA, teamB, teamC));
        when(gameRepository.findRegularSeasonGames(3, 1, 0, 17)).thenReturn(List.of());
        when(gameRepository.findRegularSeasonGames(2, 1, 0, 17)).thenReturn(List.of(
                game(100, teamB, teamC, 50, 0),
                game(101, teamB, teamC, 50, 0)
        ));
        when(gameRepository.findFutureRegularSeasonGames(3))
                .thenReturn(List.of(futureGame(20, teamA, teamB)));

        List<StandingDto> standings = service.computeStandings(3);

        StandingDto a = standings.stream().filter(s -> s.getTeamId() == 1).findFirst().orElseThrow();
        assertThat(a.getOppPyPatRemainingPrev()).isNotNull();
        assertThat(a.getOppPyPatRemainingPrev()).isGreaterThan(0.9);
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private static GameEntity futureGame(int gameId, TeamEntity home, TeamEntity away) {
        GameEntity g = new GameEntity();
        g.setGameId(gameId);
        g.setSeasonIndex(3);
        g.setStageIndex(1);
        g.setWeekIndex(5);
        g.setHomeTeam(home);
        g.setAwayTeam(away);
        g.setStatus(1);
        g.setSimmed(false);
        return g;
    }

    private static TeamEntity team(int teamId, String name) {
        TeamEntity t = new TeamEntity();
        t.setTeamId(teamId);
        t.setDisplayName(name);
        t.setConference("AFC");
        t.setDivision("AFC East");
        return t;
    }

    private static GameEntity game(int gameId, TeamEntity home, TeamEntity away, int hs, int as) {
        GameEntity g = new GameEntity();
        g.setGameId(gameId);
        g.setSeasonIndex(3);
        g.setStageIndex(1);
        g.setWeekIndex(0);
        g.setHomeTeam(home);
        g.setAwayTeam(away);
        g.setHomeScore(hs);
        g.setAwayScore(as);
        return g;
    }
}
