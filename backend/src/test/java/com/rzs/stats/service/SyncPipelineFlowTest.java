package com.rzs.stats.service;

import com.rzs.stats.client.NeonSportzClient;
import com.rzs.stats.config.*;
import com.rzs.stats.controller.AdminController;
import com.rzs.stats.playoffs.*;
import com.rzs.stats.repository.*;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.cache.CacheType;
import org.springframework.boot.test.autoconfigure.core.AutoConfigureCache;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@DataJpaTest(showSql = false, properties = {"playoffs.simulations=10", "playoffs.leverage-simulations=10"})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@AutoConfigureCache(cacheProvider = CacheType.CAFFEINE)
@EnableCaching
@Import({CacheNames.class, SyncService.class, SyncStatusService.class, SyncSettingsService.class,
        NeonSportzClient.class, QbStatsSyncService.class, QbStatsWeekWriter.class, CacheWarmingService.class,
        StatsService.class, QbStatsService.class, QbStatsCalculator.class, TeamEfficiencyService.class,
        TeamEfficiencyCalculator.class, EloHistoryService.class, EloQueryService.class, EloService.class,
        EloConfigService.class, OwnerChangeService.class, ComputeGate.class, SeasonStateLoader.class,
        OddsService.class, OddsSnapshotService.class, LeverageService.class, ChampionshipService.class,
        SimulationService.class, ClinchService.class})
class SyncPipelineFlowTest {
    static HttpServer upstream;
    static final List<String> requests = new CopyOnWriteArrayList<>();
    static volatile int score = 20, season = 0, stage = 1, leagueWeek = 21, playedWeek = 20, attempts = 20;
    static volatile boolean seasonOver, preseason;
    static volatile boolean renamed, failStats;
    static volatile Integer failStatsWeek;
    static volatile CountDownLatch entered, release;

    @BeforeAll
    static void start() throws Exception {
        upstream = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        upstream.createContext("/leagues/test/", exchange -> {
            var uri = exchange.getRequestURI();
            requests.add(uri.toString());
            if (entered != null && uri.getPath().endsWith("/games/")) {
                entered.countDown();
                try { release.await(10, TimeUnit.SECONDS); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            }
            String path = uri.getPath();
            String body;
            if (path.contains("/stats/")) {
                if (path.contains("/passing/")) body = page("{\"player__rosterId\":\"qb-a\",\"player__fullName\":\"A QB\",\"player__position\":\"QB\",\"team__abbrName\":\"A\",\"passTotalAtt\":" + attempts + "},"
                        + "{\"player__rosterId\":\"qb-b\",\"player__fullName\":\"B QB\",\"player__position\":\"QB\",\"team__abbrName\":\"B\",\"passTotalAtt\":" + attempts + "}");
                else if (path.contains("/teams/")) body = page("{\"team__abbrName\":\"A\"},{\"team__abbrName\":\"B\"}");
                else body = page("");
            } else if (path.endsWith("/teams/")) {
                body = page("{\"id\":1,\"teamId\":1,\"abbrName\":\"A\",\"displayName\":\"" + (renamed ? "Renamed" : "Original")
                        + "\",\"conferenceName\":\"AFC\",\"divisionName\":\"East\"},{\"id\":2,\"teamId\":2,\"abbrName\":\"B\",\"displayName\":\"B\",\"conferenceName\":\"AFC\",\"divisionName\":\"East\"}");
            } else if (path.endsWith("/games/")) {
                String query = uri.getQuery();
                var games = new ArrayList<String>();
                for (int i = 0; i < 20; i++) {
                    int week = i < 10 ? 0 : i == 10 ? playedWeek : 22;
                    if (query.contains("weekIndex=") && !query.contains("weekIndex=" + week + "&")) continue;
                    games.add("{\"gameId\":" + i + ",\"pk\":" + (100+i) + ",\"seasonIndex\":" + season + ",\"stageIndex\":" + (preseason ? 0 : 1) + ",\"weekIndex\":" + week
                            + ",\"status\":" + (seasonOver || i <= 10 ? 2 : 1) + ",\"homeScore\":" + (i == 10 ? score : 20) + ",\"awayScore\":10,\"homeTeam\":{\"teamId\":1},\"awayTeam\":{\"teamId\":2}}");
                }
                body = page(String.join(",", games));
            } else body = "{\"season\":" + season + ",\"stage\":" + stage + ",\"week\":" + leagueWeek + "}";
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(path.contains("/stats/passing/") && (failStats || failStatsWeek != null && Objects.toString(uri.getQuery(), "").matches(".*weekIndex=" + failStatsWeek + "(&.*)?")) ? 500 : 200, bytes.length);
            try (var out = exchange.getResponseBody()) { out.write(bytes); }
        });
        upstream.start();
    }

    static String page(String rows) { return "{\"results\":[" + rows + "],\"next\":null}"; }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("rzs.neonsportz.base-url", () -> "http://127.0.0.1:" + upstream.getAddress().getPort());
        registry.add("rzs.neonsportz.league", () -> "test");
    }

    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired SyncService sync;
    @Autowired SyncSettingsService settings;
    @Autowired QbStatsSyncService qb;
    @Autowired NeonSportzClient client;
    @Autowired EloConfigService elo;
    @Autowired GameRepository games;
    @Autowired TeamRepository teams;
    @Autowired QbGameStatRepository qbRows;
    @Autowired TeamGameStatRepository teamRows;
    @Autowired SyncStatusRepository statuses;
    @Autowired SyncSettingsRepository settingRows;
    @Autowired OddsSnapshotRepository snapshots;
    @Autowired CacheManager caches;
    @SpyBean CacheWarmingService warming;
    @SpyBean LeverageService leverage;
    SyncPipeline pipeline;
    MockMvc http;

