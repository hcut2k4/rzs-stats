package com.rzs.stats.playoffs;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class WhatIfExceptionHandler {
    @ExceptionHandler(ComputeGate.BusyException.class)
    public ResponseEntity<String> busy() {
        return ResponseEntity.status(503).body("Playoff simulations are busy; try again shortly");
    }
}
