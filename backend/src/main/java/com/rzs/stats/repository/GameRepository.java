package com.rzs.stats.repository;

import com.rzs.stats.model.entity.GameEntity;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface GameRepository extends JpaRepository<GameEntity, Long> {

    // Regular season = stageIndex 1, weekIndex 0-17
    int REGULAR_SEASON_STAGE    = 1;
    int REGULAR_SEASON_MIN_WEEK = 0;
    int REGULAR_SEASON_MAX_WEEK = 17;

    Optional<GameEntity> findBySeasonIndexAndGameId(Integer seasonIndex, Integer gameId);

    List<GameEntity> findBySeasonIndex(Integer seasonIndex);

    @Cacheable("seasonGames")
    @Query("SELECT g FROM GameEntity g WHERE g.seasonIndex = :season AND g.stageIndex = :stage AND g.weekIndex BETWEEN :minWeek AND :maxWeek AND g.status >= 2")
    List<GameEntity> findRegularSeasonGames(
            @Param("season") Integer season,
            @Param("stage") Integer stage,
            @Param("minWeek") Integer minWeek,
            @Param("maxWeek") Integer maxWeek);

    List<GameEntity> findBySeasonIndexAndStageIndexAndWeekIndex(
            Integer seasonIndex, Integer stageIndex, Integer weekIndex);

    @Query("SELECT DISTINCT g.seasonIndex FROM GameEntity g WHERE " +
           "(SELECT COUNT(g2) FROM GameEntity g2 WHERE g2.seasonIndex = g.seasonIndex AND g2.stageIndex = 1 AND g2.weekIndex BETWEEN 0 AND 17 AND g2.status >= 2) >= :minGames " +
           "ORDER BY g.seasonIndex")
    List<Integer> findDistinctSeasonIndicesWithMinGames(@Param("minGames") long minGames);

    @Query("SELECT DISTINCT g.weekIndex FROM GameEntity g WHERE g.seasonIndex = :season AND g.stageIndex = :stage AND g.weekIndex BETWEEN 0 AND 17 AND g.status >= 2 ORDER BY g.weekIndex")
    List<Integer> findDistinctRegularSeasonWeeks(@Param("season") Integer season, @Param("stage") Integer stage);

    @Query("SELECT g FROM GameEntity g WHERE g.seasonIndex = :season AND g.stageIndex = 1 AND g.weekIndex BETWEEN 0 AND 17 AND g.status < 2")
    List<GameEntity> findFutureRegularSeasonGames(@Param("season") Integer season);

    @Query("SELECT g.seasonIndex, g.stageIndex, COUNT(g) FROM GameEntity g GROUP BY g.seasonIndex, g.stageIndex ORDER BY g.seasonIndex, g.stageIndex")
    List<Object[]> countGamesBySeasonAndStage();

    long countBySeasonIndex(Integer seasonIndex);
}
