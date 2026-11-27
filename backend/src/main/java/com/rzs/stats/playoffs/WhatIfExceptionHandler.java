package com.rzs.stats.playoffs;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class WhatIfExceptionHandler {
    @ExceptionHandler(ComputeGate.BusyException.class)
    public ResponseEntity<String> busy() {
        return ResponseEntity.status(503).header("Retry-After", "5").body("Playoff simulations are busy; try again shortly");
    }

    @ExceptionHandler(com.rzs.stats.service.SyncPipeline.BusyException.class)
    public ResponseEntity<String> syncBusy(com.rzs.stats.service.SyncPipeline.BusyException exception) {
        return ResponseEntity.status(409).body(exception.getReason());
    }

}
