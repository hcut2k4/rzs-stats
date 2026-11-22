package com.rzs.stats.config;

import org.springframework.cache.CacheManager;
import org.springframework.cache.interceptor.CacheResolver;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class CacheNames {
    public static final String ALL = "allStatsCaches";

    @Bean(ALL)
    public CacheResolver allStatsCaches(CacheManager manager) {
        List<String> names = List.of("standings", "games", "weeks", "seasons", "seasonTrends",
                "weeklyTrends", "seasonGames", "eloHistory", "qbStats", "teamEfficiency", "playoffPicture", "playoffOdds");
        return context -> names.stream().map(manager::getCache).toList();
    }
}
