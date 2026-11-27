package com.rzs.stats.repository;

import com.rzs.stats.model.entity.SyncSettingsEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import java.time.Instant;

public interface SyncSettingsRepository extends JpaRepository<SyncSettingsEntity, Long> {
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update SyncSettingsEntity s set s.intervalMinutes = :interval where s.id = 1")
    void updateInterval(int interval);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update SyncSettingsEntity s set s.lastCheckedAt = :now where s.id = 1")
    void updateChecked(Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update SyncSettingsEntity s set s.season = :season, s.stage = :stage, s.week = :week, "
            + "s.lastChangedAt = case when :changed = true then :now else s.lastChangedAt end where s.id = 1")
    void updateChanges(Integer season, Integer stage, Integer week, boolean changed, Instant now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update SyncSettingsEntity s set s.lastFullSuccessAt = :now where s.id = 1")
    void updateFullSuccess(Instant now);
}
