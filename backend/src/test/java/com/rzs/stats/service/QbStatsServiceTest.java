package com.rzs.stats.service;

import com.rzs.stats.model.entity.GameEntity;
import com.rzs.stats.model.entity.QbGameStatEntity;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.repository.GameRepository;
import com.rzs.stats.repository.QbGameStatRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import java.util.List;
import static com.rzs.stats.service.QbStatsCalculatorTest.row;
import static com.rzs.stats.service.QbStatsService.Scope.*;
import static com.rzs.stats.service.QbStatsService.Stage.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class QbStatsServiceTest {
    @Mock QbGameStatRepository repository;
    @Mock GameRepository games;
    QbStatsService service;

    @BeforeEach
    void setUp() { service = new QbStatsService(repository, games, new QbStatsCalculator()); }

    private GameEntity game(int week) {
        GameEntity g = new GameEntity();
        TeamEntity team = new TeamEntity();
        team.setAbbrName("AAA");
        g.setHomeTeam(team);
        g.setSeasonIndex(0);
        g.setStageIndex(1);
        g.setWeekIndex(week);
        g.setStatus(2);
        return g;
    }

    @Test
    void droppingOutOfQualificationDoesNotShiftOtherQuarterbacksMovement() {
        var a = row("a", 0, 10, 300);
        var b = row("b", 0, 20, 400);
        var c = row("c", 0, 20, 200);
        var b1 = row("b", 1, 20, 400);
        var c1 = row("c", 1, 20, 200);
        when(repository.findInScope(0, 0, 17)).thenReturn(List.of(a, b, c, b1, c1));
        when(games.findCompletedInScope(0, 0, 17)).thenReturn(List.of(game(0), game(1)));
        var result = service.leaderboard(SEASON, 0, 1, REGULAR, null, true);
        assertThat(result).extracting(d -> d.rosterId).containsExactly("a", "b", "c");
        assertThat(result.get(0).qualified).isFalse();
        assertThat(result.get(0).rank).isNull();
        assertThat(result.get(0).rankChange).isNull();
        assertThat(result.get(1).rank).isEqualTo(1);
        assertThat(result.get(1).rankChange).isZero();
        assertThat(result.get(2).rankChange).isZero();
    }

    @Test
    void newlyQualifiedQuarterbackHasNoMovementAndExistingCohortStillChangesRanks() {
        var a = row("a", 0, 20, 400);
        var b = row("b", 0, 20, 200);
        var c = row("c", 0, 5, 300);
        var a1 = row("a", 1, 20, 0);
        var b1 = row("b", 1, 20, 600);
        var c1 = row("c", 1, 20, 600);
        when(repository.findInScope(0, 0, 17)).thenReturn(List.of(a, b, c, a1, b1, c1));
        when(games.findCompletedInScope(0, 0, 17)).thenReturn(List.of(game(0), game(1)));
        var result = service.leaderboard(SEASON, 0, 1, REGULAR, null, false);
        assertThat(result).extracting(d -> d.rosterId).containsExactly("c", "b", "a");
        assertThat(result.get(0).rankChange).isNull();
        assertThat(result.get(1).rankChange).isEqualTo(1);
        assertThat(result.get(2).rankChange).isEqualTo(-1);
    }

    @Test
    void seasonQualificationCountsTeamGamesInsteadOfPlayerAppearances() {
        when(repository.findInScope(0, 0, 17)).thenReturn(List.of(row("a", 0, 15, 150)));
        when(games.findCompletedInScope(0, 0, 17)).thenReturn(List.of(game(0), game(1)));
        assertThat(service.leaderboard(SEASON, 0, 1, REGULAR, null, false)).isEmpty();
        assertThat(service.leaderboard(SEASON, 0, 1, REGULAR, 15, false)).hasSize(1);
    }

    @Test
    void weeklyQualificationUsesOnlySelectedWeek() {
        when(repository.findInScope(0, 0, 17)).thenReturn(List.of(row("a", 0, 40, 400), row("a", 1, 9, 90)));
        when(games.findCompletedInScope(0, 0, 17)).thenReturn(List.of(game(0), game(1)));
        assertThat(service.leaderboard(WEEK, 0, 1, REGULAR, null, false)).isEmpty();
        var included = service.leaderboard(WEEK, 0, 1, REGULAR, null, true).getFirst();
        assertThat(included.passAtt).isEqualTo(9);
        assertThat(included.gamesPlayed).isEqualTo(1);
        assertThat(included.qualified).isFalse();
    }

    @Test
    void alltimeQualificationUses250AttemptsAcrossSeasons() {
        var a = row("a", 0, 125, 500);
        var b = row("a", 0, 125, 1000);
        b.setSeasonIndex(1);
        when(repository.findInScope(null, 0, 22)).thenReturn(List.of(a, b));
        var result = service.leaderboard(ALLTIME, null, null, BOTH, null, false).getFirst();
        assertThat(result.passAtt).isEqualTo(250);
        assertThat(result.tanya).isEqualTo(6.0);
        assertThat(result.rankChange).isNull();
    }

    @Test
    void alltimeMovementComparesAgainstTheBoardBeforeTheLatestSeason() {
        var a0 = row("a", 0, 250, 2000);
        var b0 = row("b", 0, 250, 1000);
        var a1 = row("a", 0, 250, 0);
        var b1 = row("b", 0, 250, 4000);
        a1.setSeasonIndex(1);
        b1.setSeasonIndex(1);
        when(repository.findInScope(null, 0, 17)).thenReturn(List.of(a0, b0, a1, b1));
        var result = service.leaderboard(ALLTIME, null, null, REGULAR, null, false);
        assertThat(result).extracting(d -> d.rosterId).containsExactly("b", "a");
        assertThat(result.get(0).rankChange).isEqualTo(1);
        assertThat(result.get(1).rankChange).isEqualTo(-1);
    }

    @Test
    void alltimePlayoffQualificationUsesFiftyAttemptsInsteadOfTheFullSeasonBar() {
        var qualifies = row("a", 18, 50, 400);
        var shortOf = row("b", 18, 49, 400);
        when(repository.findInScope(null, 18, 22)).thenReturn(List.of(qualifies, shortOf));
        var result = service.leaderboard(ALLTIME, null, null, PLAYOFFS, null, true);
        assertThat(result).filteredOn(d -> d.rosterId.equals("a")).singleElement()
                .satisfies(d -> assertThat(d.qualified).isTrue());
        assertThat(result).filteredOn(d -> d.rosterId.equals("b")).singleElement()
                .satisfies(d -> assertThat(d.qualified).isFalse());
    }

    @Test
    void movementShowsTopQuarterbacksAndWeeklyCumulativeRanks() {
        when(repository.findInScope(0, 0, 17)).thenReturn(List.of(row("a", 0, 20, 400), row("b", 0, 20, 200),
                row("a", 1, 20, 0), row("b", 1, 20, 600)));
        when(games.findCompletedInScope(0, 0, 17)).thenReturn(List.of(game(0), game(1)));
        var result = service.movement(0, REGULAR, 1, QbStatsService.Basis.SEASON);
        assertThat(result.risers()).extracting(d -> d.rosterId).containsExactly("b");
        assertThat(result.fallers()).extracting(d -> d.rosterId).containsExactly("a");
        assertThat(result.series().getFirst().ranks()).extracting(r -> r.rank()).containsExactly(2, 1);
        assertThat(result.series().getFirst().ranks()).extracting(r -> r.week()).containsExactly(0, 1);
    }

    @Test
    void movementPlotsEveryWeekRegardlessOfTheMoversWindow() {
        when(repository.findInScope(0, 0, 17)).thenReturn(List.of(row("a", 0, 20, 400), row("a", 1, 20, 400),
                row("a", 2, 20, 400), row("b", 0, 20, 200), row("b", 1, 20, 200), row("b", 2, 20, 900)));
        when(games.findCompletedInScope(0, 0, 17)).thenReturn(List.of(game(0), game(1), game(2)));
        var result = service.movement(0, REGULAR, 1, QbStatsService.Basis.SEASON);
        assertThat(result.series().getFirst().ranks()).extracting(r -> r.week()).containsExactly(0, 1, 2);
        assertThat(result.risers()).extracting(d -> d.rosterId).containsExactly("b");
    }

    @Test
    void movementSkipsWeeksWithNoGames() {
        when(repository.findInScope(0, 18, 22)).thenReturn(List.of(row("a", 18, 20, 400), row("a", 22, 20, 400)));
        when(games.findCompletedInScope(0, 18, 22)).thenReturn(List.of(game(18), game(22)));
        var result = service.movement(0, PLAYOFFS, 1, QbStatsService.Basis.SEASON);
        assertThat(result.series().getFirst().ranks()).extracting(r -> r.week()).containsExactly(18, 22);
    }

    @Test
    void alltimeBasisRanksTheCareerBoardWeekByWeekAcrossSeasons() {
        var a0 = row("a", 17, 250, 2500);
        var b0 = row("b", 17, 250, 1250);
        var a1 = row("a", 0, 250, 0);
        var b1 = row("b", 0, 250, 3750);
        a1.setSeasonIndex(1);
        b1.setSeasonIndex(1);
        when(repository.findInScope(null, 0, 17)).thenReturn(List.of(a0, b0, a1, b1));
        var result = service.movement(1, REGULAR, 1, QbStatsService.Basis.ALLTIME);
        var ranks = result.series().getFirst().ranks();
        assertThat(ranks).extracting(r -> r.season()).containsExactly(0, 1);
        assertThat(ranks).extracting(r -> r.week()).containsExactly(17, 0);
        assertThat(result.risers()).extracting(d -> d.rosterId).containsExactly("b");
        assertThat(result.fallers()).extracting(d -> d.rosterId).containsExactly("a");
    }

    @Test
    void profileUsesTheSameCalculatorForSeasonsGamesAndComponents() {
        QbGameStatEntity a = row("a", 18, 20, 200);
        a.setPassTd(2);
        a.setPassInt(1);
        a.setRushFum(1);
        a.setTeamFumbles(3);
        a.setTeamFumblesLost(1);
        when(repository.findProfile("a", 18, 22)).thenReturn(List.of(a));
        var game = game(18);
        TeamEntity away = new TeamEntity();
        away.setAbbrName("BBB");
        game.setAwayTeam(away);
        when(games.findCompletedInScope(null, 18, 22)).thenReturn(List.of(game));
        var result = service.profile("a", PLAYOFFS);
        assertThat(result.games().getFirst().opponentAbbr()).isEqualTo("BBB");
        assertThat(result.seasons().getFirst().tanya).isEqualTo(9.0);
        assertThat(result.games().getFirst().tanya()).isEqualTo(9.0);
        assertThat(result.components().turnoverPenalty()).isEqualTo(60.0);
    }
}
