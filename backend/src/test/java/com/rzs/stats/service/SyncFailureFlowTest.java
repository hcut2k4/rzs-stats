package com.rzs.stats.service;

import com.rzs.stats.client.NeonSportzClient;
import com.rzs.stats.config.*;
import com.rzs.stats.model.entity.TeamEntity;
import com.rzs.stats.playoffs.SimulationService;
import com.rzs.stats.repository.*;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.cache.CacheType;
import org.springframework.boot.test.autoconfigure.core.AutoConfigureCache;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.*;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import static org.assertj.core.api.Assertions.*;

@DataJpaTest(showSql = false)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@AutoConfigureCache(cacheProvider = CacheType.CAFFEINE)
@EnableCaching
@Import({CacheNames.class, SyncService.class, SyncStatusService.class, EloConfigService.class, NeonSportzClient.class})
class SyncFailureFlowTest {
    static final HttpServer upstream;
    static volatile boolean failGames;
    static volatile boolean renamed;
    static {
        try {
            upstream = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            upstream.createContext("/leagues/test/", exchange -> {
                String path = exchange.getRequestURI().getPath();
                boolean failure = path.endsWith("/games/") && failGames;
                String body = path.endsWith("/teams/")
                        ? "{\"results\":[{\"teamId\":1,\"abbrName\":\"A\",\"displayName\":\"" + (renamed ? "New name" : "Original") + "\",\"conferenceName\":\"AFC\",\"divisionName\":\"East\"}],\"next\":null}"
                        : path.endsWith("/games/") ? "{\"results\":[],\"next\":null}" : "{\"season\":0}";
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(failure ? 500 : 200, bytes.length);
                try (var output = exchange.getResponseBody()) { output.write(bytes); }
            });
            upstream.start();
        } catch (java.io.IOException e) { throw new ExceptionInInitializerError(e); }
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("rzs.neonsportz.base-url", () -> "http://127.0.0.1:" + upstream.getAddress().getPort());
        registry.add("rzs.neonsportz.league", () -> "test");
    }

    @Autowired SyncService sync;
    @Autowired SyncStatusRepository status;
    @Autowired TeamRepository teams;
    @Autowired CacheManager caches;

    @BeforeEach
    void setup() {
        status.deleteAll(); teams.deleteAll();
        caches.getCacheNames().forEach(name -> caches.getCache(name).clear());
        failGames = false; renamed = false;
        var team = new TeamEntity(); team.setTeamId(1); team.setAbbrName("A"); team.setDisplayName("Original");
        team.setConference("AFC"); team.setDivision("East"); teams.saveAndFlush(team);
        assertThat(sync.sync().success()).isTrue();
        CacheNames.PLAYOFF.forEach(name -> caches.getCache(name).put("keep", "value"));
        SimulationService.resetSeedings();
    }

    @AfterAll
    static void stop() { upstream.stop(0); }

    @ParameterizedTest
    @ValueSource(strings = {"sync", "force", "verbose"})
    void failureAfterTeamUpdateRollsBackAndEvictsWithoutAdvancingSuccessfulStatus(String variant) {
        var before = status.findById(1L).orElseThrow();
        renamed = true; failGames = true;
        boolean success = switch (variant) {
            case "force" -> sync.syncForce().success();
            case "verbose" -> sync.syncVerbose().success();
            default -> sync.sync().success();
        };
        assertThat(success).isFalse();
        assertThat(teams.findByTeamId(1).orElseThrow().getDisplayName()).isEqualTo("Original");
        var after = status.findById(1L).orElseThrow();
        assertThat(after.getLastFingerprint()).isEqualTo(before.getLastFingerprint());
        assertThat(after.getLastSyncAt()).isEqualTo(before.getLastSyncAt());
        CacheNames.PLAYOFF.forEach(name -> assertThat(caches.getCache(name).get("keep")).isNull());
        assertThat(SimulationService.seedings()).isZero();
    }

    @Test
    void unchangedSyncKeepsEveryPlayoffCacheAndDoesNotSimulate() {
        assertThat(sync.sync().success()).isTrue();
        CacheNames.PLAYOFF.forEach(name -> assertThat(caches.getCache(name).get("keep", String.class)).isEqualTo("value"));
        assertThat(SimulationService.seedings()).isZero();
    }
}
