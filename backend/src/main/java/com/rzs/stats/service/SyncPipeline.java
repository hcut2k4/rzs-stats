package com.rzs.stats.service;

import com.rzs.stats.client.NeonSportzClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.util.HashSet;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.Semaphore;
import java.util.function.Supplier;

@Service
public class SyncPipeline {
    public enum Mode { QUICK, FULL, FORCE }
    private final Semaphore lock = new Semaphore(1);
    private final SyncService sync;
    private final QbStatsSyncService qb;
    private final CacheWarmingService warming;
    private final SyncSettingsService settings;
    private final NeonSportzClient client;
    private final Executor executor;
    private volatile boolean startup = true;
    private boolean warmRequired;
    private volatile Status status = new Status(false, "completed", null, null, null, null, null, null);

    @Autowired
    public SyncPipeline(SyncService sync, QbStatsSyncService qb, CacheWarmingService warming,
                        SyncSettingsService settings, NeonSportzClient client) {
        this(sync, qb, warming, settings, client, CompletableFuture::runAsync);
    }

    SyncPipeline(SyncService sync, QbStatsSyncService qb, CacheWarmingService warming,
                 SyncSettingsService settings, NeonSportzClient client, Executor executor) {
        this.sync = sync; this.qb = qb; this.warming = warming; this.settings = settings; this.client = client;
        this.executor = executor;
    }

    public record Status(boolean inProgress, String outcome, String message, Boolean success, Instant lastSyncTime, String operation, Instant startedAt, Instant completedAt) {}
    public synchronized Status getStatus() { return status; }
    public boolean needsStartup() { return startup; }

    public static class BusyException extends ResponseStatusException {
        public BusyException(String operation) { super(HttpStatus.CONFLICT, "Busy: " + operation + " is running"); }
    }

    private synchronized void acquire(String operation) {
        if (!lock.tryAcquire()) throw new BusyException(status.operation());
        status = new Status(true, "running", "Running", null, status.lastSyncTime(), operation, Instant.now(), null);
    }

    private synchronized void finish(Throwable failure) {
        lock.release();
        status = new Status(false, failure == null ? "completed" : "failed", failure == null ? "Completed" : failure.getMessage(),
                failure == null, failure == null ? sync.getStatus().lastSyncTime() : status.lastSyncTime(),
                status.operation(), status.startedAt(), Instant.now());
    }

    private <T> T execute(Supplier<T> work) {
        Throwable failure = null;
        try { return work.get(); }
        catch (RuntimeException | Error e) { failure = e; throw e; }
        finally { finish(failure); }
    }

    public <T> T exclusive(Supplier<T> work) { return exclusive("Sync", work); }
    public <T> T exclusive(String operation, Supplier<T> work) { acquire(operation); return execute(work); }

    public Map<String, Object> start(String message, Runnable work) {
        return start(message, message, work);
    }

    public Map<String, Object> start(String operation, String message, Runnable work) {
        return dispatch(operation, message, work, () -> {});
    }

    private Map<String, Object> dispatch(String operation, String message, Runnable work, Runnable validate) {
        acquire(operation);
        var workerStarted = new java.util.concurrent.atomic.AtomicBoolean();
        try {
            validate.run();
            var response = Map.<String, Object>of("success", true, "message", message);
            executor.execute(() -> {
                workerStarted.set(true);
                execute(() -> { work.run(); return null; });
            });
            return response;
        } catch (RuntimeException | Error e) {
            if (!workerStarted.get()) finish(e);
            throw e;
        }
    }

    public SyncService.SyncResult run(Mode mode) { return run(mode, mode == Mode.QUICK ? "Auto-sync" : mode == Mode.FORCE ? "Full re-sync" : "Nightly reconciliation"); }
    public SyncService.SyncResult run(Mode mode, String operation) { return exclusive(operation, () -> syncAndWarm(mode)); }
    public Map<String, Object> start(Mode mode) { return start(mode == Mode.FORCE ? "Full re-sync" : "Sync", "Sync started", () -> syncAndWarm(mode)); }

    public void warm() {
        warmRequired = true;
        warming.warmCaches();
        if (Boolean.FALSE.equals(warming.getStatus().success())) throw new IllegalStateException(warming.getStatus().message());
        warmRequired = false;
    }

    public Map<String, Object> startQb(Integer season) {
        return dispatch("Player & team stats re-sync" + (season == null ? "" : " (Season " + (season + 103) + ")"), "QB sync started" + (season == null ? "" : " for season " + season), () -> {
            long before = qb.committedChanges();
            try { if (season == null) qb.syncAll(); else qb.syncAll(season); }
            finally {
                if (qb.committedChanges() > before) {
                    settings.recordChanges();
                    warmRequired = true;
                }
            }
            warm();
            if (Boolean.FALSE.equals(qb.getStatus().success())) throw new IllegalStateException(qb.getStatus().message());
        }, () -> {
            if (season != null && (season < 0 || season > client.fetchLeagueInfo().getSeason()))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid season");
        });
    }

    private SyncService.SyncResult syncAndWarm(Mode requested) {
        settings.checked();
        var league = client.fetchLeagueInfo();
        var previous = settings.get();
        boolean full = requested != Mode.QUICK || startup || !Objects.equals(previous.getSeason(), league.getSeason())
                || !Objects.equals(previous.getStage(), league.getStage()) || !Objects.equals(previous.getWeek(), league.getWeek());
        var result = sync.sync(league, !full, requested == Mode.FORCE);
        if (result.changed() > 0) warmRequired = true;
        if (!result.success()) throw new IllegalStateException(result.message());
        full |= result.full();
        var weeks = new HashSet<>(result.changedWeeks());
        if (full) for (int week : sync.refreshWindow(league.getSeason())) weeks.add(new SyncService.Week(league.getSeason(), week));
        int qbChanges = qb.syncIncremental(league.getSeason(), weeks);
        if (qbChanges > 0) warmRequired = true;
        boolean changed = result.changed() > 0 || qbChanges > 0;
        settings.recordChanges(league, changed);
        warmRequired |= startup;
        if (warmRequired) warm();
        if (Boolean.FALSE.equals(qb.getStatus().success())) throw new IllegalStateException(qb.getStatus().message());
        if (full) settings.fullSucceeded();
        startup = false;
        return result;
    }
}
