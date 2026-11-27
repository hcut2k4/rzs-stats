package com.rzs.stats.scheduler;

import com.rzs.stats.service.SyncPipeline;
import com.rzs.stats.service.SyncSettingsService;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.time.Instant;

@Component
public class SyncScheduler {
    private static final Logger log = LoggerFactory.getLogger(SyncScheduler.class);
    private final SyncPipeline pipeline;
    private final SyncSettingsService settings;
    private Instant nightlyDue;

    public SyncScheduler(SyncPipeline pipeline, SyncSettingsService settings) {
        this.pipeline = pipeline; this.settings = settings;
    }

    @Scheduled(fixedDelay = 60_000)
    public void tick() {
        var row = settings.get();
        if (nightlyDue != null && row.getLastFullSuccessAt() != null && !row.getLastFullSuccessAt().isBefore(nightlyDue)) nightlyDue = null;
        boolean due = row.getIntervalMinutes() > 0 && (row.getLastCheckedAt() == null
                || !Instant.now().isBefore(row.getLastCheckedAt().plusSeconds(row.getIntervalMinutes() * 60L)));
        if (pipeline.needsStartup() || nightlyDue != null || due) {
            try { pipeline.run(nightlyDue != null ? SyncPipeline.Mode.FULL : SyncPipeline.Mode.QUICK); }
            catch (RuntimeException e) { log.warn("Sync deferred or failed: {}", e.getMessage()); }
        }
    }

    @Scheduled(cron = "${rzs.sync.cron}", zone = "America/New_York")
    public void scheduledSync() { nightlyDue = Instant.now(); tick(); }
}
