package com.rzs.stats.playoffs;

import com.rzs.stats.repository.OddsSnapshotRepository;
import com.rzs.stats.model.entity.OddsSnapshotEntity;
import com.rzs.stats.service.EloService;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

@Service
public class OddsHistoryService {
    public record TeamOdds(EloService.Team team, double playoffs, double division, double oneSeed) {}
    public record Snapshot(Integer week, Instant computedAt, int simulations, List<TeamOdds> teams) {}
    public record History(int season, List<Snapshot> snapshots) {}
    public record Backfill(int season, int created, int skipped) {}

    private final SeasonStateLoader loader;
    private final OddsSnapshotRepository snapshots;
    private final OddsSnapshotService writer;
    private final OddsService odds;

    public OddsHistoryService(SeasonStateLoader loader, OddsSnapshotRepository snapshots, OddsSnapshotService writer, OddsService odds) {
        this.loader = loader;
        this.snapshots = snapshots;
        this.writer = writer;
        this.odds = odds;
    }

    public History history(Integer season, String team) {
        var state = loader.load(season);
        var identities = new HashMap<Integer, EloService.Team>();
        state.identities().values().forEach(t -> identities.put(t.teamId(), t));
        var grouped = new LinkedHashMap<Integer, List<OddsSnapshotEntity>>();
        snapshots.findBySeasonOrderByNextWeekAscTeamIdAsc(state.season()).stream()
                .filter(row -> row.getRules().equals("madden"))
                .forEach(row -> grouped.computeIfAbsent(row.getNextWeek(), key -> new ArrayList<>()).add(row));
        var result = new ArrayList<Snapshot>();
        grouped.forEach((week, rows) -> {
            var first = rows.getFirst();
            var teams = rows.stream().filter(row -> identities.containsKey(row.getTeamId()))
                    .filter(row -> team == null || identities.get(row.getTeamId()).abbrName().equalsIgnoreCase(team))
                    .map(row -> new TeamOdds(identities.get(row.getTeamId()), row.getPlayoffs(), row.getDivision(), row.getOneSeed()))
                    .sorted(Comparator.comparing(row -> row.team().abbrName())).toList();
            result.add(new Snapshot(week == -1 ? null : week, first.getComputedAt(), first.getSimulations(), teams));
        });
        result.sort(Comparator.comparing(Snapshot::week, Comparator.nullsLast(Comparator.naturalOrder())));
        return new History(state.season(), List.copyOf(result));
    }

    public Backfill backfill(int season) {
        var current = loader.load(season);
        int created = 0, skipped = 0;
        for (int week = 1; current.throughWeek() != null && week <= current.throughWeek(); week++) {
            int selectedWeek = week;
            if (writer.saveIfAbsent(season, week, () -> odds.historical(loader.loadAtStart(season, selectedWeek)))) created++;
            else skipped++;
        }
        return new Backfill(season, created, skipped);
    }
}