    @BeforeEach
    void setup() {
        entered = null; release = null; failStatsWeek = null; renamed = false; failStats = false; score = 20; season = 0; seasonOver = false; preseason = false; attempts = 20; stage = 1; leagueWeek = 21; playedWeek = 20;
        snapshots.deleteAll(); qbRows.deleteAll(); teamRows.deleteAll(); games.deleteAll(); teams.deleteAll();
        statuses.deleteAll(); settingRows.deleteAll();
        caches.getCacheNames().forEach(n -> caches.getCache(n).clear());
        pipeline = new SyncPipeline(sync, qb, warming, settings, client);
        http = MockMvcBuilders.standaloneSetup(new AdminController(client, games, warming, elo, qb, pipeline, settings))
                .setControllerAdvice(new com.rzs.stats.playoffs.WhatIfExceptionHandler()).build();
        pipeline.run(SyncPipeline.Mode.QUICK);
        requests.clear(); clearInvocations(warming);
    }

    @AfterAll
    static void stop() { upstream.stop(0); }


    @Test
    void partialWarmingFailureRemainsDueForTheNextIdlePoll() {
        LeverageService target = AopTestUtils.getUltimateTargetObject(leverage);
        doThrow(new IllegalStateException("warm failed")).doCallRealMethod().when(target).matrix(any(), any(), eq("madden"));
        score++;
        assertThatThrownBy(() -> pipeline.run(SyncPipeline.Mode.QUICK)).hasMessageContaining("playoff leverage");
        clearInvocations(warming);
        pipeline.run(SyncPipeline.Mode.QUICK);
        verify(warming).warmCaches();
        assertThat(warming.getStatus().success()).isTrue();
        assertThat(caches.getCache("leverage").getNativeCache()).isInstanceOf(com.github.benmanes.caffeine.cache.Cache.class);
    }

