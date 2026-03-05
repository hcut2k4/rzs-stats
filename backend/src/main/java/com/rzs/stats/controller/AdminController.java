package com.rzs.stats.controller;

import com.rzs.stats.service.SyncService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final SyncService syncService;

    public AdminController(SyncService syncService) {
        this.syncService = syncService;
    }

    @PostMapping("/sync")
    public Map<String, Object> triggerSync() {
        SyncService.SyncResult result = syncService.sync();
        return Map.of("success", result.success(), "message", result.message());
    }

    @GetMapping("/sync/status")
    public SyncService.SyncStatus getSyncStatus() {
        return syncService.getStatus();
    }
}
