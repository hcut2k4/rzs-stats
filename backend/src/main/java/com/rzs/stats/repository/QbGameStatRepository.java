package com.rzs.stats.repository;

import com.rzs.stats.model.entity.QbGameStatEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;

public interface QbGameStatRepository extends JpaRepository<QbGameStatEntity, Long> {
    @Query("SELECT q FROM QbGameStatEntity q LEFT JOIN FETCH q.team WHERE (:season IS NULL OR q.seasonIndex = :season) AND q.stageIndex = 1 AND q.weekIndex BETWEEN :minWeek AND :maxWeek ORDER BY q.seasonIndex, q.weekIndex, q.rosterId")
    List<QbGameStatEntity> findInScope(Integer season, int minWeek, int maxWeek);

    boolean existsBySeasonIndexAndStageIndexAndWeekIndex(int season, int stage, int week);
    void deleteBySeasonIndexAndStageIndexAndWeekIndex(int season, int stage, int week);
}
