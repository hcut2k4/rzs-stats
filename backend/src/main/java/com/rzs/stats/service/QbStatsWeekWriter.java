package com.rzs.stats.service;

import com.rzs.stats.model.entity.QbGameStatEntity;
import com.rzs.stats.repository.QbGameStatRepository;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service
public class QbStatsWeekWriter {
    private final QbGameStatRepository repository;

    public QbStatsWeekWriter(QbGameStatRepository repository) { this.repository = repository; }

    @Transactional
    @CacheEvict(value = "qbStats", allEntries = true)
    public void replaceWeek(int season, int stage, int week, List<QbGameStatEntity> rows) {
        repository.deleteBySeasonIndexAndStageIndexAndWeekIndex(season, stage, week);
        repository.flush();
        repository.saveAll(rows);
    }
}
