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

    public String fingerprint(int season) {
        var rows = new ArrayList<String>();
        rows.add("season:" + season);
        games.findBySeasonIndex(season).forEach(g -> rows.add("game:" + Arrays.asList(g.getGameId(), g.getStatus(),
                g.getHomeScore(), g.getAwayScore(), g.getWeekIndex(), g.getStageIndex(),
                g.getHomeTeam() == null ? null : g.getHomeTeam().getTeamId(),
                g.getAwayTeam() == null ? null : g.getAwayTeam().getTeamId())));
        teams.findAll().forEach(t -> rows.add("team:" + Arrays.asList(t.getTeamId(), t.getAbbrName(), t.getConference(), t.getDivision())));
        rows.add("config:" + config.get());
        Collections.sort(rows);
        return hash(String.join("\n", rows));
    }

    public String configHash() { return hash(config.get().toString()); }

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
