package com.rzs.stats.model.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "sync_status")
public class SyncStatusEntity {
    @Id
    private Long id = 1L;
    private Instant lastSyncAt;
    private String lastFingerprint;

    public Instant getLastSyncAt() { return lastSyncAt; }
    public String getLastFingerprint() { return lastFingerprint; }
    public void update(Instant at, String fingerprint) { lastSyncAt = at; lastFingerprint = fingerprint; }
}
