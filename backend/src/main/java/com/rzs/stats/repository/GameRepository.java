package com.rzs.stats.repository;

import com.rzs.stats.model.entity.GameEntity;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface GameRepository extends JpaRepository<GameEntity, Long> {

    @Query("SELECT g.gameId, g.status, g.homeScore, g.awayScore, g.weekIndex, g.seasonIndex, g.stageIndex, h.teamId, a.teamId FROM GameEntity g LEFT JOIN g.homeTeam h LEFT JOIN g.awayTeam a ORDER BY g.seasonIndex, g.gameId, g.id")
    @org.springframework.data.jpa.repository.QueryHints(@jakarta.persistence.QueryHint(name = "org.hibernate.fetchSize", value = "500"))
    java.util.stream.Stream<Object[]> fingerprintRows();

    // Regular season = stageIndex 1, weekIndex 0-17
    int REGULAR_SEASON_STAGE    = 1;
    int REGULAR_SEASON_MIN_WEEK = 0;
    int REGULAR_SEASON_MAX_WEEK = 17;

    @Query("SELECT g FROM GameEntity g LEFT JOIN FETCH g.homeTeam LEFT JOIN FETCH g.awayTeam")
    List<GameEntity> findAllForElo();

    // Neon stores playoff games as stageIndex 1, weeks 18+ (wild card 18, divisional 19, conference 20, Super Bowl 22)
    int PLAYOFF_MIN_WEEK = 18;
    int PLAYOFF_API_STAGE = 2;

    Optional<GameEntity> findBySeasonIndexAndGameId(Integer seasonIndex, Integer gameId);

    @Query("SELECT g FROM GameEntity g LEFT JOIN FETCH g.homeTeam LEFT JOIN FETCH g.awayTeam WHERE g.seasonIndex = :seasonIndex")
    List<GameEntity> findBySeasonIndex(Integer seasonIndex);

    @Cacheable("seasonGames")
    @Query("SELECT g FROM GameEntity g LEFT JOIN FETCH g.homeTeam LEFT JOIN FETCH g.awayTeam WHERE g.seasonIndex = :season AND g.stageIndex = :stage AND g.weekIndex BETWEEN :minWeek AND :maxWeek AND g.status >= 2")
    List<GameEntity> findRegularSeasonGames(
            @Param("season") Integer season,
            @Param("stage") Integer stage,
            @Param("minWeek") Integer minWeek,
            @Param("maxWeek") Integer maxWeek);

    @Query("SELECT g FROM GameEntity g LEFT JOIN FETCH g.homeTeam LEFT JOIN FETCH g.awayTeam WHERE g.seasonIndex = :seasonIndex AND g.stageIndex = :stageIndex AND g.weekIndex = :weekIndex")
    List<GameEntity> findBySeasonIndexAndStageIndexAndWeekIndex(
            @Param("seasonIndex") Integer seasonIndex,
            @Param("stageIndex") Integer stageIndex,
            @Param("weekIndex") Integer weekIndex);

    @Query("SELECT DISTINCT g.seasonIndex FROM GameEntity g WHERE " +
           "(SELECT COUNT(g2) FROM GameEntity g2 WHERE g2.seasonIndex = g.seasonIndex AND g2.stageIndex = 1 AND g2.weekIndex BETWEEN 0 AND 17 AND g2.status >= 2) >= :minGames " +
           "ORDER BY g.seasonIndex")
    List<Integer> findDistinctSeasonIndicesWithMinGames(@Param("minGames") long minGames);

    @Query("SELECT DISTINCT g.weekIndex FROM GameEntity g WHERE g.seasonIndex = :season AND g.stageIndex = :stage AND g.weekIndex BETWEEN 0 AND 17 AND g.status >= 2 ORDER BY g.weekIndex")
    List<Integer> findDistinctRegularSeasonWeeks(@Param("season") Integer season, @Param("stage") Integer stage);

    @Query("SELECT DISTINCT g.weekIndex FROM GameEntity g WHERE g.seasonIndex = :season AND g.stageIndex = 1 AND g.weekIndex >= 18 AND g.status >= 2 ORDER BY g.weekIndex")
    List<Integer> findDistinctPlayoffWeeks(@Param("season") Integer season);

    @Query("SELECT g FROM GameEntity g LEFT JOIN FETCH g.homeTeam LEFT JOIN FETCH g.awayTeam WHERE g.seasonIndex = :season AND g.stageIndex = 1 AND g.weekIndex BETWEEN 0 AND 17 AND g.status < 2")
    List<GameEntity> findFutureRegularSeasonGames(@Param("season") Integer season);

    @Query("SELECT g.seasonIndex, g.stageIndex, COUNT(g) FROM GameEntity g GROUP BY g.seasonIndex, g.stageIndex ORDER BY g.seasonIndex, g.stageIndex")
    List<Object[]> countGamesBySeasonAndStage();

    @Query("SELECT g FROM GameEntity g LEFT JOIN FETCH g.homeTeam LEFT JOIN FETCH g.awayTeam WHERE (:season IS NULL OR g.seasonIndex = :season) AND g.stageIndex = 1 AND g.weekIndex BETWEEN :minWeek AND :maxWeek AND g.status >= 2")
    List<GameEntity> findCompletedInScope(Integer season, int minWeek, int maxWeek);

    long countBySeasonIndex(Integer seasonIndex);
}
