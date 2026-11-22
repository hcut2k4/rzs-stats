package com.rzs.stats.controller;

import com.rzs.stats.service.EloCalibrationService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class EloCalibrationController {
    private final EloCalibrationService calibration;

    public EloCalibrationController(EloCalibrationService calibration) {
        this.calibration = calibration;
    }

    @GetMapping("/api/playoffs/calibration")
    public EloCalibrationService.Report calibration(@RequestParam(required = false) Integer season) {
        return calibration.report(season);
    }
}