    @Test
    void manualQbRepairRecordsCommittedChangesBeforeALaterWeekFails() {
        var before = settings.view().lastChangedAt();
        var manual = new SyncPipeline(sync, qb, warming, settings, client, Runnable::run);
        manual.startQb(0);
        assertThat(settings.view().lastChangedAt()).isEqualTo(before);
        attempts++;
        requests.clear();
        failStatsWeek = 20;
        assertThatThrownBy(() -> manual.startQb(0)).hasMessageContaining("QB sync failed");
        assertThat(qb.getStatus().success()).isFalse();
        assertThat(requests).anyMatch(r -> r.contains("/stats/passing/") && r.matches(".*weekIndex=20(&.*)?"));
        assertThat(qbRows.findInScope(0, 20, 20)).hasSize(2).allMatch(row -> row.getPassAtt() == attempts - 1);
        assertThat(qbRows.findAll()).anyMatch(row -> row.getWeekIndex() == 0 && row.getPassAtt() == attempts);
        assertThat(settings.view().lastChangedAt()).isAfter(before);
        failStatsWeek = null;
        manual.startQb(0);
        assertThat(manual.getStatus().success()).isTrue();
    }


    @Test
    void idleQuickPollKeepsCachesAndSkipsWritesAndStatRequests() {
        var before = statuses.findById(1L).orElseThrow().getLastFingerprint();
        caches.getCache("playoffOdds").put("keep", "value");
        var result = pipeline.run(SyncPipeline.Mode.QUICK);
        assertThat(result.changed()).isZero();
        assertThat(requests).hasSize(3).noneMatch(r -> r.contains("/stats/") || r.contains("/teams/"));
        assertThat(statuses.findById(1L).orElseThrow().getLastFingerprint()).isEqualTo(before);
        assertThat(caches.getCache("playoffOdds").get("keep", String.class)).isEqualTo("value");
        verify(warming, never()).warmCaches();
    }

    @Test
    void changedScoreFetchesAffectedWeekThenWarmsQbAndEfficiencyCachesOnce() {
        score = 24;
        pipeline.run(SyncPipeline.Mode.QUICK);
        assertThat(requests.stream().filter(r -> r.contains("/stats/passing/"))).hasSize(1).allMatch(r -> r.contains("weekIndex=20"));
        verify(warming).warmCaches();
        assertThat(caches.getCache("qbStats").getNativeCache()).isInstanceOf(com.github.benmanes.caffeine.cache.Cache.class);
        var qbCache = (com.github.benmanes.caffeine.cache.Cache<?, ?>) caches.getCache("qbStats").getNativeCache();
        var efficiencyCache = (com.github.benmanes.caffeine.cache.Cache<?, ?>) caches.getCache("teamEfficiency").getNativeCache();
        assertThat(qbCache.estimatedSize()).isGreaterThan(0);
        assertThat(efficiencyCache.estimatedSize()).isGreaterThan(0);
    }

    @Test
    void firstPollAfterRestartFetchesTeamsAndWarmsEvenWithoutDataChanges() {
        var restarted = new SyncPipeline(sync, qb, warming, settings, client);
        assertThat(restarted.run(SyncPipeline.Mode.QUICK).changed()).isZero();
        assertThat(requests).anyMatch(r -> r.contains("/teams/?size=100"));
        verify(warming).warmCaches();
    }

    @Test
    void quickWindowUsesWeekTwentyBeforeWeekTwentyTwo() {
        assertThat(sync.quickWindow(0)).containsExactly(22, 20);
        pipeline.run(SyncPipeline.Mode.QUICK);
        assertThat(requests).anyMatch(r -> r.matches(".*weekIndex=20(&.*)?")).anyMatch(r -> r.contains("weekIndex=22&"));
        assertThat(requests).noneMatch(r -> r.contains("weekIndex=21&"));
    }

