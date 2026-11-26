package com.rzs.stats.repository;

import com.rzs.stats.model.entity.TeamGameStatEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;

public interface TeamGameStatRepository extends JpaRepository<TeamGameStatEntity, Long> {
    @Query("SELECT t FROM TeamGameStatEntity t LEFT JOIN FETCH t.team WHERE t.seasonIndex = :season AND t.stageIndex = 1 AND t.weekIndex BETWEEN :minWeek AND :maxWeek ORDER BY t.weekIndex, t.team.id")
    List<TeamGameStatEntity> findInScope(int season, int minWeek, int maxWeek);

    long countBySeasonIndexAndStageIndexAndWeekIndex(int season, int stage, int week);
    void deleteBySeasonIndexAndStageIndexAndWeekIndex(int season, int stage, int week);
}
