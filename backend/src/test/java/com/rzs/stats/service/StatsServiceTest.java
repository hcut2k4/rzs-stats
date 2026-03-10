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

    @Test
    void computeStandings_sos_sameOpponentHasDifferentPyPatForDifferentTeams() {
        // Eagles (1) beat Cowboys (2) badly: 30-10  → Cowboys look weak without this game
        // Cowboys (2) beat Colts  (3) badly: 28-7   → Cowboys look strong without this game
        //
        // Eagles' SoS: Cowboys' PyPAT excluding Eagles game = Cowboys vs Colts (28-7) → ~0.94
        // Colts'  SoS: Cowboys' PyPAT excluding Colts  game = Cowboys vs Eagles (10-30) → ~0.06
        //
        // Same Cowboys stats object, but statsExcluding(Eagles) ≠ statsExcluding(Colts)
        TeamEntity eagles  = team(1, "Eagles");
        TeamEntity cowboys = team(2, "Cowboys");
        TeamEntity colts   = team(3, "Colts");

        when(teamRepository.findAll()).thenReturn(List.of(eagles, cowboys, colts));
        when(gameRepository.findRegularSeasonGames(3, 1, 0, 17)).thenReturn(List.of(
                game(1, eagles,  cowboys, 30, 10),  // Eagles beat Cowboys 30-10
                game(2, cowboys, colts,   28,  7)   // Cowboys beat Colts 28-7
        ));
        when(gameRepository.findRegularSeasonGames(2, 1, 0, 17)).thenReturn(List.of());

        List<StandingDto> standings = service.computeStandings(3);

        StandingDto eaglesStanding = standings.stream().filter(s -> s.getTeamId() == 1).findFirst().orElseThrow();
        StandingDto coltsStanding  = standings.stream().filter(s -> s.getTeamId() == 3).findFirst().orElseThrow();

        // Eagles faced a Cowboys who demolished Colts (28-7) → high SoS
        assertThat(eaglesStanding.getOppPyPatCurr()).isGreaterThan(0.90);
        // Colts faced a Cowboys who got demolished by Eagles (10-30) → low SoS
        assertThat(coltsStanding.getOppPyPatCurr()).isLessThan(0.10);
        // Same opponent (Cowboys), but materially different PyPAT contribution
        assertThat(eaglesStanding.getOppPyPatCurr()).isGreaterThan(coltsStanding.getOppPyPatCurr() + 0.5);
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

    // ── computeStandings: oppPyPatTotal ────────────────────────────────────────

    @Test
    void computeStandings_oppPyPatTotalCurr_averagesAllScheduledOpponents() {
        // A played B (high PyPAT ≈ 1.0) and C (high PyPAT ≈ 0.9)
        // A's future: vs D (low PyPAT ≈ 0.1)
        // Played SoS ≈ 0.95; Remaining SoS ≈ 0.10
        // Average-of-averages = 0.525  ← WRONG
        // True total = avg(B, C, D) ≈ 0.67  ← CORRECT
        TeamEntity teamA = team(1, "A");
        TeamEntity teamB = team(2, "B");
        TeamEntity teamC = team(3, "C");
        TeamEntity teamD = team(4, "D");
        TeamEntity teamE = team(5, "E");  // foil for B and C to look strong

        // B and C both dominate E (50-0) — so B and C each have PyPAT ≈ 1.0 (excl. A games)
        // D loses badly to E (0-50) — so D has PyPAT ≈ 0.0 (excl. A games, which don't exist yet)
        // A played B and C; A's future is vs D
        when(teamRepository.findAll()).thenReturn(List.of(teamA, teamB, teamC, teamD, teamE));
        when(gameRepository.findRegularSeasonGames(3, 1, 0, 17)).thenReturn(List.of(
                game(1,  teamA, teamB, 14, 28),  // A vs B
                game(2,  teamA, teamC, 14, 28),  // A vs C
                game(3,  teamB, teamE, 50,  0),  // B dominates E
                game(4,  teamC, teamE, 50,  0),  // C dominates E
                game(5,  teamE, teamD, 50,  0)   // E dominates D
        ));
        when(gameRepository.findRegularSeasonGames(2, 1, 0, 17)).thenReturn(List.of());
        when(gameRepository.findFutureRegularSeasonGames(3))
                .thenReturn(List.of(futureGame(99, teamA, teamD)));

        List<StandingDto> standings = service.computeStandings(3);

        StandingDto a = standings.stream().filter(s -> s.getTeamId() == 1).findFirst().orElseThrow();

        // Played SoS (B + C, both strong ≈ 1.0) should be high
        assertThat(a.getOppPyPatCurr()).isGreaterThan(0.80);
        // Remaining SoS (D, weak ≈ 0.0) should be low
        assertThat(a.getOppPyPatRemainingCurr()).isNotNull();
        assertThat(a.getOppPyPatRemainingCurr()).isLessThan(0.20);
        // Total SoS = avg(B, C, D) — should be between played and remaining, roughly in the 0.55-0.75 range
        // (NOT the 0.525 you'd get from averaging the two SoS values)
        assertThat(a.getOppPyPatTotalCurr()).isNotNull();
        assertThat(a.getOppPyPatTotalCurr()).isGreaterThan(0.50);
        assertThat(a.getOppPyPatTotalCurr()).isLessThan(a.getOppPyPatCurr());  // pulled down by weak D
    }

    @Test
    void computeStandings_oppPyPatTotalCurr_equalsPlayedSosWhenNoFutureGames() {
        // When no future games, total SoS = played SoS (same set of opponents)
        TeamEntity teamA = team(1, "A");
        TeamEntity teamB = team(2, "B");

        when(teamRepository.findAll()).thenReturn(List.of(teamA, teamB));
        when(gameRepository.findRegularSeasonGames(3, 1, 0, 17))
                .thenReturn(List.of(game(1, teamA, teamB, 28, 14)));
        when(gameRepository.findRegularSeasonGames(2, 1, 0, 17)).thenReturn(List.of());
        when(gameRepository.findFutureRegularSeasonGames(3)).thenReturn(List.of());

        List<StandingDto> standings = service.computeStandings(3);

        StandingDto a = standings.stream().filter(s -> s.getTeamId() == 1).findFirst().orElseThrow();
        assertThat(a.getOppPyPatTotalCurr()).isNotNull();
        assertThat(a.getOppPyPatTotalCurr()).isEqualTo(a.getOppPyPatCurr());
    }

    @Test
    void computeStandings_oppPyPatTotalCurr_nullWhenNoScheduleAtAll() {
        // Team with no played games and no future games → total SoS is null
        TeamEntity teamA = team(1, "A");

        when(teamRepository.findAll()).thenReturn(List.of(teamA));
        when(gameRepository.findRegularSeasonGames(3, 1, 0, 17)).thenReturn(List.of());
        when(gameRepository.findRegularSeasonGames(2, 1, 0, 17)).thenReturn(List.of());
        when(gameRepository.findFutureRegularSeasonGames(3)).thenReturn(List.of());

        List<StandingDto> standings = service.computeStandings(3);

        assertThat(standings.get(0).getOppPyPatTotalCurr()).isNull();
        assertThat(standings.get(0).getOppPyPatTotalPrev()).isNull();
    }

    @Test
    void computeStandings_sosTotalAlwaysBetweenPlayedAndLeft() {
        // Regression test: SoS Total must be between SoS Played and SoS Left.
        // The old set-union code would average each unique opponent once, which under-weighted
        // strong common opponents and let weak played-only opponents drag Total below both.
        //
        // Scenario:
        //   A played B (strong ~1.0), B2 (strong ~1.0), C (weak ~0.0)  → SoS Played ≈ 0.667
        //   A's remaining: B, B2 (strong), D, E, F (moderate ~0.5)     → SoS Left   ≈ 0.700
        //   Old code: union avg(B,B2,C,D,E,F) ≈ 0.583 < min(0.667, 0.700)  ← violates invariant
        //   New code: weighted avg = (0.667×3 + 0.700×5)/8 ≈ 0.688           ← within bounds ✓
        TeamEntity teamA  = team(1, "A");
        TeamEntity teamB  = team(2, "B");
        TeamEntity teamB2 = team(3, "B2");
        TeamEntity teamC  = team(4, "C");
        TeamEntity teamD  = team(5, "D");
        TeamEntity teamE  = team(6, "E");
        TeamEntity teamF  = team(7, "F");
        TeamEntity teamZ  = team(8, "Z");  // foil that shapes B/B2/C/D/E/F quality

        when(teamRepository.findAll()).thenReturn(List.of(teamA, teamB, teamB2, teamC, teamD, teamE, teamF, teamZ));
        when(gameRepository.findRegularSeasonGames(3, 1, 0, 17)).thenReturn(List.of(
                // A's played games
                game(1,  teamA,  teamB,  10, 40),   // A loses to B
                game(2,  teamA,  teamB2, 10, 35),   // A loses to B2
                game(3,  teamA,  teamC,  40, 10),   // A beats C
                // B dominates Z → B PyPAT excl. A ≈ 1.0
                game(4,  teamB,  teamZ,  40,  0),
                game(5,  teamB,  teamZ,  40,  0),
                // B2 dominates Z → B2 PyPAT excl. A ≈ 1.0
                game(6,  teamB2, teamZ,  35,  0),
                game(7,  teamB2, teamZ,  35,  0),
                // Z dominates C → C PyPAT excl. A ≈ 0.0
                game(8,  teamZ,  teamC,  40,  0),
                game(9,  teamZ,  teamC,  40,  0),
                // D, E, F each split vs Z → each PyPAT excl. A = 0.5
                game(10, teamD,  teamZ,  28, 14),
                game(11, teamZ,  teamD,  28, 14),
                game(12, teamE,  teamZ,  28, 14),
                game(13, teamZ,  teamE,  28, 14),
                game(14, teamF,  teamZ,  28, 14),
                game(15, teamZ,  teamF,  28, 14)
        ));
        when(gameRepository.findRegularSeasonGames(2, 1, 0, 17)).thenReturn(List.of());
        when(gameRepository.findFutureRegularSeasonGames(3)).thenReturn(List.of(
                futureGame(99,  teamA, teamB),    // B rematch
                futureGame(100, teamA, teamB2),   // B2 rematch
                futureGame(101, teamA, teamD),
                futureGame(102, teamA, teamE),
                futureGame(103, teamA, teamF)
        ));

        List<StandingDto> standings = service.computeStandings(3);
        StandingDto a = standings.stream().filter(s -> s.getTeamId() == 1).findFirst().orElseThrow();

        double played = a.getOppPyPatCurr();             // avg(B≈1,B2≈1,C≈0) ≈ 0.667
        Double left   = a.getOppPyPatRemainingCurr();    // avg(B≈1,B2≈1,D=0.5,E=0.5,F=0.5) = 0.700
        Double total  = a.getOppPyPatTotalCurr();        // weighted avg → ≈ 0.688

        assertThat(left).isNotNull();
        assertThat(total).isNotNull();
        // SoS Total must be between SoS Played and SoS Left (the invariant the old code violated)
        assertThat(total).isGreaterThanOrEqualTo(Math.min(played, left));
        assertThat(total).isLessThanOrEqualTo(Math.max(played, left) + 0.001);
        // Confirm the scenario actually exercises the interesting case (both endpoints distinct)
        assertThat(played).isGreaterThan(0.60);  // strong played SoS
        assertThat(left).isGreaterThan(0.60);    // strong remaining SoS
        assertThat(total).isGreaterThan(played); // total pulled up by moderates in remaining
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
