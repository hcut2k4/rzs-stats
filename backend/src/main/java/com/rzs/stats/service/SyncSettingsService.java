package com.rzs.stats.service;

import com.rzs.stats.model.entity.SyncSettingsEntity;
import com.rzs.stats.model.ns.NsLeague;
import com.rzs.stats.repository.SyncSettingsRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;

@Service
public class SyncSettingsService {
    private final SyncSettingsRepository repository;
    private final int defaultInterval;
    private static final int MAX_INTERVAL_MINUTES = 10080;

    public SyncSettingsService(SyncSettingsRepository repository, @Value("${rzs.sync.interval-minutes:120}") int defaultInterval) {
        if (!valid(defaultInterval)) throw new IllegalArgumentException("Invalid sync interval");
        this.repository = repository;
        this.defaultInterval = defaultInterval;
    }

    @Transactional
    public SyncSettingsEntity get() {
        return repository.findById(1L).orElseGet(() -> {
            var row = new SyncSettingsEntity();
            row.setIntervalMinutes(defaultInterval);
            return repository.save(row);
        });
    }

    public record Settings(int intervalMinutes, Instant lastCheckedAt, Instant lastChangedAt,
                           Instant nextRunAt, Instant lastFullSuccessAt) {}

    public Settings view() {
        var row = get();
        return new Settings(row.getIntervalMinutes(), row.getLastCheckedAt(), row.getLastChangedAt(),
                row.getIntervalMinutes() == 0 ? null : row.getLastCheckedAt() == null ? Instant.now()
                        : row.getLastCheckedAt().plusSeconds(row.getIntervalMinutes() * 60L), row.getLastFullSuccessAt());
    }

    @Transactional
    public Settings update(Integer interval) {
        if (interval == null || !valid(interval)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid sync interval");
        get();
        repository.updateInterval(interval);
        return view();
    }

    @Transactional
    public void checked() {
        get();
        repository.updateChecked(Instant.now());
    }

    @Transactional
    public void recordChanges(NsLeague league, boolean changed) {
        get();
        repository.updateChanges(league.getSeason(), league.getStage(), league.getWeek(), changed, Instant.now());
    }

    @Transactional
    public void fullSucceeded() {
        get();
        repository.updateFullSuccess(Instant.now());
    }

    private static boolean valid(int minutes) { return minutes >= 0 && minutes <= MAX_INTERVAL_MINUTES; }
}
