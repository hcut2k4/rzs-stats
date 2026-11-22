package com.rzs.stats.controller;

import com.rzs.stats.service.SyncStatusService;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;

@RestController
public class SyncStatusController {
    private final SyncStatusService status;
    public SyncStatusController(SyncStatusService status) { this.status = status; }
    public record Response(Instant lastSyncAt) {}
    @GetMapping("/api/sync/status")
    public Response status() { return new Response(status.lastSyncAt()); }
}
