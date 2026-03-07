package com.rzs.stats.scheduler;

import com.rzs.stats.service.SyncService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class SyncScheduler {

    private final SyncService syncService;

    @Value("${rzs.sync.cron}")
    private String cron;

    public SyncScheduler(SyncService syncService) {
        this.syncService = syncService;
    }

    @Scheduled(cron = "${rzs.sync.cron}", zone = "America/New_York")
    public void scheduledSync() {
        syncService.sync();
    }
}
