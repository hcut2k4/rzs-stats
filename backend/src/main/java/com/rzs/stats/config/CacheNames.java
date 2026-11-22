package com.rzs.stats.config;

import org.springframework.cache.CacheManager;
import org.springframework.boot.autoconfigure.cache.CacheManagerCustomizer;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.interceptor.CacheResolver;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;
import java.util.List;

@Configuration
public class CacheNames {
    public static final String ALL = "allStatsCaches";

    @Bean
    public CacheManagerCustomizer<CaffeineCacheManager> whatIfCache() {
        return manager -> manager.registerCustomCache("playoffWhatIf", Caffeine.newBuilder()
                .maximumSize(128).expireAfterWrite(Duration.ofHours(24)).build());
    }

    @Bean(ALL)
    public CacheResolver allStatsCaches(CacheManager manager) {
        List<String> names = List.of("standings", "games", "weeks", "seasons", "seasonTrends",
                "weeklyTrends", "seasonGames", "eloHistory", "qbStats", "teamEfficiency", "playoffPicture", "playoffOdds", "leverage", "eloCalibration", "playoffClinch", "playoffWhatIf", "playoffPath");
        return context -> names.stream().map(manager::getCache).toList();
    }
}
