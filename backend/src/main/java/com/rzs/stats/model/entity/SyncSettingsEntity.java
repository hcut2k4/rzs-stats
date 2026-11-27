package com.rzs.stats.model.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "sync_settings")
public class SyncSettingsEntity {
    @Id
    private Long id = 1L;
    private int intervalMinutes;
    private Instant lastCheckedAt;
    private Instant lastChangedAt;
    private Instant lastFullSuccessAt;
    private Integer season;
    private Integer stage;
    private Integer week;
    public int getIntervalMinutes() { return intervalMinutes; }
    public void setIntervalMinutes(int value) { intervalMinutes = value; }
    public Instant getLastCheckedAt() { return lastCheckedAt; }
    public Instant getLastChangedAt() { return lastChangedAt; }
    public Instant getLastFullSuccessAt() { return lastFullSuccessAt; }
    public Integer getSeason() { return season; }
    public Integer getStage() { return stage; }
    public Integer getWeek() { return week; }
}
