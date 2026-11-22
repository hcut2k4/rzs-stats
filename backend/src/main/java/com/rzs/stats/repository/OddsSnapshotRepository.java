package com.rzs.stats.repository;

import com.rzs.stats.model.entity.OddsSnapshotEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OddsSnapshotRepository extends JpaRepository<OddsSnapshotEntity, Long> {
    List<OddsSnapshotEntity> findBySeasonOrderByNextWeekAscTeamIdAsc(int season);
    boolean existsBySeasonAndNextWeek(int season, int nextWeek);
    List<OddsSnapshotEntity> findBySeasonAndNextWeek(int season, int nextWeek);
}
