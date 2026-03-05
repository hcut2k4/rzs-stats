package com.rzs.stats.repository;

import com.rzs.stats.model.entity.GameEntity;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class GameRepositoryTest {

    @Autowired GameRepository gameRepository;

    // ── findBySeasonIndexAndGameId ─────────────────────────────────────────────

    @Test
    void findBySeasonIndexAndGameId_found() {
        save(game(1, 0, 1, 0));

        Optional<GameEntity> result = gameRepository.findBySeasonIndexAndGameId(0, 1);

        assertThat(result).isPresent();
        assertThat(result.get().getGameId()).isEqualTo(1);
    }

    @Test
    void findBySeasonIndexAndGameId_notFound() {
        assertThat(gameRepository.findBySeasonIndexAndGameId(0, 999)).isEmpty();
    }

    @Test
    void findBySeasonIndexAndGameId_sameGameIdDifferentSeasons_returnsCorrectOne() {
        save(game(1, 0, 1, 0));
        save(game(1, 1, 1, 0));

        Optional<GameEntity> result = gameRepository.findBySeasonIndexAndGameId(1, 1);

        assertThat(result).isPresent();
        assertThat(result.get().getSeasonIndex()).isEqualTo(1);
    }

    // ── findRegularSeasonGames ─────────────────────────────────────────────────

    @Test
    void findRegularSeasonGames_returnsMatchingSeasonStageWeek() {
        save(game(1, 0, 1, 0, 2));   // season=0, stage=1, week=0, completed → matches
        save(game(2, 1, 1, 0, 2));   // season=1 → excluded
        save(game(3, 0, 2, 0, 2));   // stage=2 → excluded
        save(game(4, 0, 1, 5, 2));   // week=5 → still within 0-17 → matches

        List<GameEntity> results = gameRepository.findRegularSeasonGames(0, 1, 0, 17);

        assertThat(results).hasSize(2);
        assertThat(results).extracting(GameEntity::getGameId).containsExactlyInAnyOrder(1, 4);
    }

    @Test
    void findRegularSeasonGames_excludesOutOfRangeWeeks() {
        save(game(1, 0, 1, 17, 2));  // week=17 → last valid week → included
        save(game(2, 0, 1, 18, 2));  // week=18 → excluded

        List<GameEntity> results = gameRepository.findRegularSeasonGames(0, 1, 0, 17);

        assertThat(results).hasSize(1);
        assertThat(results.get(0).getGameId()).isEqualTo(1);
    }

    @Test
    void findRegularSeasonGames_excludesFutureGames() {
        save(game(1, 0, 1, 0, 2));  // completed → included
        save(game(2, 0, 1, 0, 1));  // future (status=1) → excluded

        List<GameEntity> results = gameRepository.findRegularSeasonGames(0, 1, 0, 17);

        assertThat(results).hasSize(1);
        assertThat(results.get(0).getGameId()).isEqualTo(1);
    }

    // ── findDistinctSeasonIndicesWithMinGames ──────────────────────────────────

    @Test
    void findDistinctSeasonIndicesWithMinGames_returnsOnlySeasonsAtOrAboveThreshold() {
        // Season 0: 9 games (below threshold of 10)
        for (int i = 0; i < 9; i++) save(game(100 + i, 0, 1, i, 2));
        // Season 1: 10 games (at threshold)
        for (int i = 0; i < 10; i++) save(game(200 + i, 1, 1, i, 2));

        List<Integer> results = gameRepository.findDistinctSeasonIndicesWithMinGames(10);

        assertThat(results).containsExactly(1);
    }

    @Test
    void findDistinctSeasonIndicesWithMinGames_includesBothSeasonsWhenBothQualify() {
        for (int i = 0; i < 10; i++) save(game(100 + i, 0, 1, i, 2));
        for (int i = 0; i < 15; i++) save(game(200 + i, 1, 1, i, 2));

        List<Integer> results = gameRepository.findDistinctSeasonIndicesWithMinGames(10);

        assertThat(results).containsExactly(0, 1);
    }

    @Test
    void findDistinctSeasonIndicesWithMinGames_onlyCountsRegularSeasonStageOneWeeks() {
        // 10 games at stage=2 (playoffs) should NOT count toward threshold
        for (int i = 0; i < 10; i++) save(game(100 + i, 0, 2, i, 2));

        List<Integer> results = gameRepository.findDistinctSeasonIndicesWithMinGames(10);

        assertThat(results).isEmpty();
    }

    @Test
    void findDistinctSeasonIndicesWithMinGames_doesNotCountFutureGames() {
        // 9 completed + 1 future = should NOT reach threshold of 10
        for (int i = 0; i < 9; i++) save(game(100 + i, 0, 1, i, 2));
        save(game(200, 0, 1, 9, 1)); // future game

        assertThat(gameRepository.findDistinctSeasonIndicesWithMinGames(10)).isEmpty();
    }

    // ── findDistinctRegularSeasonWeeks ─────────────────────────────────────────

    @Test
    void findDistinctRegularSeasonWeeks_returnsDistinctWeeksSorted() {
        save(game(1, 0, 1, 5,  2));
        save(game(2, 0, 1, 0,  2));
        save(game(3, 0, 1, 10, 2));
        save(game(4, 0, 1, 5,  2));  // duplicate week → still just one entry

        List<Integer> weeks = gameRepository.findDistinctRegularSeasonWeeks(0, 1);

        assertThat(weeks).containsExactly(0, 5, 10);
    }

    @Test
    void findDistinctRegularSeasonWeeks_excludesPlayoffWeeks() {
        save(game(1, 0, 1, 17, 2));  // last regular-season week → included
        save(game(2, 0, 1, 18, 2));  // playoff week → excluded

        List<Integer> weeks = gameRepository.findDistinctRegularSeasonWeeks(0, 1);

        assertThat(weeks).containsExactly(17);
    }

    @Test
    void findDistinctRegularSeasonWeeks_excludesOtherSeasons() {
        save(game(1, 0, 1, 3, 2));
        save(game(2, 1, 1, 7, 2));  // different season

        List<Integer> weeks = gameRepository.findDistinctRegularSeasonWeeks(0, 1);

        assertThat(weeks).containsExactly(3);
    }

    @Test
    void findDistinctRegularSeasonWeeks_excludesFutureWeeks() {
        save(game(1, 0, 1, 3, 2));  // played → included
        save(game(2, 0, 1, 4, 1));  // future → excluded

        assertThat(gameRepository.findDistinctRegularSeasonWeeks(0, 1)).containsExactly(3);
    }

    // ── findFutureRegularSeasonGames ───────────────────────────────────────────

    @Test
    void findFutureRegularSeasonGames_returnsOnlyFutureRegularSeasonGames() {
        save(game(1, 0, 1, 5, 2));  // completed → excluded
        save(game(2, 0, 1, 6, 1));  // future regular season → included
        save(game(3, 0, 2, 6, 1));  // future but stage=2 → excluded
        save(game(4, 1, 1, 6, 1));  // future but season=1 → excluded

        List<GameEntity> results = gameRepository.findFutureRegularSeasonGames(0);

        assertThat(results).hasSize(1);
        assertThat(results.get(0).getGameId()).isEqualTo(2);
    }

    @Test
    void findFutureRegularSeasonGames_excludesPlayoffWeeks() {
        save(game(1, 0, 1, 18, 1));  // future but playoff week → excluded
        save(game(2, 0, 1, 17, 1));  // future regular season week 17 → included

        List<GameEntity> results = gameRepository.findFutureRegularSeasonGames(0);

        assertThat(results).hasSize(1);
        assertThat(results.get(0).getGameId()).isEqualTo(2);
    }

    @Test
    void findFutureRegularSeasonGames_emptyWhenAllGamesCompleted() {
        for (int i = 0; i < 5; i++) save(game(100 + i, 0, 1, i, 2));

        assertThat(gameRepository.findFutureRegularSeasonGames(0)).isEmpty();
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private GameEntity save(GameEntity g) {
        return gameRepository.save(g);
    }

    private static GameEntity game(int gameId, int season, int stage, int week) {
        return game(gameId, season, stage, week, 2);
    }

    private static GameEntity game(int gameId, int season, int stage, int week, int status) {
        GameEntity g = new GameEntity();
        g.setGameId(gameId);
        g.setSeasonIndex(season);
        g.setStageIndex(stage);
        g.setWeekIndex(week);
        g.setHomeScore(28);
        g.setAwayScore(14);
        g.setStatus(status);
        g.setSimmed(false);
        return g;
    }
}
