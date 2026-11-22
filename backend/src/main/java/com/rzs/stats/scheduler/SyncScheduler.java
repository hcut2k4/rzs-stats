package com.rzs.stats.scheduler;

import com.rzs.stats.service.QbStatsSyncService;
import com.rzs.stats.service.CacheWarmingService;
import com.rzs.stats.service.SyncService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class SyncScheduler {

    private final SyncService syncService;
    private final QbStatsSyncService qbSync;
    private final CacheWarmingService warming;

    @Value("${rzs.sync.cron}")
    private String cron;

    public SyncScheduler(SyncService syncService, QbStatsSyncService qbSync, CacheWarmingService warming) {
        this.syncService = syncService;
        this.qbSync = qbSync;
        this.warming = warming;
    }

    @Scheduled(cron = "${rzs.sync.cron}", zone = "America/New_York")
    public void scheduledSync() {
        if (syncService.sync().success()) {
            warming.warmCaches();
            qbSync.syncIncremental();
        }
    }
}
