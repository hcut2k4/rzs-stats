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
                if (existing.add(row.team().teamId())) snapshots.save(new OddsSnapshotEntity(response, row));
            }
            snapshots.flush();
        });
    }
    public synchronized boolean saveIfAbsent(int season, int week, java.util.function.Supplier<OddsService.Response> compute) {
        return Boolean.TRUE.equals(transactions.execute(transaction -> {
            if (snapshots.existsBySeasonAndNextWeek(season, week)) return false;
            var response = compute.get();
            for (var conference : response.conferences()) for (var row : conference.teams()) {
                snapshots.save(new OddsSnapshotEntity(response, row));
            }
            snapshots.flush();
            return true;
        }));
    }

}
