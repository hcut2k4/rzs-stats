package com.rzs.stats.playoffs;

import com.rzs.stats.model.entity.OddsSnapshotEntity;
import com.rzs.stats.repository.OddsSnapshotRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.HashSet;

@Service
public class OddsSnapshotService {
    private final OddsSnapshotRepository snapshots;

    private final TransactionTemplate transactions;

    public OddsSnapshotService(OddsSnapshotRepository snapshots, PlatformTransactionManager manager) {
        this.snapshots = snapshots;
        this.transactions = new TransactionTemplate(manager);
    }

    public synchronized void save(OddsService.Response response) {
        if (!response.rules().equals("madden")) return;
        transactions.executeWithoutResult(transaction -> {
            int week = response.nextWeek() == null ? -1 : response.nextWeek();
            var existing = new HashSet<Integer>();
            snapshots.findBySeasonAndNextWeek(response.season(), week).forEach(row -> existing.add(row.getTeamId()));
            for (var conference : response.conferences()) for (var row : conference.teams()) {
                if (existing.add(row.team().teamId())) snapshots.save(entity(response, row, "live"));
            }
            snapshots.flush();
        });
    }
    public boolean saveIfAbsent(int season, int week, java.util.function.Supplier<OddsService.Response> compute) {
        if (snapshots.existsBySeasonAndNextWeek(season, week)) return false;
        var response = compute.get();
        synchronized (this) {
            return Boolean.TRUE.equals(transactions.execute(transaction -> {
                if (snapshots.existsBySeasonAndNextWeek(season, week)) return false;
                for (var conference : response.conferences()) for (var row : conference.teams())
                    snapshots.save(entity(response, row, "backfill"));
                snapshots.flush();
                return true;
            }));
        }
    }

    private OddsSnapshotEntity entity(OddsService.Response response, OddsService.Row row, String origin) {
        var entity = new OddsSnapshotEntity(response, row);
        var provenance = response.provenance();
        if (provenance != null) entity.provenance(provenance.eloConfigHash(), provenance.inputFingerprint(), provenance.modelVersion(), origin);
        return entity;
    }
}
