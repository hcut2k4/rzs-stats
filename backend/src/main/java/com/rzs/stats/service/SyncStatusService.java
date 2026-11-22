package com.rzs.stats.service;

import com.rzs.stats.config.PlayoffCacheInvalidation;
import com.rzs.stats.model.entity.SyncStatusEntity;
import com.rzs.stats.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.*;

@Service
public class SyncStatusService {
    private final SyncStatusRepository status;
    private final GameRepository games;
    private final TeamRepository teams;
    private final EloConfigService config;
    private final PlayoffCacheInvalidation invalidation;

    public SyncStatusService(SyncStatusRepository status, GameRepository games, TeamRepository teams,
                             EloConfigService config, PlayoffCacheInvalidation invalidation) {
        this.status = status; this.games = games; this.teams = teams; this.config = config; this.invalidation = invalidation;
    }

    public Instant lastSyncAt() { return status.findById(1L).map(SyncStatusEntity::getLastSyncAt).orElse(null); }

    @Transactional(readOnly = true)
    public String fingerprint(int season) {
        return fingerprint(config.get());
    }

    @Transactional(readOnly = true)
    public String fingerprint(com.rzs.stats.model.dto.EloConfig eloConfig) {
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            try (var rows = games.fingerprintRows()) { rows.forEach(row -> update(digest, row)); }
            try (var rows = teams.fingerprintRows()) { rows.forEach(row -> update(digest, row)); }
            update(digest, new Object[]{eloConfig});
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    private static void update(MessageDigest digest, Object[] row) {
        for (var value : row) {
            var text = value == null ? "-1:" : value.toString().length() + ":" + value;
            digest.update(text.getBytes(StandardCharsets.UTF_8));
        }
        digest.update((byte) '\n');
    }

    public void failed() {
        invalidation.failed();
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive())
            org.springframework.transaction.interceptor.TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
    }

    public static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    @Transactional
    public void successful(int season) {
        var fingerprint = fingerprint(season);
        var row = status.findById(1L).orElseGet(SyncStatusEntity::new);
        boolean changed = !fingerprint.equals(row.getLastFingerprint());
        row.update(Instant.now(), fingerprint);
        status.save(row);
        if (changed) invalidation.changed();
    }
}