    @Test
    void movedGameReportsBothWeeksAndRemovesStatsFromTheOldWeek() {
        playedWeek = 19;
        var result = pipeline.run(SyncPipeline.Mode.FULL);
        assertThat(result.changedWeeks()).contains(new SyncService.Week(0, 20), new SyncService.Week(0, 19));
        assertThat(teamRows.findInScope(0, 20, 20)).isEmpty();
        assertThat(teamRows.findInScope(0, 19, 19)).hasSize(2);
    }

    @Test
    void stageAndWeekChangesEachEscalateToFull() {
        stage = 2;
        pipeline.run(SyncPipeline.Mode.QUICK);
        assertThat(requests).anyMatch(r -> r.contains("/teams/?"));
        requests.clear(); leagueWeek++;
        pipeline.run(SyncPipeline.Mode.QUICK);
        assertThat(requests).anyMatch(r -> r.contains("/teams/?"));
    }

    @Test
    void seasonChangeEscalatesQuickPollToFull() {
        season = 1;
        var result = pipeline.run(SyncPipeline.Mode.QUICK);
        assertThat(result.full()).isTrue();
        assertThat(requests).anyMatch(r -> r.contains("/teams/?"));
        assertThat(requests).anyMatch(r -> r.contains("/games/?") && r.contains("seasonIndex=1") && !r.contains("weekIndex="));
        assertThat(settings.get().getSeason()).isEqualTo(1);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void quickPollFetchesWholeSeasonAfterCompletionOrDuringPreseason(boolean beforeSeason) {
        preseason = beforeSeason;
        seasonOver = !beforeSeason;
        stage = beforeSeason ? 0 : 1;
        pipeline.run(SyncPipeline.Mode.FULL);
        requests.clear();
        assertThat(sync.quickWindow(0)).isEmpty();
        pipeline.run(SyncPipeline.Mode.QUICK);
        assertThat(requests.stream().filter(r -> r.contains("/games/?"))).hasSize(1)
                .allMatch(r -> r.contains("seasonIndex=0") && !r.contains("weekIndex="));
        assertThat(requests).noneMatch(r -> r.contains("/teams/?"));
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void settingsWriteFailureAfterCommittedChangesStillWarmsOnIdleRetry(boolean gameChange) {
        settings.checked();
        jdbc.execute("alter table sync_settings add constraint reject_new_changes check (last_changed_at <= last_checked_at)");
        try {
            if (gameChange) score++; else attempts++;
            assertThatThrownBy(() -> pipeline.run(gameChange ? SyncPipeline.Mode.QUICK : SyncPipeline.Mode.FULL))
                    .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
            if (gameChange) assertThat(games.findBySeasonIndex(0)).anyMatch(g -> g.getHomeScore() == score);
            else assertThat(qbRows.findInScope(0, 20, 20)).isNotEmpty().allMatch(q -> q.getPassAtt() == attempts);
            verify(warming, never()).warmCaches();
        } finally { jdbc.execute("alter table sync_settings drop constraint reject_new_changes"); }
        requests.clear();
        assertThat(pipeline.run(SyncPipeline.Mode.QUICK).changed()).isZero();
        assertThat(requests).noneMatch(r -> r.contains("/stats/"));
        verify(warming).warmCaches();
    }

    @Test
    void invalidQbSeasonsReportFailureAndReleaseGuard() throws Exception {
        for (int invalid : List.of(-1, 1)) {
            http.perform(post("/api/admin/sync/qb").param("season", Integer.toString(invalid)))
                    .andExpect(status().isBadRequest());
            assertThat(pipeline.getStatus().outcome()).isEqualTo("failed");
            assertThat(pipeline.getStatus().inProgress()).isFalse();
            assertThat(pipeline.run(SyncPipeline.Mode.QUICK).success()).isTrue();
        }
    }

    @Test
    void verboseEndpointReturnsThePipelineGameLog() throws Exception {
        http.perform(post("/api/admin/sync/verbose")).andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.log[0]").value("[LEAGUE] season=0, stage=1, week=21"))
                .andExpect(jsonPath("$.log[1]").value(org.hamcrest.Matchers.startsWith("[GAME]")));
    }

    @Test
    void teamMetadataChangesTriggerOneWarm() {
        renamed = true;
        pipeline.run(SyncPipeline.Mode.FULL);
        assertThat(teams.findByTeamId(1).orElseThrow().getDisplayName()).isEqualTo("Renamed");
        verify(warming).warmCaches();
        assertThat(settings.view().lastChangedAt()).isNotNull();
    }

    @Test
    void failedQbWeekIsRetriedOnNextIdlePoll() {
        failStats = true; score++;
        assertThatThrownBy(() -> pipeline.run(SyncPipeline.Mode.QUICK)).isInstanceOf(IllegalStateException.class);
        assertThat(pipeline.getStatus().outcome()).isEqualTo("failed");
        failStats = false; requests.clear();
        pipeline.run(SyncPipeline.Mode.QUICK);
        assertThat(requests).anyMatch(r -> r.contains("/stats/passing/") && r.contains("weekIndex=20"));
        assertThat(pipeline.getStatus().success()).isTrue();
    }

    @Test
    void lockIsReservedBeforeAsyncHandoffAndEveryEntryPointRejectsOverlap() throws Exception {
        entered = new CountDownLatch(1); release = new CountDownLatch(1);
        var running = CompletableFuture.runAsync(() -> pipeline.run(SyncPipeline.Mode.QUICK));
        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(pipeline.getStatus().operation()).isEqualTo("Auto-sync");
            assertThat(pipeline.getStatus().startedAt()).isNotNull();
            http.perform(get("/api/admin/status")).andExpect(status().isOk())
                    .andExpect(jsonPath("$.pipeline.operation").value("Auto-sync"))
                    .andExpect(jsonPath("$.pipeline.startedAt").isNotEmpty())
                    .andExpect(jsonPath("$.settings.lastCheckedAt").isNotEmpty());
            for (String endpoint : List.of("/sync", "/sync/force", "/sync/verbose", "/cache/warm", "/sync/qb"))
                http.perform(post("/api/admin" + endpoint)).andExpect(status().isConflict())
                        .andExpect(content().string("Busy: Auto-sync is running"));
        } finally { release.countDown(); running.get(10, TimeUnit.SECONDS); entered = null; }
    }

    @Test
    void asyncOperationsExposeTheirLabelBeforeWorkerStarts() {
        for (var entry : Map.of(SyncPipeline.Mode.FULL, "Sync", SyncPipeline.Mode.FORCE, "Full re-sync").entrySet()) {
            var queued = new ArrayList<Runnable>();
            var pending = new SyncPipeline(sync, qb, warming, settings, client, queued::add);
            pending.start(entry.getKey());
            assertThat(queued).hasSize(1);
            assertThat(pending.getStatus().inProgress()).isTrue();
            assertThat(pending.getStatus().operation()).isEqualTo(entry.getValue());
            assertThat(pending.getStatus().startedAt()).isNotNull();
            assertThatThrownBy(() -> pending.startQb(null)).hasMessageContaining("Busy: " + entry.getValue() + " is running");
        }
        var pending = new SyncPipeline(sync, qb, warming, settings, client, command -> {});
        pending.startQb(0);
        assertThat(pending.getStatus().operation()).isEqualTo("Player & team stats re-sync (Season 103)");
    }

    @Test
    void settingsAllowOffAndRejectInvalidIntervals() throws Exception {
        http.perform(put("/api/admin/sync/settings").contentType("application/json").content("{\"intervalMinutes\":0}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.intervalMinutes").value(0)).andExpect(jsonPath("$.nextRunAt").doesNotExist());
        for (String value : List.of("-1", "10081", "null"))
            http.perform(put("/api/admin/sync/settings").contentType("application/json").content("{\"intervalMinutes\":" + value + "}"))
                    .andExpect(status().isBadRequest());
    }
}
