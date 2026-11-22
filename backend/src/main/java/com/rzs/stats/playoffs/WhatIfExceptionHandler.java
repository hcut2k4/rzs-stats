package com.rzs.stats.playoffs;

import com.rzs.stats.controller.PlayoffsWhatIfController;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = PlayoffsWhatIfController.class)
public class WhatIfExceptionHandler {
    @ExceptionHandler(WhatIfService.BusyException.class)
    public ResponseEntity<String> busy() {
        return ResponseEntity.status(503).body("Playoff simulations are busy; try again shortly");
    }
}
