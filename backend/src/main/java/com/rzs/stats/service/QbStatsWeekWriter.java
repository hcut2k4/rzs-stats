package com.rzs.stats.service;

import com.rzs.stats.model.entity.QbGameStatEntity;
import com.rzs.stats.model.entity.TeamGameStatEntity;
import com.rzs.stats.repository.QbGameStatRepository;
import com.rzs.stats.repository.TeamGameStatRepository;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service
public class QbStatsWeekWriter {
    private final QbGameStatRepository repository;
    private final TeamGameStatRepository teamRepository;

    public QbStatsWeekWriter(QbGameStatRepository repository, TeamGameStatRepository teamRepository) {
        this.repository = repository;
        this.teamRepository = teamRepository;
    }

    @Transactional
    @CacheEvict(value = {"qbStats", "teamEfficiency"}, allEntries = true)
    public void replaceWeek(int season, int stage, int week, List<QbGameStatEntity> rows, List<TeamGameStatEntity> teamRows) {
        repository.deleteBySeasonIndexAndStageIndexAndWeekIndex(season, stage, week);
        teamRepository.deleteBySeasonIndexAndStageIndexAndWeekIndex(season, stage, week);
        repository.flush();
        repository.saveAll(rows);
        teamRepository.saveAll(teamRows);
    }
}
