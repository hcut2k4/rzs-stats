package com.rzs.stats.scheduler;

import com.rzs.stats.service.*;
import com.rzs.stats.model.entity.SyncSettingsEntity;
import org.junit.jupiter.api.Test;
import static org.mockito.Mockito.*;

class SyncSchedulerTest {
    @Test
    void offSkipsFrequentPollsButKeepsNightlyReconciliation() {
        var pipeline = mock(SyncPipeline.class);
        var settings = mock(SyncSettingsService.class);
        var row = new SyncSettingsEntity();
        row.setIntervalMinutes(0);
        when(settings.get()).thenReturn(row);
        var scheduler = new SyncScheduler(pipeline, settings);
        scheduler.tick();
        verify(pipeline, never()).run(any());
        scheduler.scheduledSync();
        verify(pipeline).run(SyncPipeline.Mode.FULL);
    }

    @Test
    void busyNightlyRunIsRetriedOnNextTick() {
        var pipeline = mock(SyncPipeline.class);
        var settings = mock(SyncSettingsService.class);
        when(settings.get()).thenReturn(new SyncSettingsEntity());
        when(pipeline.run(SyncPipeline.Mode.FULL)).thenThrow(new IllegalStateException("already running"));
        var scheduler = new SyncScheduler(pipeline, settings);
        scheduler.scheduledSync();
        scheduler.tick();
        verify(pipeline, times(2)).run(SyncPipeline.Mode.FULL);
    }
}
