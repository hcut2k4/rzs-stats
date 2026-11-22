package com.rzs.stats.config;

import org.springframework.cache.CacheManager;
import org.springframework.boot.autoconfigure.cache.CacheManagerCustomizer;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.interceptor.CacheResolver;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;
import java.util.stream.Stream;

@Configuration
public class CacheNames {
    public static final String ALL = "allStatsCaches";
    public static final String SITE = "siteStatsCaches";
    public static final List<String> PLAYOFF = List.of("playoffOdds", "playoffBaseline", "playoffChampionship", "leverage",
            "playoffClinch", "playoffPath", "playoffWhatIf", "playoffScenarios");
    private static final List<String> SITE_NAMES = List.of("standings", "games", "weeks", "seasons", "seasonTrends",
            "weeklyTrends", "seasonGames", "eloHistory", "qbStats", "teamEfficiency", "playoffPicture", "eloCalibration");

    @Bean
    public CacheManagerCustomizer<CaffeineCacheManager> playoffCaches() {
        return manager -> PLAYOFF.forEach(name -> manager.registerCustomCache(name, Caffeine.newBuilder()
                .maximumSize(name.equals("playoffScenarios") ? 2 : name.equals("playoffBaseline") ? 8 : 128).build()));
    }

    @Bean
    public PlayoffCacheInvalidation playoffCacheInvalidation(CacheManager manager) { return new PlayoffCacheInvalidation(manager); }

    @Bean(ALL)
    public CacheResolver allStatsCaches(CacheManager manager) {
        return context -> Stream.concat(SITE_NAMES.stream(), PLAYOFF.stream()).map(manager::getCache).toList();
    }

    @Bean(SITE)
    public CacheResolver siteStatsCaches(CacheManager manager) {
        return context -> SITE_NAMES.stream().map(manager::getCache).toList();
    }
}
