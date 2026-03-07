package com.rzs.stats.scheduler;

import com.rzs.stats.service.SyncService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SyncSchedulerTest {

    @Mock SyncService syncService;
    @InjectMocks SyncScheduler syncScheduler;

    @BeforeEach
    void setUp() {
        when(syncService.sync()).thenReturn(new SyncService.SyncResult(true, "ok"));
    }

    @Test
    void scheduledSync_callsSyncServiceSync() {
        syncScheduler.scheduledSync();
        verify(syncService, times(1)).sync();
    }

    @Test
    void scheduledSync_completesEvenIfSyncFails() {
        when(syncService.sync()).thenReturn(new SyncService.SyncResult(false, "failed"));
        assertDoesNotThrow(() -> syncScheduler.scheduledSync());
        verify(syncService, times(1)).sync();
    }
}
