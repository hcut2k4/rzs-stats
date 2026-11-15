package com.rzs.stats.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminAuthController {

    @GetMapping("/auth")
    public Map<String, Object> auth() {
        return Map.of("ok", true);
    }
}
